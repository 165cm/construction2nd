export const PLANS = Object.freeze({
  monthly: { amount: 480, currency: 'jpy', mode: 'subscription' },
  pack: { amount: 980, currency: 'jpy', mode: 'payment' }
});
export function requirePlan(id) {
  if (!Object.hasOwn(PLANS, id)) throw new Error('unknown-plan');
  return PLANS[id];
}
// 日本時間で暦の3か月。月末を越える日はその月の末日に丸める。
export function addThreeMonths(startMs) {
  if (!Number.isFinite(startMs)) throw new Error('invalid-date');
  const offset = 9 * 3600000;
  const start = new Date(startMs + offset);
  const end = new Date(start);
  const day = start.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.getTime() - offset;
}
export function checkoutParams({ planId, priceId, customerId, uid, origin, expiresAt }) {
  const plan = requirePlan(planId);
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.search || url.hash) throw new Error('invalid-origin');
  if (!priceId?.startsWith('price_')) throw new Error('invalid-price');
  const metadata = { uid, planId };
  return {
    mode: plan.mode, customer: customerId, client_reference_id: uid,
    line_items: [{ price: priceId, quantity: 1 }], payment_method_types: ['card'],
    success_url: `${url.href.replace(/\/$/, '')}/?payment=success`,
    cancel_url: `${url.href.replace(/\/$/, '')}/?payment=cancelled`,
    expires_at: expiresAt,
    metadata,
    ...(plan.mode === 'subscription' ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } })
  };
}
export function assertConfiguredPrice(price, planId) {
  const plan = requirePlan(planId);
  if (!price.active || price.currency !== plan.currency || price.unit_amount !== plan.amount
    || price.tax_behavior !== 'inclusive'
    || (planId === 'monthly' ? price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 : !!price.recurring)) {
    throw new Error('price-mismatch');
  }
}
function paidCharge(charge, amount) {
  return charge && typeof charge !== 'string' && charge.paid && charge.captured
    && charge.currency === 'jpy' && charge.amount === amount;
}
export function packGrant(session, priceId) {
  const lines = session.line_items?.data;
  const charge = session.payment_intent?.latest_charge;
  if (session.mode !== 'payment' || session.payment_status !== 'paid' || session.amount_total !== 980
    || session.currency !== 'jpy' || lines?.length !== 1 || lines[0].price?.id !== priceId || lines[0].quantity !== 1
    || session.line_items?.has_more || !paidCharge(charge, 980) || !Number.isFinite(charge.created)) return null;
  return {
    id: session.id, planId: 'pack', chargeId: charge.id,
    startsAt: charge.created * 1000, expiresAt: addThreeMonths(charge.created * 1000),
    revoked: charge.amount_refunded > 0 || !!charge.disputed
  };
}
export function monthlyGrant(invoice, priceId) {
  const lines = invoice.lines?.data;
  const charge = invoice.charge;
  if (!invoice.paid || invoice.status !== 'paid' || invoice.amount_paid !== 480 || invoice.currency !== 'jpy'
    || !invoice.subscription || lines?.length !== 1 || lines[0].price?.id !== priceId
    || lines[0].quantity !== 1 || lines[0].proration || !paidCharge(charge, 480)
    || invoice.lines?.has_more || !Number.isFinite(lines[0].period?.end) || !Number.isFinite(lines[0].period?.start)
    || lines[0].period.end <= lines[0].period.start) return null;
  return {
    id: invoice.id, planId: 'monthly', chargeId: charge.id, subscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id,
    startsAt: lines[0].period.start * 1000, expiresAt: lines[0].period.end * 1000,
    revoked: charge.amount_refunded > 0 || !!charge.disputed
  };
}
export function mergeGrant(previous, next, chargeRevoked = false) {
  return { ...next, revoked: !!previous?.revoked || next.revoked || chargeRevoked };
}
export function accessSummary(grants, now = Date.now()) {
  const active = grants.filter(g => !g.revoked && Number.isFinite(g.startsAt) && Number.isFinite(g.expiresAt) && g.startsAt <= now && g.expiresAt > now);
  return { hasAccess: active.length > 0, expiresAt: active.length ? Math.max(...active.map(g => g.expiresAt)) : null };
}
