import test from 'node:test';
import assert from 'node:assert/strict';
import { addThreeMonths, checkoutParams, assertConfiguredPrice, packGrant, monthlyGrant, mergeGrant, accessSummary } from '../billingPolicy.js';
const charge = amount => ({ id: 'ch_test', paid: true, captured: true, currency: 'jpy', amount, created: Date.parse('2026-01-31T12:00:00+09:00') / 1000, amount_refunded: 0, disputed: false });
const pack = () => ({ id: 'cs_test', mode: 'payment', payment_status: 'paid', amount_total: 980, currency: 'jpy', line_items: { data: [{ price: { id: 'price_pack' }, quantity: 1 }] }, payment_intent: { latest_charge: charge(980) } });
const invoice = () => ({ id: 'in_test', paid: true, status: 'paid', amount_paid: 480, currency: 'jpy', subscription: 'sub_test', charge: charge(480), lines: { data: [{ price: { id: 'price_monthly' }, quantity: 1, proration: false, period: { start: 100, end: 200 } }] } });
test('暦の3か月：月末・うるう年・年越し・日本時間を保持', () => {
  for (const [start, end] of [['2026-01-31', '2026-04-30'], ['2023-11-30', '2024-02-29'], ['2024-11-30', '2025-02-28'], ['2026-12-01', '2027-03-01']]) {
    assert.equal(addThreeMonths(Date.parse(`${start}T00:01:02+09:00`)), Date.parse(`${end}T00:01:02+09:00`));
  }
  assert.throws(() => addThreeMonths(NaN));
});
test('購入は固定プラン・価格ID・数量、戻り先はHTTPS', () => {
  const input = { planId: 'pack', priceId: 'price_pack', customerId: 'cus_test', uid: 'user', origin: 'https://example.com/construction2nd/', expiresAt: 123 };
  const params = checkoutParams(input);
  assert.deepEqual(params.line_items, [{ price: 'price_pack', quantity: 1 }]);
  assert.equal(params.mode, 'payment');
  assert.equal(params.success_url, 'https://example.com/construction2nd/?payment=success');
  assert.equal(checkoutParams({ ...input, planId: 'monthly' }).mode, 'subscription');
  for (const planId of ['free', '__proto__', 'constructor', null]) assert.throws(() => checkoutParams({ ...input, planId }));
  assert.throws(() => checkoutParams({ ...input, origin: 'http://example.com' }));
});
test('税込980円一括・480円毎月以外の価格を拒否', () => {
  const price = { active: true, currency: 'jpy', unit_amount: 980, tax_behavior: 'inclusive', recurring: null };
  assert.doesNotThrow(() => assertConfiguredPrice(price, 'pack'));
  for (const patch of [{ active: false }, { currency: 'usd' }, { unit_amount: 480 }, { tax_behavior: 'exclusive' }, { recurring: { interval: 'month' } }]) assert.throws(() => assertConfiguredPrice({ ...price, ...patch }, 'pack'));
  assert.doesNotThrow(() => assertConfiguredPrice({ ...price, unit_amount: 480, recurring: { interval: 'month', interval_count: 1 } }, 'monthly'));
  assert.throws(() => assertConfiguredPrice({ ...price, unit_amount: 480, recurring: { interval: 'year', interval_count: 1 } }, 'monthly'));
});
test('支払確認前・異なる価格や金額・未捕捉のカードは解放しない', () => {
  for (const change of [s => s.payment_status = 'unpaid', s => s.amount_total = 1, s => s.currency = 'usd', s => s.line_items.data[0].quantity = 2, s => s.line_items.data[0].price.id = 'price_other', s => s.payment_intent.latest_charge.captured = false]) {
    const s = pack(); change(s); assert.equal(packGrant(s, 'price_pack'), null);
  }
  const grant = packGrant(pack(), 'price_pack');
  assert.equal(grant.expiresAt, Date.parse('2026-04-30T12:00:00+09:00'));
  assert.deepEqual(packGrant(pack(), 'price_pack'), grant); // 再送で延長しない
});
test('月額は支払済みの請求期間だけ解放、失敗・日割りは拒否', () => {
  assert.equal(monthlyGrant(invoice(), 'price_monthly').expiresAt, 200000);
  for (const change of [i => i.paid = false, i => i.amount_paid = 0, i => i.charge = 'ch_unexpanded', i => i.lines.data[0].proration = true, i => i.lines.data[0].period.end = NaN]) {
    const i = invoice(); change(i); assert.equal(monthlyGrant(i, 'price_monthly'), null);
  }
});
test('返金・異議申立て・順序逆転でも再送で利用権が復活しない', () => {
  const s = pack(); s.payment_intent.latest_charge.amount_refunded = 1;
  const revoked = packGrant(s, 'price_pack'); assert.equal(revoked.revoked, true);
  const valid = packGrant(pack(), 'price_pack');
  assert.equal(mergeGrant(revoked, valid).revoked, true);
  assert.equal(mergeGrant(null, valid, true).revoked, true);
  s.payment_intent.latest_charge.amount_refunded = 0; s.payment_intent.latest_charge.disputed = true;
  assert.equal(packGrant(s, 'price_pack').revoked, true);
});
test('開始時刻は含み終了時刻は含まない、別の有効な利用権は残す', () => {
  const valid = { startsAt: 100, expiresAt: 200, revoked: false };
  assert.equal(accessSummary([valid], 99).hasAccess, false);
  assert.equal(accessSummary([valid], 100).hasAccess, true);
  assert.equal(accessSummary([valid], 200).hasAccess, false);
  assert.deepEqual(accessSummary([{ ...valid, revoked: true }, { ...valid, expiresAt: 300 }], 150), { hasAccess: true, expiresAt: 300 });
});
