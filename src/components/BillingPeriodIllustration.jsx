import React from 'react';
import { calendarPeriod } from '../../functions/calendarBillingPolicy.js';

const monthDay = value => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric' }).format(value);

export default function BillingPeriodIllustration({ planId }) {
  const pack = planId === 'pack';
  const joinedAt = Date.parse('2027-01-31T12:00:00+09:00');
  const first = calendarPeriod(joinedAt, planId);
  const next = pack ? null : calendarPeriod(joinedAt, planId, 1);
  return <figure className="billing-period" aria-label={pack ? '3か月パックの利用期間の例' : '月額プランの利用期間の例'}>
    <figcaption>例：10月10日に決済が完了した場合（日本時間）</figcaption>
    <ol>
      <li><span className="period-dot" aria-hidden="true" /><strong>10月10日</strong><span>加入・利用開始</span><span>{pack ? '980円を一括払い' : '初回600円'}</span></li>
      <li><span className="period-dot" aria-hidden="true" /><strong>{pack ? '翌年1月9日' : '11月9日'}</strong><span>23:59まで利用できます</span></li>
      <li><span className="period-dot" aria-hidden="true" /><strong>{pack ? '翌年1月10日' : '11月10日'}</strong><span>{pack ? '0:00に期間終了' : '0:00から次の利用期間'}</span><span>{pack ? '自動更新・追加請求なし' : '次の1か月分600円'}</span></li>
    </ol>
    <p>{pack ? '加入日の3か月後の同日の前日まで。期間終了後は自動更新されません。' : '加入日の翌月同日の前日まで。解約するまで、毎月同じ加入日を基準に更新します。'}</p>
    <details className="billing-month-end">
      <summary>月末加入の例：同じ日がない月はどうなる？</summary>
      <p>例：2027年1月31日加入。同じ日がない月は、その月の末日23:59まで利用できます。</p>
      <p><strong>初回：</strong>1月31日〜{monthDay(first.expiresAt - 1)}23:59まで</p>
      {next && <><p><strong>次の期間：</strong>{monthDay(next.startsAt)}0:00〜{monthDay(next.expiresAt - 1)}23:59まで</p>
        <p>{monthDay(next.expiresAt)}0:00から次の期間に入り、元の加入日「31日」を基準に続きます。</p></>}
      {pack && <p>{monthDay(first.expiresAt)}0:00に終了します。自動更新・追加請求はありません。</p>}
    </details>
  </figure>;
}
