import React from 'react';

export default function BillingPeriodIllustration({ planId }) {
  const pack = planId === 'pack';
  return <figure className="billing-period" aria-label={pack ? '3か月パックの利用期間の例' : '月額プランの利用期間の例'}>
    <figcaption>例：10月10日に決済が完了した場合（日本時間）</figcaption>
    <ol>
      <li><span className="period-dot" aria-hidden="true" /><strong>10月10日</strong><span>加入・利用開始</span><span>{pack ? '980円を一括払い' : '初回600円'}</span></li>
      <li><span className="period-dot" aria-hidden="true" /><strong>{pack ? '翌年1月9日' : '11月9日'}</strong><span>23:59まで利用できます</span></li>
      <li><span className="period-dot" aria-hidden="true" /><strong>{pack ? '翌年1月10日' : '11月10日'}</strong><span>{pack ? '0:00に期間終了' : '0:00から次の利用期間'}</span><span>{pack ? '自動更新・追加請求なし' : '次の1か月分600円'}</span></li>
    </ol>
    <p>{pack ? '加入日の3か月後の同日の前日まで。期間終了後は自動更新されません。' : '加入日の翌月同日の前日まで。解約するまで、毎月同じ加入日を基準に更新します。'}</p>
  </figure>;
}
