import React, { useId, useState } from 'react';
import './PurchaseConfirmation.css';
import BillingPeriodIllustration from './BillingPeriodIllustration';

const names = { terms: '利用規約', privacy: 'プライバシーポリシー', trade: '特定商取引法に基づく表記' };

function ConfirmationBody({ planId, busy = false, onBack, onContinue, legalLinks, documentsReady = false, sandbox = false }) {
  const [accepted, setAccepted] = useState(false);
  const id = useId();
  const pack = planId === 'pack';
  const ready = documentsReady && Object.keys(names).every(key => typeof legalLinks?.[key] === 'string' && legalLinks[key].startsWith('/') && !legalLinks[key].startsWith('//'));
  return <section className="purchase-confirmation" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>購入内容の確認</h2>
    {sandbox && <p className="purchase-note">テスト決済です。実際の請求はありません。</p>}
    <div className="purchase-summary">
      <h3>{pack ? '3か月集中パック' : '月額プラン'}</h3>
      <p className="purchase-price">{pack ? '総額980円' : '600円／月'}<span>（税込）</span></p>
      <p><strong>{pack ? '1回の一括払い・自動更新なし' : '初回600円、以後毎月600円・解約まで自動更新'}</strong></p>
      {!pack && <p>6回の支払いで3,600円、12回で7,200円。最低契約期間はありません。</p>}
    </div>
    <BillingPeriodIllustration planId={planId} />
    <dl>
      <dt>利用できる内容</dt><dd>現収録の5回250問の問題・解説・復習・模擬試験。両プランの学習機能は同じです。</dd>
      <dt>期間・利用開始</dt><dd>{pack ? '決済完了日を加入日とし、3か月後の同日の前日23:59まで利用できます。終了後の追加請求はありません。' : '決済完了日を加入日とし、翌月同日の前日23:59まで利用できます。次の期間は同日0:00から始まり、毎月自動更新します。'}同じ日がない月は、その月の末日23:59までとなります。いずれも日本時間です。決済と利用権の確認ができ次第、利用を開始できます。</dd>
      <dt>支払い方法・追加負担</dt><dd>カード決済。支払い情報はStripeの画面で入力します。表示価格以外に運営が請求する追加料金はありません。通信料等はご自身の負担です。</dd>
      <dt>解約</dt><dd>{pack ? '期間終了時に自動終了するため、解約手続きは不要です。' : 'アプリの「契約管理・月額の解約」から、表示された次回更新日時より前に手続きを完了してください。解約後も支払済み期間の終了まで利用できます。'}</dd>
      <dt>キャンセル・返金</dt><dd>購入者都合の返金は原則として受け付けません。途中解約・未使用による日割りや残期間分の返金はありません。重複請求は重複分を返金します。不具合はまず復旧に対応し、運営側の原因で利用不能を解消できない場合は、該当支払いを全額返金します。法令に基づく権利を制限しません。</dd>
      <dt>お問い合わせ</dt><dd><a href="mailto:construction2nd-support@googlegroups.com">construction2nd-support@googlegroups.com</a><br />支払済みで利用できない場合は、追加購入せず「支払い・利用期限を再確認」をお試しください。</dd>
    </dl>
    <nav aria-label="購入前に確認する文書" className="purchase-documents">
      {Object.entries(names).map(([key, name]) => ready ? <a key={key} href={legalLinks[key]} target="_blank" rel="noopener noreferrer">{name}（別タブ）</a> : <span key={key}>{name}（準備中）</span>)}
    </nav>
    {!ready && <p role="status" className="purchase-note">必要な文書を準備中のため、購入手続きには進めません。</p>}
    <form onSubmit={event => { event.preventDefault(); if (accepted && ready && !busy) onContinue?.(); }}>
      <label className="purchase-consent"><input type="checkbox" checked={accepted} disabled={busy || !ready} onChange={event => setAccepted(event.target.checked)} />
        <span>購入内容と利用規約を確認しました。18歳未満の場合は、保護者など法定代理人の同意を得ています。</span>
      </label>
      <div className="purchase-actions">
        <button type="button" disabled={busy} onClick={onBack}>プラン選択へ戻る</button>
        <button type="submit" disabled={!accepted || !ready || busy}>{busy ? '確認・処理中…' : sandbox ? 'Stripeでテスト決済に進む' : 'Stripeで支払いに進む'}</button>
      </div>
      <p className="purchase-small">次のStripe画面でも内容を確認できます。このボタンだけでは支払いは完了しません。</p>
    </form>
  </section>;
}

export default function PurchaseConfirmation(props) {
  if (!['pack', 'monthly'].includes(props.planId)) return null;
  // プランやアカウントが変わると、以前の確認状態を引き継がない。
  return <ConfirmationBody key={`${props.accountKey ?? ''}:${props.planId}:${props.documentsReady === true}`} {...props} />;
}
