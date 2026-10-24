// 一時的な外部通知試験専用。署名/環境の検証後、既知の完了済み支払いだけ通す。
const reference = value => typeof value === 'string' ? value : value?.id;
export function createCalendarWebhookProbeGuard({ targets, db }) {
  if (!Array.isArray(targets) || targets.length !== 2 || new Set(targets.map(t => t.eventId)).size !== 2
    || new Set(targets.map(t => t.uid)).size !== 2 || new Set(targets.map(t => t.customerId)).size !== 2
    || !targets.every(t => /^calendar-integration-[0-9a-f-]{36}-(monthly|pack)$/.test(t.uid)
      && ['monthly', 'pack'].includes(t.planId) && t.uid.endsWith('-' + t.planId)
      && /^evt_\w+$/.test(t.eventId) && /^pi_\w+$/.test(t.paymentIntentId)
      && /^cus_\w+$/.test(t.customerId) && /^cs_\w+$/.test(t.sessionId)
      && /^[0-9a-f-]{36}$/.test(t.attemptId) && Number.isSafeInteger(t.joinedAt) && t.joinedAt > 0)) {
    throw new Error('invalid-probe-targets');
  }
  return async event => {
    const target = targets.find(item => item.eventId === event?.id);
    if (!target) return false;
    const payment = event.data?.object;
    if (event.type !== 'payment_intent.succeeded' || event.livemode !== false || payment?.livemode !== false
      || event.created * 1000 !== target.joinedAt || payment.id !== target.paymentIntentId
      || reference(payment.customer) !== target.customerId || payment.status !== 'succeeded'
      || payment.currency !== 'jpy' || payment.amount_received !== (target.planId === 'monthly' ? 600 : 980)
      || payment.metadata?.uid !== target.uid || payment.metadata?.attemptId !== target.attemptId
      || payment.metadata?.planId !== target.planId || payment.metadata?.policyVersion !== 'jst-calendar-v1') {
      throw new Error('probe-event-mismatch');
    }
    const owners = await db.collection('sandboxBillingCustomers').where('customerId', '==', target.customerId).limit(2).get();
    if (owners.docs.length !== 1 || owners.docs[0].id !== target.uid) throw new Error('probe-owner-mismatch');
    const purchase = (await db.doc(`users/${target.uid}/sandboxBillingPurchases/${target.attemptId}`).get()).data();
    if (purchase?.status !== 'complete' || purchase.uid !== target.uid || purchase.customerId !== target.customerId
      || purchase.sessionId !== target.sessionId || purchase.attemptId !== target.attemptId
      || purchase.successEventId !== target.eventId || purchase.paymentIntentId !== target.paymentIntentId
      || purchase.joinedAt !== target.joinedAt || purchase.planId !== target.planId
      || purchase.policyVersion !== 'jst-calendar-v1') throw new Error('probe-completed-purchase-required');
    return true;
  };
}
