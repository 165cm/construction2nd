import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarBoundary, calendarPeriod, CALENDAR_PLANS } from '../calendarBillingPolicy.js';
import { accessSummary, packGrant, monthlyGrant } from '../billingPolicy.js';

const ms = value => Date.parse(value);
test('通常日の初回は決済時刻から翌月同日の0時直前まで', () => {
  const joined = ms('2026-10-10T16:25:00+09:00');
  const first = calendarPeriod(joined, 'monthly');
  assert.deepEqual(first, { startsAt: joined, expiresAt: ms('2026-11-10T00:00:00+09:00') });
  assert.equal(accessSummary([first], ms('2026-11-09T23:59:59.999+09:00')).hasAccess, true);
  assert.equal(accessSummary([first], ms('2026-11-10T00:00:00+09:00')).hasAccess, false);
  assert.equal(accessSummary([first], joined - 1).hasAccess, false);
});
test('月末の対応日なしは末日いっぱい・元の加入日に復帰', () => {
  const joined = ms('2027-01-31T12:00:00+09:00');
  assert.equal(calendarBoundary(joined, 1), ms('2027-03-01T00:00:00+09:00'));
  assert.deepEqual(calendarPeriod(joined, 'monthly', 1), {
    startsAt: ms('2027-03-01T00:00:00+09:00'), expiresAt: ms('2027-03-31T00:00:00+09:00'),
  });
  assert.equal(calendarBoundary(joined, 3), ms('2027-05-01T00:00:00+09:00'));
});
test('1日・28～31日・閏年・年越しを日本時間で扱う', () => {
  for (const [joined, end] of [
    ['2026-10-01T23:50:00+09:00', '2026-11-01T00:00:00+09:00'],
    ['2027-01-28T08:00:00+09:00', '2027-02-28T00:00:00+09:00'],
    ['2027-01-29T08:00:00+09:00', '2027-03-01T00:00:00+09:00'],
    ['2027-01-30T08:00:00+09:00', '2027-03-01T00:00:00+09:00'],
    ['2028-01-29T08:00:00+09:00', '2028-02-29T00:00:00+09:00'],
    ['2028-01-31T08:00:00+09:00', '2028-03-01T00:00:00+09:00'],
    ['2026-12-10T08:00:00+09:00', '2027-01-10T00:00:00+09:00'],
    ['2026-10-09T15:30:00Z', '2026-11-10T00:00:00+09:00'],
  ]) assert.equal(calendarPeriod(ms(joined), 'monthly').expiresAt, ms(end), joined);
});
test('3か月パックも前日末まで・対応日なしは末日まで・自動更新しない', () => {
  assert.equal(calendarPeriod(ms('2026-10-10T16:00:00+09:00'), 'pack').expiresAt, ms('2027-01-10T00:00:00+09:00'));
  assert.equal(calendarPeriod(ms('2027-01-31T16:00:00+09:00'), 'pack').expiresAt, ms('2027-05-01T00:00:00+09:00'));
  assert.equal(calendarPeriod(ms('2027-11-30T16:00:00+09:00'), 'pack').expiresAt, ms('2028-03-01T00:00:00+09:00'));
  assert.throws(() => calendarPeriod(ms('2026-10-10'), 'pack', 1));
});
test('連続期間の境界に空白・重複・月末からの日付ずれがない', () => {
  for (const joined of ['2027-01-31T12:00:00+09:00', '2027-02-01T12:00:00+09:00', '2028-02-29T12:00:00+09:00']) {
    let previous = calendarPeriod(ms(joined), 'monthly');
    for (let index = 1; index <= 24; index++) {
      const next = calendarPeriod(ms(joined), 'monthly', index);
      assert.equal(previous.expiresAt, next.startsAt);
      assert.ok(next.expiresAt > next.startsAt);
      previous = next;
    }
  }
});
test('不正な日時・回数・プランは拒否、新料金を固定', () => {
  assert.equal(CALENDAR_PLANS.monthly.amount, 600);
  assert.equal(CALENDAR_PLANS.pack.amount, 980);
  for (const value of [NaN, Infinity, -1, 1.5, '2026-10-10']) assert.throws(() => calendarPeriod(value, 'monthly'));
  for (const value of [0, -1, .5, NaN, Number.MAX_SAFE_INTEGER]) assert.throws(() => calendarBoundary(0, value));
  for (const value of [-1, .5, NaN, Infinity]) assert.throws(() => calendarPeriod(0, 'monthly', value));
  for (const id of ['unknown', '__proto__', 'constructor', null]) assert.throws(() => calendarPeriod(0, id));
});
test('旧480円の月額通知と旧980円パックの期限計算は維持', () => {
  const joined = ms('2026-01-31T12:00:00+09:00');
  const old = { id: 'cs_legacy', mode: 'payment', payment_status: 'paid', amount_total: 980, currency: 'jpy',
    line_items: { data: [{ price: { id: 'price_legacy_pack' }, quantity: 1 }] },
    payment_intent: { latest_charge: { id: 'ch_legacy', paid: true, captured: true, currency: 'jpy', amount: 980, created: joined / 1000 } } };
  assert.equal(packGrant(old, 'price_legacy_pack').expiresAt, ms('2026-04-30T12:00:00+09:00'));
  const invoice = { id: 'in_legacy', paid: true, status: 'paid', amount_paid: 480, currency: 'jpy', subscription: 'sub_legacy',
    charge: { id: 'ch_old_monthly', paid: true, captured: true, amount: 480, currency: 'jpy' },
    lines: { data: [{ price: { id: 'price_legacy_monthly' }, quantity: 1, period: { start: 100, end: 200 } }] } };
  assert.equal(monthlyGrant(invoice, 'price_legacy_monthly').expiresAt, 200000);
});

test('JSTの基準日をUTC指定へ変換し、月末補正後も元の日に戻る', async () => {
  const { calendarAnchorConfig } = await import('../calendarBillingPolicy.js');
  for (let day = 1; day <= 31; day += 1) {
    const joined = Date.parse(`2027-01-${String(day).padStart(2, '0')}T12:00:00+09:00`);
    const config = calendarAnchorConfig(joined);
    assert.deepEqual(config, { day_of_month: day === 1 ? 31 : day - 1, hour: 15, minute: 0, second: 0 });
    // UTCの月末丸めを模擬し、各回のJST暦計算と照合（Stripe実動作の証明とは区別）。
    const first = new Date(calendarBoundary(joined, 1));
    for (let offset = 0; offset < 24; offset += 1) {
      const year = first.getUTCFullYear();
      const month = first.getUTCMonth() + offset;
      const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const actual = Date.UTC(year, month, Math.min(config.day_of_month, last), config.hour);
      assert.equal(actual, calendarBoundary(joined, offset + 1));
    }
  }
  assert.throws(() => calendarAnchorConfig(NaN), /invalid-join-date/);
});
