import React from 'react';

export default function PricingPlans({ enabled = false, busy = false, hasAccess = false, expiresAt = null, onChoose, onManage, onRefresh }) {
  const button = 'min-h-[44px] w-full rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50';
  return <section className="space-y-3" aria-labelledby="pricing-title">
    <h4 id="pricing-title" className="font-bold text-sm">試験までの学習プラン</h4>
    <p className="text-xs text-slate-300">最新1回50問は無料。有料プランでは過去分を含む全250問の解説・復習・模試を利用できます。</p>
    {!enabled && <p role="status" className="text-xs text-amber-200">有料プランは準備中です。現在は購入できません。</p>}
    {hasAccess ? <div className="rounded-xl border border-emerald-500 p-3 space-y-2">
      <p className="text-sm font-bold">全年度を利用できます</p>
      <p className="text-xs">利用期限：{new Date(expiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）</p>
      <p className="text-xs text-slate-300">利用期間中の追加購入は不要です。</p>
    </div> : <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border-2 border-emerald-500 bg-emerald-950/30 p-3 space-y-2">
        <p className="text-xs font-bold text-emerald-300">試験まで集中して取り組む方に</p>
        <h5 className="font-bold">3か月集中パック</h5>
        <p className="text-2xl font-bold">980円<span className="text-xs font-normal">（税込・一括）</span></p>
        <p className="text-sm font-bold">自動更新なし</p>
        <p className="text-xs text-slate-300">支払日時から暦の3か月間。終了後の請求はありません。</p>
        <p className="text-xs text-slate-300">月額を3回支払う場合より460円お得。</p>
        <button className={`${button} bg-emerald-600 text-white`} disabled={!enabled || busy} onClick={() => onChoose?.('pack')}>3か月パックの内容を確認</button>
      </div>
      <div className="rounded-xl border border-slate-600 p-3 space-y-2">
        <p className="text-xs text-slate-300">1か月から始める方に</p>
        <h5 className="font-bold">月額プラン</h5>
        <p className="text-2xl font-bold">480円<span className="text-xs font-normal">（税込／月）</span></p>
        <p className="text-sm font-bold">毎月自動更新</p>
        <p className="text-xs text-slate-300">契約管理から解約できます。解約後も支払済み期間の終了まで利用できます。</p>
        <p className="text-xs text-slate-300">1〜2か月の利用なら月額の総額が低くなります。</p>
        <button className={`${button} bg-slate-700`} disabled={!enabled || busy} onClick={() => onChoose?.('monthly')}>月額プランの内容を確認</button>
      </div>
    </div>}
    <p className="text-xs text-slate-400">どちらも学習機能は同じです。期限後も学習記録は残り、最新の無料問題を続けられます。</p>
    <div className="flex flex-wrap gap-2">
      {onRefresh && <button disabled={busy} className="min-h-[44px] px-3 text-xs rounded-lg bg-slate-700" onClick={onRefresh}>支払い・利用期限を再確認</button>}
      {enabled && onManage && <button disabled={busy} className="min-h-[44px] px-3 text-xs rounded-lg bg-slate-700" onClick={onManage}>契約管理・月額の解約</button>}
    </div>
  </section>;
}
