import HelpTip from './HelpTip';
import BillingPanel from './BillingPanel';
import React, { useEffect, useState } from 'react';
import { observeAccount, loginGoogle, logoutAccount, readCloudBackup, writeCloudBackup } from '../services/cloudBackup';
import { createLearningBackup, inspectLearningBackup, restoreLearningBackup } from '../utils/backup';
import { hasUnsavedChanges } from '../utils/saveRecovery';

export default function AccountPanel() {
  const [account, setAccount] = useState(undefined);
  const [remote, setRemote] = useState(undefined);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  useEffect(() => observeAccount(user => { setAccount(user); setRemote(undefined); setConfirmation(null); setMessage(''); }), []);
  async function perform(action, label = '処理中…') {
    setBusy(label); setMessage('');
    try { await action(); } catch (error) { setMessage(error.code?.startsWith('auth/') ? 'ログインできませんでした。ポップアップの許可と接続を確認して再試行してください。' : error.message || '接続できませんでした。再試行してください。'); }
    finally { setBusy(''); }
  }
  async function refresh() { setRemote(await readCloudBackup(account.uid)); }
  async function confirmAction() {
    if (hasUnsavedChanges()) throw new Error('先に端末への保存を再試行してください');
    const action = confirmation; setConfirmation(null);
    if (action === 'upload') {
      if (hasUnsavedChanges()) throw new Error('端末への保存を再試行してからクラウドに保存してください');
      await writeCloudBackup(account.uid, createLearningBackup(), remote?.revision || 0);
      await refresh(); setMessage('クラウドに保存しました');
    } else if (action === 'download') {
      const latest = await readCloudBackup(account.uid);
      if (!latest || latest.revision !== remote?.revision) { setRemote(latest); throw new Error('クラウドの記録が変わりました。内容を確認してやり直してください'); }
      const inspected = inspectLearningBackup(latest.payload);
      if (!inspected.ok) throw new Error(inspected.error);
      restoreLearningBackup(inspected.backup);
      window.location.reload();
    }
  }
  const button = 'min-h-[44px] px-3 rounded-lg bg-slate-700 text-xs disabled:opacity-50';
  return <>
  <section className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
    <HelpTip title="アカウント・クラウド保存" label="クラウド保存について">手動で保存・読み込みします。ログインだけでは記録を送信しません。共用端末では、自分の記録か確認してください。</HelpTip>
    {account === undefined ? <p className="text-xs">ログイン状態を確認中…</p> : !account ? <>
      <p className="text-xs text-slate-400">端末間で学習記録を引き継げます。</p>
      <button disabled={busy} className={button} onClick={() => perform(loginGoogle)}>Googleでログイン</button>
    </> : <>
      <p className="text-xs break-all">{account.email || account.displayName || 'ログイン中'}</p>

      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={button} onClick={() => perform(refresh, '保存状況を確認中…')}>クラウドの状態を再確認</button>
        <button disabled={busy} className={button} onClick={() => perform(logoutAccount)}>ログアウト</button>
      </div>
      {remote !== undefined && <>
        <p className="text-xs">{remote ? `保存済み：${remote.updatedAt?.toDate?.().toLocaleString('ja-JP') || '日時を確認中'}` : 'クラウドの記録はまだありません'}</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className={button} onClick={() => { setMessage(''); setConfirmation('upload'); }}>この端末の記録を保存</button>
          {remote && <button disabled={busy} className={button} onClick={() => { setMessage(''); setConfirmation('download'); }}>この端末に読み込む</button>}
        </div>
      </>}
    </>}
    {confirmation && <div className="border border-amber-500 rounded-lg p-3 text-xs" role="alert">
      <p>{confirmation === 'upload' ? (remote ? 'クラウドの記録を、この端末の記録で上書きします。' : 'この端末の記録を、表示中のアカウントに保存します。') : 'この端末の記録と設定を、クラウドの記録で置き換えます。必要なら先にファイルへ書き出してください。'}よろしいですか？</p>
      <div className="flex gap-2 mt-2"><button disabled={busy} className={button} onClick={() => perform(confirmAction, confirmation === 'upload' ? '保存中…' : '読み込み中…')}>{confirmation === 'download' ? 'この端末の記録を置き換える' : remote ? '上書き保存する' : '保存する'}</button><button disabled={busy} className={button} onClick={() => setConfirmation(null)}>戻る</button></div>
    </div>}
    {busy && <p role="status" className="text-sm text-sky-200">{busy}</p>}
    {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
  </section>
  {account && <section className="mt-4" aria-label="料金・利用期限"><BillingPanel key={account.uid} uid={account.uid} /></section>}
  </>;
}
