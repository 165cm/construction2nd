// 新方式専用。旧Priceの通知や保存済み利用権の計算には接続しない。
export const CALENDAR_POLICY_VERSION = 'jst-calendar-v1';
export const CALENDAR_PLANS = Object.freeze({
  monthly: Object.freeze({ amount: 600, currency: 'jpy', months: 1 }),
  pack: Object.freeze({ amount: 980, currency: 'jpy', months: 3 }),
});
const JST_OFFSET = 9 * 60 * 60 * 1000;

function joinedDate(joinedAt) {
  if (!Number.isSafeInteger(joinedAt) || joinedAt < 0) throw new Error('invalid-join-date');
  const date = new Date(joinedAt + JST_OFFSET);
  if (!Number.isFinite(date.getTime())) throw new Error('invalid-join-date');
  return date;
}

// 対応日があればその日0時。なければ対象月末の翌日0時（末日いっぱい）。
// 月をまたぐたびの加算ではなく、常に最初の加入日から求めて日付のずれを防ぐ。
export function calendarBoundary(joinedAt, monthsFromStart) {
  const joined = joinedDate(joinedAt);
  if (!Number.isSafeInteger(monthsFromStart) || monthsFromStart < 1) throw new Error('invalid-month-offset');
  const target = new Date(Date.UTC(joined.getUTCFullYear(), joined.getUTCMonth() + monthsFromStart, 1));
  if (!Number.isFinite(target.getTime())) throw new Error('invalid-month-offset');
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = joined.getUTCDate();
  const boundary = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day <= lastDay ? day : lastDay + 1) - JST_OFFSET;
  if (!Number.isSafeInteger(boundary) || !Number.isFinite(new Date(boundary).getTime())) throw new Error('invalid-boundary');
  return boundary;
}

export function calendarPeriod(joinedAt, planId, periodIndex = 0) {
  joinedDate(joinedAt);
  if (!Object.hasOwn(CALENDAR_PLANS, planId)) throw new Error('unknown-calendar-plan');
  if (!Number.isSafeInteger(periodIndex) || periodIndex < 0) throw new Error('invalid-period-index');
  if (planId === 'pack' && periodIndex !== 0) throw new Error('pack-does-not-renew');
  const months = CALENDAR_PLANS[planId].months;
  const startsAt = periodIndex === 0 ? joinedAt : calendarBoundary(joinedAt, months * periodIndex);
  const expiresAt = calendarBoundary(joinedAt, months * (periodIndex + 1));
  if (expiresAt <= startsAt) throw new Error('invalid-period');
  return { startsAt, expiresAt };
}
