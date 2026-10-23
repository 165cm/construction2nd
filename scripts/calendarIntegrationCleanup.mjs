// 隔離した実結合試験専用。manifest外の文書、学習記録、認証ユーザーは操作しない。
const POLICY = 'jst-calendar-v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refId = value => typeof value === 'string' ? value : value?.id;
const validId = (id, prefix) => typeof id === 'string' && new RegExp(`^${prefix}[A-Za-z0-9_-]+$`).test(id);
function requireCondition(condition, code) { if (!condition) { const error = new Error(code); error.code = code; error.cleanupCode = code; throw error; } }

export async function cleanupCalendarIntegration({ stripe, db, state }) {
  // ここは外部アクセスより先に一括検証。未知の名前空間へ進まない。
  requireCondition(uuid.test(state?.runId || '') && Array.isArray(state?.users), 'invalid-cleanup-manifest');
  const seen = new Set();
  for (const user of state.users) {
    requireCondition(['monthly', 'pack'].includes(user?.planId)
      && user.uid === `calendar-integration-${state.runId}-${user.planId}` && !seen.has(user.uid), 'invalid-cleanup-uid');
    seen.add(user.uid);
  }
  const result = { errors: [], canceledSubscriptions: 0, expiredSessions: 0, deletedCustomers: 0,
    deactivatedPrices: 0, deactivatedProducts: 0, deletedDocuments: 0 };
  const recordError = (type, id, error) => result.errors.push({ type,
    id: type === 'user' || validId(id, type === 'price' ? 'price_' : 'prod_') ? id : 'invalid-reference',
    code: error?.cleanupCode || (['resource_missing', 'rate_limit', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code) ? error.code : 'cleanup-failed') });
  const priceIds = state.priceIds || {};
  const initialPrice = user => priceIds[user.planId === 'monthly' ? 'initial' : 'pack'];

  async function documentsFor(user) {
    const refs = [{ kind: 'customer', ref: db.doc(`sandboxBillingCustomers/${user.uid}`) }];
    if (user.attemptId) {
      requireCondition(/^[A-Za-z0-9_-]{1,128}$/.test(user.attemptId), 'invalid-attempt-id');
      refs.push({ kind: 'purchase', ref: db.doc(`users/${user.uid}/sandboxBillingPurchases/${user.attemptId}`) });
    }
    if (user.sessionId) {
      requireCondition(validId(user.sessionId, 'cs_'), 'invalid-session-id');
      refs.push({ kind: 'grant', ref: db.doc(`users/${user.uid}/sandboxEntitlements/${user.sessionId}`) });
    }
    const docs = await Promise.all(refs.map(async value => ({ ...value, snapshot: await value.ref.get() })));
    const data = Object.fromEntries(docs.filter(value => value.snapshot.exists).map(value => [value.kind, value.snapshot.data()]));
    const customer = data.customer, purchase = data.purchase, grant = data.grant;
    if (customer) {
      requireCondition(validId(user.customerId, 'cus_') && customer.customerId === user.customerId
        && (customer.uid === undefined || customer.uid === user.uid), 'customer-document-mismatch');
      if (customer.pending) requireCondition(user.attemptId && customer.pending.attemptId === user.attemptId
        && customer.pending.planId === user.planId && customer.pending.priceId === initialPrice(user)
        && customer.pending.policyVersion === POLICY
        && (user.planId !== 'monthly' || customer.pending.monthlyPriceId === priceIds.monthly), 'reservation-document-mismatch');
    }
    if (purchase) requireCondition(purchase.uid === user.uid && purchase.attemptId === user.attemptId
      && purchase.customerId === user.customerId && purchase.planId === user.planId && purchase.policyVersion === POLICY
      && validId(initialPrice(user), 'price_') && purchase.priceId === initialPrice(user)
      && (user.planId !== 'monthly' || purchase.monthlyPriceId === priceIds.monthly)
      && (purchase.sessionId === undefined || purchase.sessionId === user.sessionId), 'purchase-document-mismatch');
    if (grant) requireCondition(purchase && grant.id === user.sessionId && grant.planId === user.planId
      && grant.priceId === initialPrice(user) && grant.policyVersion === POLICY
      && grant.paymentIntentId === purchase.paymentIntentId && validId(grant.paymentIntentId, 'pi_')
      && grant.chargeId === purchase.chargeId && validId(grant.chargeId, 'ch_')
      && purchase.initialGrantId === user.sessionId && grant.joinedAt === purchase.joinedAt, 'grant-document-mismatch');
    return { docs, data };
  }

  async function subscriptionsFor(customer) {
    const all = []; let cursor;
    for (let page = 0; page < 100; page++) {
      const response = await stripe.subscriptions.list({ customer, status: 'all', limit: 100,
        ...(cursor ? { starting_after: cursor } : {}) });
      requireCondition(Array.isArray(response.data) && typeof response.has_more === 'boolean', 'incomplete-subscription-list');
      all.push(...response.data);
      if (!response.has_more) return all;
      const next = response.data.at(-1)?.id;
      requireCondition(next && next !== cursor, 'incomplete-subscription-list'); cursor = next;
    }
    requireCondition(false, 'incomplete-subscription-list');
  }

  for (const user of state.users) {
    try {
      const checked = await documentsFor(user); // Stripe側の変更前にDB整合を照合。
      if (user.customerId) {
        requireCondition(validId(user.customerId, 'cus_'), 'invalid-customer-id');
        const customer = await stripe.customers.retrieve(user.customerId);
        requireCondition(customer.id === user.customerId, 'customer-reference-mismatch');
        if (!customer.deleted) {
          requireCondition(customer.livemode === false && customer.metadata?.uid === user.uid, 'customer-ownership-mismatch');
          let session = null;
          if (user.sessionId) {
            session = await stripe.checkout.sessions.retrieve(user.sessionId, { expand: ['line_items'] });
            requireCondition(session.id === user.sessionId && session.livemode === false
              && refId(session.customer) === user.customerId && session.mode === 'payment'
              && session.metadata?.uid === user.uid && session.metadata.attemptId === user.attemptId
              && session.metadata.policyVersion === POLICY && session.metadata.planId === user.planId
              && session.client_reference_id === user.uid && session.line_items?.has_more === false
              && session.line_items.data?.length === 1 && session.line_items.data[0].quantity === 1
              && validId(initialPrice(user), 'price_') && refId(session.line_items.data[0].price) === initialPrice(user), 'session-ownership-mismatch');
            requireCondition(['open', 'complete', 'expired'].includes(session.status)
              && (session.status !== 'open' || session.payment_status === 'unpaid'), 'session-state-mismatch');
          }
          const paymentIntentId = checked.data.purchase?.paymentIntentId || refId(session?.payment_intent);
          if (checked.data.purchase?.paymentIntentId && session) {
            requireCondition(checked.data.purchase.paymentIntentId === refId(session.payment_intent), 'payment-reference-mismatch');
          }
          const subscriptions = await subscriptionsFor(user.customerId);
          // 全件の所有確認を先に済ませ、別契約があれば顧客削除も行わない。
          for (const sub of subscriptions) requireCondition(user.planId === 'monthly' && validId(sub.id, 'sub_')
            && sub.livemode === false && refId(sub.customer) === user.customerId
            && sub.metadata?.uid === user.uid && sub.metadata.attemptId === user.attemptId
            && sub.metadata.policyVersion === POLICY && validId(paymentIntentId, 'pi_')
            && sub.metadata.initialPaymentIntentId === paymentIntentId
            && sub.items?.has_more === false && sub.items.data?.length === 1
            && sub.items.data[0].quantity === 1 && validId(priceIds.monthly, 'price_')
            && refId(sub.items.data[0].price) === priceIds.monthly, 'subscription-ownership-mismatch');
          for (const sub of subscriptions) if (!['canceled', 'incomplete_expired'].includes(sub.status)) {
            await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
            const stopped = await stripe.subscriptions.retrieve(sub.id);
            requireCondition(stopped.id === sub.id && stopped.status === 'canceled', 'subscription-cancel-unconfirmed');
            result.canceledSubscriptions++;
          }
          if (session?.status === 'open') {
            await stripe.checkout.sessions.expire(session.id);
            const expired = await stripe.checkout.sessions.retrieve(session.id);
            requireCondition(expired.id === session.id && expired.status === 'expired', 'session-expire-unconfirmed');
            result.expiredSessions++;
          }
          await stripe.customers.del(user.customerId);
          const deleted = await stripe.customers.retrieve(user.customerId);
          requireCondition(deleted.id === user.customerId && deleted.deleted === true, 'customer-delete-unconfirmed');
          result.deletedCustomers++;
        }
      } else requireCondition(checked.docs.every(value => !value.snapshot.exists), 'missing-customer-manifest');
      // Stripeの処理中に変わった文書を見落とさない。削除直前にも同じ限定manifestを照合。
      const final = await documentsFor(user);
      const existing = final.docs.filter(value => value.snapshot.exists);
      if (existing.length) {
        const batch = db.batch();
        for (const value of existing) {
          const condition = value.snapshot.updateTime ? { lastUpdateTime: value.snapshot.updateTime } : undefined;
          if (condition) batch.delete(value.ref, condition); else batch.delete(value.ref);
        }
        await batch.commit();
        const gone = await Promise.all(existing.map(value => value.ref.get()));
        requireCondition(gone.every(snap => !snap.exists), 'document-delete-unconfirmed');
        result.deletedDocuments += existing.length;
      }
    } catch (error) { recordError('user', user.uid, error); }
  }

  for (const [role, id] of Object.entries(priceIds)) {
    if (id == null) continue;
    try {
      requireCondition(['initial', 'monthly', 'pack'].includes(role) && validId(id, 'price_')
        && validId(state.productId, 'prod_'), 'invalid-price-manifest');
      const price = await stripe.prices.retrieve(id);
      requireCondition(price.id === id && price.livemode === false && price.metadata?.runId === state.runId
        && refId(price.product) === state.productId, 'price-ownership-mismatch');
      const product = await stripe.products.retrieve(state.productId);
      requireCondition(product.id === state.productId && product.livemode === false
        && product.metadata?.runId === state.runId, 'product-ownership-mismatch');
      if (price.active !== false) {
        await stripe.prices.update(id, { active: false });
        const inactive = await stripe.prices.retrieve(id);
        requireCondition(inactive.id === id && inactive.active === false, 'price-deactivation-unconfirmed');
        result.deactivatedPrices++;
      }
    } catch (error) { recordError('price', id, error); }
  }
  if (state.productId) {
    try {
      requireCondition(validId(state.productId, 'prod_'), 'invalid-product-manifest');
      const product = await stripe.products.retrieve(state.productId);
      requireCondition(product.id === state.productId && product.livemode === false
        && product.metadata?.runId === state.runId, 'product-ownership-mismatch');
      if (product.active !== false) {
        await stripe.products.update(product.id, { active: false });
        const inactive = await stripe.products.retrieve(product.id);
        requireCondition(inactive.id === product.id && inactive.active === false, 'product-deactivation-unconfirmed');
        result.deactivatedProducts++;
      }
    } catch (error) { recordError('product', state.productId, error); }
  }
  return result;
}
