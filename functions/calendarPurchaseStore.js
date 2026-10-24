// Firestoreだけを扱う新方式の保存アダプター。Stripe正本の検証は呼出側で行う。
import { CALENDAR_POLICY_VERSION } from './calendarBillingPolicy.js';
import { preserveGrantOnReplay } from './billingPriceRegistry.js';

const reservationFields = ['uid', 'customerId', 'attemptId', 'planId', 'priceId', 'monthlyPriceId',
  'policyVersion', 'consentVersion', 'recurringConsent', 'createdAt'];
const reference = (value, prefix = '') => {
  if (typeof value !== 'string' || !value || value.length > 128 || value.includes('/')
    || value === '.' || value === '..' || !value.startsWith(prefix)) throw new Error('invalid-purchase-reference');
  return value;
};
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
function sameReservation(stored, supplied) {
  for (const field of reservationFields) if (stored[field] !== supplied[field]) throw new Error('purchase-identity-mismatch');
}
function withoutLease(purchase) { const next = { ...purchase }; delete next.lease; return next; }
function validateReservation(purchase) {
  reference(purchase?.uid); reference(purchase.attemptId); reference(purchase.customerId, 'cus_'); reference(purchase.priceId, 'price_');
  if (!['monthly', 'pack'].includes(purchase.planId) || purchase.policyVersion !== CALENDAR_POLICY_VERSION
    || purchase.consentVersion !== 'calendar-jst-v1' || purchase.recurringConsent !== (purchase.planId === 'monthly')
    || !timestamp(purchase.createdAt)) throw new Error('invalid-purchase-reservation');
  if (purchase.planId === 'monthly') reference(purchase.monthlyPriceId, 'price_');
}

export function createCalendarPurchaseStore({ db, paths }) {
  const forUser = uid => {
    reference(uid);
    const result = typeof paths === 'function' ? paths(uid) : paths;
    // 固定pathsの誤用による別UIDへの保存も拒否する。
    if (!result?.purchases?.startsWith(`users/${uid}/`) || !result?.grants?.startsWith(`users/${uid}/`)
      || !result.customers || !result.revocations) throw new Error('invalid-purchase-paths');
    return result;
  };
  const purchaseRef = (uid, attemptId) => db.doc(`${forUser(uid).purchases}/${reference(attemptId)}`);
  const customerRef = uid => db.doc(`${forUser(uid).customers}/${uid}`);
  const grantRef = (uid, id) => db.doc(`${forUser(uid).grants}/${reference(id)}`);
  const markerRef = (uid, chargeId) => db.doc(`${forUser(uid).revocations}/${reference(chargeId, 'ch_')}`);
  async function readPurchase(tx, uid, attemptId) {
    const ref = purchaseRef(uid, attemptId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('purchase-not-found');
    const purchase = snap.data();
    if (purchase.uid !== uid || purchase.attemptId !== attemptId) throw new Error('purchase-identity-mismatch');
    return { ref, purchase };
  }
  const touchCustomer = (tx, uid) => tx.set(customerRef(uid), { updatedAt: Date.now() }, { merge: true });
  async function initialState(tx, purchase) {
    if (!purchase.initialGrantId || !purchase.chargeId) throw new Error('purchase-not-paid');
    const [grant, marker] = await Promise.all([
      tx.get(grantRef(purchase.uid, purchase.initialGrantId)), tx.get(markerRef(purchase.uid, purchase.chargeId)),
    ]);
    const value = grant.data();
    if (!grant.exists || value.chargeId !== purchase.chargeId || value.paymentIntentId !== purchase.paymentIntentId
      || value.joinedAt !== purchase.joinedAt || value.policyVersion !== purchase.policyVersion) throw new Error('purchase-grant-mismatch');
    return { revoked: !!purchase.revoked || !!value.revoked || marker.exists };
  }
  return {
    async get(uid, attemptId) {
      const snap = await purchaseRef(uid, attemptId).get();
      if (!snap.exists) return null;
      const purchase = snap.data();
      if (purchase.uid !== uid || purchase.attemptId !== attemptId) throw new Error('purchase-identity-mismatch');
      return purchase;
    },
    async register(purchase) {
      validateReservation(purchase);
      return db.runTransaction(async tx => {
        const ref = purchaseRef(purchase.uid, purchase.attemptId);
        const snap = await tx.get(ref);
        if (snap.exists) { sameReservation(snap.data(), purchase); return snap.data(); }
        const saved = Object.fromEntries(reservationFields.filter(field => purchase[field] !== undefined).map(field => [field, purchase[field]]));
        saved.status = 'reserved';
        tx.set(ref, saved);
        return saved;
      });
    },
    async bindSession(uid, attemptId, sessionId) {
      reference(sessionId, 'cs_');
      return db.runTransaction(async tx => {
        const { ref, purchase } = await readPurchase(tx, uid, attemptId);
        if (purchase.sessionId && purchase.sessionId !== sessionId) throw new Error('purchase-session-mismatch');
        if (purchase.sessionId) return purchase;
        const saved = { ...purchase, sessionId, status: 'checkout' };
        tx.set(ref, saved);
        return saved;
      });
    },
    async recordInitial(purchase, grant, paymentMethodId) {
      return db.runTransaction(async tx => {
        const { ref, purchase: stored } = await readPurchase(tx, purchase.uid, purchase.attemptId);
        sameReservation(stored, purchase);
        if (stored.sessionId !== purchase.sessionId || grant?.id !== stored.sessionId || grant.planId !== stored.planId
          || grant.priceId !== stored.priceId || grant.policyVersion !== stored.policyVersion
          || !timestamp(grant.joinedAt) || grant.startsAt !== grant.joinedAt) throw new Error('purchase-initial-mismatch');
        reference(grant.successEventId, 'evt_'); reference(grant.paymentIntentId, 'pi_');
        if (stored.planId === 'monthly') reference(paymentMethodId, 'pm_');
        const evidence = { joinedAt: grant.joinedAt, expiresAt: grant.expiresAt, successEventId: grant.successEventId, chargeId: grant.chargeId,
          paymentIntentId: grant.paymentIntentId, initialGrantId: grant.id };
        if (paymentMethodId != null) evidence.paymentMethodId = reference(paymentMethodId, 'pm_');
        for (const [field, value] of Object.entries(evidence)) {
          if (stored[field] !== undefined && stored[field] !== value) throw new Error('purchase-initial-mismatch');
        }
        const gref = grantRef(stored.uid, grant.id);
        const [previous, marker] = await Promise.all([tx.get(gref), tx.get(markerRef(stored.uid, grant.chargeId))]);
        if (previous.exists) for (const field of ['startsAt', 'expiresAt', 'joinedAt', 'successEventId', 'paymentIntentId', 'policyVersion', 'priceId']) {
          if (previous.data()[field] !== grant[field]) throw new Error('purchase-initial-mismatch');
        }
        const merged = preserveGrantOnReplay(previous.data(), grant, marker.exists);
        const status = ['subscribing', 'complete', 'review', 'stop_required'].includes(stored.status)
          ? stored.status : stored.planId === 'pack' ? 'complete' : 'paid';
        const saved = { ...stored, ...evidence, revoked: !!stored.revoked || merged.revoked, status };
        tx.set(gref, merged); tx.set(ref, saved); touchCustomer(tx, stored.uid);
        return saved;
      });
    },
    async claim(uid, attemptId, token, now) {
      reference(token);
      if (!timestamp(now) || !Number.isSafeInteger(now + 300000)) throw new Error('invalid-purchase-time');
      return db.runTransaction(async tx => {
        const { ref, purchase } = await readPurchase(tx, uid, attemptId);
        if (purchase.subscriptionId && purchase.status === 'complete') return { action: 'done', purchase };
        if (purchase.status === 'stop_required') return { action: 'stop', purchase };
        if (purchase.status === 'review' || purchase.planId !== 'monthly' || !purchase.initialGrantId) return { action: 'review', purchase };
        const state = await initialState(tx, purchase);
        if (state.revoked) return { action: 'review', purchase };
        if (purchase.lease && purchase.lease.until > now) return { action: 'busy', purchase };
        const saved = { ...purchase, firstAttemptAt: purchase.firstAttemptAt ?? now,
          lease: { token, until: now + 300000 }, status: 'subscribing' };
        tx.set(ref, saved);
        return { action: 'claimed', purchase: saved };
      });
    },
    async finish(uid, attemptId, token, subscriptionId, { stop = false } = {}) {
      reference(token); reference(subscriptionId, 'sub_');
      return db.runTransaction(async tx => {
        const { ref, purchase } = await readPurchase(tx, uid, attemptId);
        if (purchase.lease?.token !== token) return { action: 'stale', purchase };
        if (purchase.subscriptionId && purchase.subscriptionId !== subscriptionId) throw new Error('purchase-subscription-mismatch');
        const state = await initialState(tx, purchase);
        const mustStop = state.revoked || stop === true;
        const saved = { ...withoutLease(purchase), subscriptionId,
          status: mustStop ? 'stop_required' : 'complete', revoked: state.revoked };
        tx.set(ref, saved);
        return { action: mustStop ? 'revoked' : 'complete', purchase: saved };
      });
    },
    async release(uid, attemptId, token, review = false) {
      reference(token);
      return db.runTransaction(async tx => {
        const { ref, purchase } = await readPurchase(tx, uid, attemptId);
        if (purchase.lease?.token !== token) return purchase;
        const saved = { ...withoutLease(purchase), status: review ? 'review' : 'paid' };
        tx.set(ref, saved);
        return saved;
      });
    },
    async markStopped(uid, attemptId, subscriptionId) {
      reference(subscriptionId, 'sub_');
      return db.runTransaction(async tx => {
        const { ref, purchase } = await readPurchase(tx, uid, attemptId);
        if (purchase.subscriptionId !== subscriptionId || purchase.status !== 'stop_required') throw new Error('purchase-stop-mismatch');
        const saved = { ...withoutLease(purchase), status: 'review', stopped: true };
        tx.set(ref, saved);
        return saved;
      });
    },
    async findBySubscription(uid, id) {
      reference(id, 'sub_');
      const result = await db.collection(forUser(uid).purchases).where('subscriptionId', '==', id).limit(2).get();
      if (result.docs.length > 1) throw new Error('ambiguous-purchase-subscription');
      if (!result.docs.length) return null;
      const purchase = result.docs[0].data();
      if (purchase.uid !== uid) throw new Error('purchase-identity-mismatch');
      return purchase;
    },
    async saveRenewal(purchase, grant) {
      return db.runTransaction(async tx => {
        const { purchase: stored } = await readPurchase(tx, purchase.uid, purchase.attemptId);
        sameReservation(stored, purchase);
        if (stored.planId !== 'monthly' || !stored.subscriptionId || stored.subscriptionId !== purchase.subscriptionId
          || grant?.subscriptionId !== stored.subscriptionId || grant.policyVersion !== stored.policyVersion
          || grant.planId !== 'monthly' || grant.joinedAt !== stored.joinedAt || grant.priceId !== stored.monthlyPriceId) throw new Error('purchase-renewal-mismatch');
        const ref = grantRef(stored.uid, grant.id);
        const [previous, marker] = await Promise.all([tx.get(ref), tx.get(markerRef(stored.uid, grant.chargeId))]);
        const saved = preserveGrantOnReplay(previous.data(), grant, marker.exists);
        tx.set(ref, saved); touchCustomer(tx, stored.uid);
        return saved;
      });
    },
  };
}
