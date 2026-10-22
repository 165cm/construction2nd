// 改定準備用。実Checkout/通知経路には、Sandbox検証が済むまで接続しない。
import { CALENDAR_POLICY_VERSION } from './calendarBillingPolicy.js';

export const LEGACY_POLICY_VERSION = 'legacy-time-v1';
const ROLES = Object.freeze({
  legacyMonthly: { planId: 'monthly', amount: 480, recurring: true, policyVersion: LEGACY_POLICY_VERSION },
  legacyPack: { planId: 'pack', amount: 980, recurring: false, policyVersion: LEGACY_POLICY_VERSION },
  calendarMonthly: { planId: 'monthly', amount: 600, recurring: true, policyVersion: CALENDAR_POLICY_VERSION },
  calendarPack: { planId: 'pack', amount: 980, recurring: false, policyVersion: CALENDAR_POLICY_VERSION },
});

// 金額だけから版を推測しない。同額980円の旧/新パックにも別のPriceを要求する。
export function createBillingPriceRegistry({ sandbox, prices }) {
  if (typeof sandbox !== 'boolean' || !prices || typeof prices !== 'object') throw new Error('invalid-registry');
  const entries = new Map();
  for (const [role, priceId] of Object.entries(prices)) {
    if (!Object.hasOwn(ROLES, role)) throw new Error('unknown-price-role');
    if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error('invalid-price-id');
    if (entries.has(priceId)) throw new Error('ambiguous-price-id');
    entries.set(priceId, Object.freeze({ ...ROLES[role], role, priceId, currency: 'jpy', livemode: !sandbox }));
  }
  if (entries.size === 0) throw new Error('empty-registry');
  return Object.freeze({
    // 過去通知ではinactiveのPriceも必要。新規購入時だけactiveを追加要求する。
    resolve(price, { forPurchase = false } = {}) {
      const entry = price && entries.get(price.id);
      if (!entry || price.deleted || price.livemode !== entry.livemode
        || price.currency !== entry.currency || price.unit_amount !== entry.amount
        || price.tax_behavior !== 'inclusive'
        || (forPurchase && (entry.policyVersion === LEGACY_POLICY_VERSION || price.active !== true))
        || (entry.recurring
          ? price.type !== 'recurring' || price.recurring?.interval !== 'month' || price.recurring?.interval_count !== 1 || price.recurring?.usage_type !== 'licensed'
          : price.type !== 'one_time' || !!price.recurring)) throw new Error('price-policy-mismatch');
      return entry;
    },
  });
}

// 同じ決済の再送で保存済みの期限や版を作り直さない。取消しは元に戻さない。
// 保存先キーと本人照合は呼出側のtransaction内で検証する。
export function preserveGrantOnReplay(previous, next, chargeRevoked = false) {
  if (!next || !next.id || !next.chargeId || !['monthly', 'pack'].includes(next.planId)
    || !Number.isSafeInteger(next.startsAt) || !Number.isSafeInteger(next.expiresAt)
    || next.startsAt < 0 || next.expiresAt <= next.startsAt) throw new Error('invalid-grant');
  if (previous) {
    for (const field of ['id', 'planId', 'chargeId', 'subscriptionId']) {
      if (previous[field] !== next[field]) throw new Error('grant-identity-mismatch');
    }
    // 旧データはpolicyVersionなしのまま維持。後から新方式のラベルを付けない。
    return { ...previous, revoked: !!previous.revoked || !!next.revoked || !!chargeRevoked };
  }
  return { ...next, revoked: !!next.revoked || !!chargeRevoked };
}
