// 未接続の新方式用。署名検証後のStripeイベント・取得済みの正本だけを受け取る。
import { CALENDAR_POLICY_VERSION, calendarBoundary, calendarPeriod } from './calendarBillingPolicy.js';
const reference = value => typeof value === 'string' ? value : value?.id;
const positiveSeconds = value => Number.isSafeInteger(value) && value > 0 && Number.isSafeInteger(value * 1000);
const isReference = (value, prefix) => typeof value === 'string' && value.startsWith(prefix);
function identity(metadata, purchase) {
  return metadata?.policyVersion === CALENDAR_POLICY_VERSION
    && metadata.uid === purchase.uid && metadata.attemptId === purchase.attemptId && metadata.planId === purchase.planId;
}
function validPurchase(purchase) {
  return purchase?.policyVersion === CALENDAR_POLICY_VERSION && typeof purchase.uid === 'string' && !!purchase.uid
    && purchase.consentVersion === 'calendar-jst-v1'
    && (purchase.planId !== 'monthly' || purchase.recurringConsent === true)
    && typeof purchase.attemptId === 'string' && !!purchase.attemptId && ['monthly', 'pack'].includes(purchase.planId)
    && isReference(purchase.customerId, 'cus_') && isReference(purchase.sessionId, 'cs_');
}
function paidCharge(charge, amount, customerId, paymentIntentId, sandbox) {
  return isReference(charge?.id, 'ch_') && charge.livemode === !sandbox && charge.paid === true && charge.captured === true
    && charge.currency === 'jpy' && charge.amount === amount && reference(charge.customer) === customerId
    && reference(charge.payment_intent) === paymentIntentId && Number.isSafeInteger(charge.amount_refunded)
    && charge.amount_refunded >= 0 && typeof charge.disputed === 'boolean';
}

// Event.createdはStripe成功イベントの生成時刻。厳密な決済瞬間や配信日時と同一視しない。
// 同じPIに異なる日時の成功イベントがあれば自動的に日付を選ばず要照合。
export function selectPaymentSuccessEvent(events, payment, sandbox) {
  if (!Array.isArray(events) || typeof sandbox !== 'boolean' || !isReference(payment?.id, 'pi_')) return null;
  const matches = events.filter(event => event.type === 'payment_intent.succeeded' && reference(event.data?.object) === payment.id);
  if (!matches.length || matches.some(event => !isReference(event.id, 'evt_') || event.livemode !== !sandbox
    || !positiveSeconds(event.created) || event.data.object.status !== 'succeeded'
    || event.data.object.amount_received !== payment.amount_received || event.data.object.currency !== payment.currency
    || reference(event.data.object.customer) !== reference(payment.customer))) return null;
  if (new Set(matches.map(event => event.created)).size !== 1) return null;
  return [...matches].sort((left, right) => left.id.localeCompare(right.id))[0];
}

// 呼出側が全ページを確認したイベント集合、サーバーの購入予約/Priceレジストリを渡す。
// 初回単発600円と新980円パックだけを扱い、旧Priceの期限には触らない。
export function calendarInitialGrant({ session, successEvents, purchase, registry, sandbox }) {
  if (typeof sandbox !== 'boolean' || !validPurchase(purchase) || session?.id !== purchase.sessionId
    || session.livemode !== !sandbox || session.mode !== 'payment' || session.status !== 'complete'
    || session.payment_status !== 'paid' || session.currency !== 'jpy'
    || reference(session.customer) !== purchase.customerId || session.client_reference_id !== purchase.uid
    || !identity(session.metadata, purchase) || session.line_items?.has_more !== false
    || session.line_items?.data?.length !== 1) return null;
  const line = session.line_items.data[0];
  let price;
  try { price = registry.resolve(line.price); } catch { return null; }
  const expectedRole = purchase.planId === 'monthly' ? 'calendarInitial' : 'calendarPack';
  if (price.role !== expectedRole || line.quantity !== 1 || line.price.id !== purchase.priceId
    || session.amount_total !== price.amount) return null;
  const payment = session.payment_intent;
  if (!isReference(payment?.id, 'pi_') || payment.livemode !== !sandbox || payment.status !== 'succeeded'
    || payment.amount !== price.amount || payment.amount_received !== price.amount || payment.currency !== 'jpy'
    || reference(payment.customer) !== purchase.customerId || !identity(payment.metadata, purchase)) return null;
  if (purchase.planId === 'monthly' && (payment.setup_future_usage !== 'off_session'
    || !isReference(reference(payment.payment_method), 'pm_'))) return null;
  const charge = payment.latest_charge;
  if (!paidCharge(charge, price.amount, purchase.customerId, payment.id, sandbox)) return null;
  const event = selectPaymentSuccessEvent(successEvents, payment, sandbox);
  if (!event || !positiveSeconds(payment.created) || !positiveSeconds(charge.created)
    || event.created < payment.created || event.created < charge.created) return null;
  const joinedAt = event.created * 1000;
  const period = calendarPeriod(joinedAt, purchase.planId);
  return {
    id: session.id, planId: purchase.planId, chargeId: charge.id, paymentIntentId: payment.id,
    ...period, joinedAt, policyVersion: CALENDAR_POLICY_VERSION, priceId: line.price.id,
    successEventId: event.id, revoked: charge.amount_refunded > 0 || charge.disputed,
  };
}

function renewalPeriod(joinedAt, start, end) {
  if (!Number.isSafeInteger(joinedAt) || joinedAt <= 0 || !positiveSeconds(start) || !positiveSeconds(end)) return false;
  const original = new Date(joinedAt + 9 * 3600000);
  const current = new Date(start * 1000 + 9 * 3600000);
  const monthDifference = (current.getUTCFullYear() - original.getUTCFullYear()) * 12 + current.getUTCMonth() - original.getUTCMonth();
  // 月末補正では翌月1日が境界になるため、暦の月差と回数が1ずれる場合がある。
  for (const index of [monthDifference - 1, monthDifference, monthDifference + 1]) {
    if (index >= 1 && index <= 1200 && calendarBoundary(joinedAt, index) === start * 1000
      && calendarBoundary(joinedAt, index + 1) === end * 1000) return true;
  }
  return false;
}

// purchaseは初回成功時刻・作成済み契約IDを保存したサーバー側の正本。
// 無料/作成時0円/未払い/按分/異なる期間のInvoiceから利用期間を追加しない。
export function calendarRenewalGrant({ invoice, purchase, registry, sandbox }) {
  if (typeof sandbox !== 'boolean' || !validPurchase(purchase) || purchase.planId !== 'monthly'
    || !isReference(purchase.subscriptionId, 'sub_') || !isReference(invoice?.id, 'in_')
    || invoice.livemode !== !sandbox || invoice.paid !== true || invoice.status !== 'paid'
    || invoice.billing_reason !== 'subscription_cycle' || invoice.currency !== 'jpy'
    || invoice.amount_paid !== 600 || invoice.amount_due !== 600
    || reference(invoice.customer) !== purchase.customerId || reference(invoice.subscription) !== purchase.subscriptionId
    || invoice.lines?.has_more !== false || invoice.lines?.data?.length !== 1) return null;
  const line = invoice.lines.data[0];
  let price;
  try { price = registry.resolve(line.price); } catch { return null; }
  if (price.role !== 'calendarMonthly' || line.price.id !== purchase.monthlyPriceId
    || line.quantity !== 1 || line.proration !== false || line.amount !== 600
    || reference(line.subscription) !== purchase.subscriptionId
    || !renewalPeriod(purchase.joinedAt, line.period?.start, line.period?.end)) return null;
  const charge = invoice.charge;
  const paymentIntentId = reference(invoice.payment_intent);
  if (!isReference(paymentIntentId, 'pi_') || !paidCharge(charge, 600, purchase.customerId, paymentIntentId, sandbox)) return null;
  return {
    id: invoice.id, planId: 'monthly', chargeId: charge.id, subscriptionId: purchase.subscriptionId,
    paymentIntentId, startsAt: line.period.start * 1000, expiresAt: line.period.end * 1000,
    joinedAt: purchase.joinedAt, policyVersion: CALENDAR_POLICY_VERSION, priceId: line.price.id,
    revoked: charge.amount_refunded > 0 || charge.disputed,
  };
}

// 完了通知が先着した場合の回復用。Events APIはPI IDでサーバー検索できない。
// 上限ページまでで全件確認できなければpendingとし、日時を推定しない。
export async function findCalendarSuccessEvent({ stripe, payment, sandbox, now, maxPages = 10 }) {
  if (typeof sandbox !== 'boolean' || !isReference(payment?.id, 'pi_') || !positiveSeconds(payment.created)
    || !Number.isSafeInteger(now) || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new Error('invalid-event-search');
  if (now < payment.created * 1000) return { status: 'pending' };
  if (now - payment.created * 1000 >= 30 * 86400000) return { status: 'review' };
  const matches = [];
  let cursor;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await stripe.events.list({ type: 'payment_intent.succeeded', limit: 100,
      created: { gte: payment.created, lte: Math.floor(now / 1000) }, ...(cursor ? { starting_after: cursor } : {}) });
    if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean') return { status: 'pending' };
    matches.push(...response.data.filter(event => reference(event.data?.object) === payment.id));
    if (!response.has_more) {
      if (!matches.length) return { status: 'pending' };
      const event = selectPaymentSuccessEvent(matches, payment, sandbox);
      return event ? { status: 'ready', event } : { status: 'review' };
    }
    const next = response.data.at(-1)?.id;
    if (!isReference(next, 'evt_') || next === cursor) return { status: 'pending' };
    cursor = next;
  }
  return { status: 'pending' };
}
