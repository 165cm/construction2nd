export function canUseBilling(uid, sandbox, testerIds) {
  if (!uid) return false;
  if (!sandbox) return true;
  return String(testerIds || '').split(',').map(value => value.trim()).filter(Boolean).includes(uid);
}

export function assertStripeEnvironment(key, sandbox) {
  if (typeof key !== 'string' || !key.startsWith(sandbox ? 'sk_test_' : 'sk_live_')) {
    throw new Error('stripe-environment-mismatch');
  }
}

// テストの顧客・購入予約・利用権・返金記録を本番から分離する。
export function billingPaths(sandbox, uid) {
  return {
    customers: sandbox ? 'sandboxBillingCustomers' : 'billingCustomers',
    revocations: sandbox ? 'sandboxBillingRevocations' : 'billingRevocations',
    grants: `users/${uid}/${sandbox ? 'sandboxEntitlements' : 'entitlements'}`,
    purchases: `users/${uid}/${sandbox ? 'sandboxBillingPurchases' : 'billingPurchases'}`,
  };
}
