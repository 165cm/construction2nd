import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingPriceRegistry, preserveGrantOnReplay, LEGACY_POLICY_VERSION } from '../billingPriceRegistry.js';
import { CALENDAR_POLICY_VERSION } from '../calendarBillingPolicy.js';

const prices = { legacyMonthly: 'price_oldMonth', legacyPack: 'price_oldPack', calendarMonthly: 'price_newMonth', calendarPack: 'price_newPack' };
const registry = createBillingPriceRegistry({ sandbox: true, prices });
const price = (id, amount, recurring = false) => ({ id, unit_amount: amount, currency: 'jpy', livemode: false, active: true, tax_behavior: 'inclusive', type: recurring ? 'recurring' : 'one_time', recurring: recurring ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null });

test('正確なPriceと環境で旧480/新600と同額パックの版を分離する', () => {
  assert.equal(registry.resolve(price(prices.legacyMonthly, 480, true)).policyVersion, LEGACY_POLICY_VERSION);
  assert.equal(registry.resolve(price(prices.calendarMonthly, 600, true), { forPurchase: true }).policyVersion, CALENDAR_POLICY_VERSION);
  assert.equal(registry.resolve(price(prices.legacyPack, 980)).policyVersion, LEGACY_POLICY_VERSION);
  assert.equal(registry.resolve(price(prices.calendarPack, 980), { forPurchase: true }).policyVersion, CALENDAR_POLICY_VERSION);
});

test('任意の同額Price・環境違い・金額/税/周期違いを拒否する', () => {
  const good = price(prices.calendarMonthly, 600, true);
  for (const patch of [{ id: 'price_unknown' }, { livemode: true }, { unit_amount: 480 }, { currency: 'usd' }, { tax_behavior: 'exclusive' }, { type: 'one_time' }, { recurring: { interval: 'month', interval_count: 2 } }, { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } }, { recurring: null }, { deleted: true }]) {
    assert.throws(() => registry.resolve({ ...good, ...patch }), /price-policy-mismatch/);
  }
  assert.throws(() => registry.resolve(price(prices.calendarPack, 980, true)), /price-policy-mismatch/);
  const live = createBillingPriceRegistry({ sandbox: false, prices });
  assert.throws(() => live.resolve(good), /price-policy-mismatch/);
  assert.equal(live.resolve({ ...good, livemode: true }).amount, 600);
});

test('過去の無効Priceは通知照合のみ許可し、旧版では新規購入しない', () => {
  const old = { ...price(prices.legacyPack, 980), active: false };
  assert.equal(registry.resolve(old).amount, 980);
  assert.throws(() => registry.resolve(old, { forPurchase: true }), /price-policy-mismatch/);
  assert.throws(() => registry.resolve(price(prices.legacyMonthly, 480, true), { forPurchase: true }), /price-policy-mismatch/);
  assert.throws(() => registry.resolve({ ...price(prices.calendarPack, 980), active: false }, { forPurchase: true }), /price-policy-mismatch/);
});

test('同額でもPriceの使い回しや不完全な環境指定を拒否する', () => {
  assert.throws(() => createBillingPriceRegistry({ sandbox: true, prices: { legacyPack: 'price_same', calendarPack: 'price_same' } }), /ambiguous/);
  for (const args of [{ sandbox: 'true', prices }, { sandbox: true, prices: {} }, { sandbox: true, prices: { typo: 'price_test' } }, { sandbox: true, prices: { calendarPack: '' } }]) assert.throws(() => createBillingPriceRegistry(args));
});

const original = { id: 'in_old', chargeId: 'ch_old', subscriptionId: 'sub_old', planId: 'monthly', startsAt: 1000, expiresAt: 2000, revoked: false };
const recomputed = { ...original, startsAt: 900, expiresAt: 3000, policyVersion: CALENDAR_POLICY_VERSION };
test('既存の版なし記録も期限/追加情報をそのまま残し、再送で延長しない', () => {
  assert.deepEqual(preserveGrantOnReplay(original, recomputed), original);
  const versioned = { ...original, policyVersion: LEGACY_POLICY_VERSION, audit: 'keep' };
  assert.deepEqual(preserveGrantOnReplay(versioned, recomputed), versioned);
  assert.deepEqual(preserveGrantOnReplay(null, recomputed), recomputed);
});

test('失効済み記録・先行取消しマーカーは再送で復活しない', () => {
  for (const [previous, next, marker] of [[{ ...original, revoked: true }, recomputed, false], [original, { ...recomputed, revoked: true }, false], [original, recomputed, true], [null, recomputed, true]]) {
    assert.equal(preserveGrantOnReplay(previous, next, marker).revoked, true);
  }
});

test('異なる決済/契約との衝突や不正期限は保存を拒否する', () => {
  for (const patch of [{ id: 'in_other' }, { chargeId: 'ch_other' }, { subscriptionId: 'sub_other' }, { planId: 'pack' }]) assert.throws(() => preserveGrantOnReplay(original, { ...recomputed, ...patch }), /identity/);
  for (const patch of [{ startsAt: -1 }, { expiresAt: 1000 }, { expiresAt: NaN }, { planId: 'unknown' }]) assert.throws(() => preserveGrantOnReplay(null, { ...original, ...patch }), /invalid-grant/);
});
