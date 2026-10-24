// 一時更新試験専用。過去の隔離時計で生じた既知8通知だけを許可する。
import { calendarPeriod } from './calendarBillingPolicy.js';
const reference = value => typeof value === 'string' ? value : value?.id;
export function validateRenewalProbeTargets(targets) {
  if (!Array.isArray(targets) || targets.length !== 8) throw new Error('invalid-renewal-targets');
  const runIds = new Set();
  for (const t of targets) {
    const match = /^calendar-probe-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-([0-3])$/.exec(t.uid || '');
    if (!match || t.attemptId !== t.uid || ![1, 2].includes(t.periodIndex)
      || !Number.isSafeInteger(t.joinedAt) || t.joinedAt <= 0 || !Number.isSafeInteger(t.eventCreated) || t.eventCreated <= 0
      || !/^evt_\w+$/.test(t.eventId) || !/^in_\w+$/.test(t.invoiceId) || !/^sub_\w+$/.test(t.subscriptionId)
      || !/^cus_\w+$/.test(t.customerId) || !/^price_\w+$/.test(t.monthlyPriceId)
      || t.sessionId !== `cs_renewal_fixture_${match[2]}`) throw new Error('invalid-renewal-targets');
    runIds.add(match[1]);
    const period = calendarPeriod(t.joinedAt, 'monthly', t.periodIndex);
    if (t.startsAt !== period.startsAt || t.expiresAt !== period.expiresAt) throw new Error('invalid-renewal-period');
  }
  if (runIds.size !== 1 || new Set(targets.map(t => t.eventId)).size !== 8
    || new Set(targets.map(t => t.invoiceId)).size !== 8 || new Set(targets.map(t => t.monthlyPriceId)).size !== 1
    || new Set(targets.map(t => t.uid)).size !== 4 || new Set(targets.map(t => t.customerId)).size !== 4
    || new Set(targets.map(t => t.subscriptionId)).size !== 4) throw new Error('invalid-renewal-targets');
  for (const uid of new Set(targets.map(t => t.uid))) {
    const pair = targets.filter(t => t.uid === uid);
    if (pair.length !== 2 || new Set(pair.map(t => t.periodIndex)).size !== 2
      || ['customerId', 'subscriptionId', 'joinedAt', 'sessionId'].some(k => pair[0][k] !== pair[1][k])) throw new Error('invalid-renewal-targets');
  }
}
export function createCalendarRenewalProbeGuard({ targets, db, stripe }) {
  validateRenewalProbeTargets(targets);
  return async event => {
    const t = targets.find(t => t.eventId === event?.id);
    if (!t) return false;
    const snapshot = event.data?.object;
    if (event.type !== 'invoice.paid' || event.livemode !== false || event.created !== t.eventCreated
      || snapshot?.livemode !== false || snapshot.id !== t.invoiceId || reference(snapshot.customer) !== t.customerId
      || snapshot.status !== 'paid' || snapshot.billing_reason !== 'subscription_cycle'
      || snapshot.currency !== 'jpy' || snapshot.amount_paid !== 600 || snapshot.amount_due !== 600) throw new Error('renewal-probe-event-mismatch');
    // Eventの保存時API版と通知先API版は異なり得る。固定APIで正本を再取得する。
    const invoice = await stripe.invoices.retrieve(t.invoiceId, { expand: ['charge'] });
    const line = invoice?.lines?.data?.[0];
    if (event.type !== 'invoice.paid' || event.livemode !== false || event.created !== t.eventCreated
      || invoice?.livemode !== false || invoice.id !== t.invoiceId || reference(invoice.customer) !== t.customerId
      || reference(invoice.subscription) !== t.subscriptionId || invoice.paid !== true || invoice.status !== 'paid'
      || invoice.billing_reason !== 'subscription_cycle' || invoice.currency !== 'jpy' || invoice.amount_paid !== 600 || invoice.amount_due !== 600
      || invoice.lines?.has_more !== false || invoice.lines?.data?.length !== 1 || reference(line?.price) !== t.monthlyPriceId
      || line.quantity !== 1 || line.proration !== false || line.amount !== 600 || reference(line.subscription) !== t.subscriptionId
      || line.period?.start * 1000 !== t.startsAt || line.period?.end * 1000 !== t.expiresAt) throw new Error('renewal-probe-event-mismatch');
    const owners = await db.collection('sandboxBillingCustomers').where('customerId', '==', t.customerId).limit(2).get();
    if (owners.docs.length !== 1 || owners.docs[0].id !== t.uid) throw new Error('renewal-probe-owner-mismatch');
    const purchase = (await db.doc(`users/${t.uid}/sandboxBillingPurchases/${t.attemptId}`).get()).data();
    const expected = { uid: t.uid, attemptId: t.attemptId, customerId: t.customerId, subscriptionId: t.subscriptionId,
      joinedAt: t.joinedAt, sessionId: t.sessionId, monthlyPriceId: t.monthlyPriceId, planId: 'monthly', status: 'complete',
      policyVersion: 'jst-calendar-v1', consentVersion: 'calendar-jst-v1', recurringConsent: true, revoked: false };
    if (Object.entries(expected).some(([key, value]) => purchase?.[key] !== value)) throw new Error('renewal-probe-purchase-mismatch');
    return true;
  };
}
