import BillingPanel from './BillingPanel';
import React, { useEffect, useState } from 'react';
import { observeAccount, loginGoogle, logoutAccount, readCloudBackup, writeCloudBackup } from '../services/cloudBackup';
import { createLearningBackup, inspectLearningBackup, restoreLearningBackup } from '../utils/backup';
import { hasUnsavedChanges } from '../utils/saveRecovery';

export default function AccountPanel() {
  const [account, setAccount] = useState(undefined);
  const [remote, setRemote] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  useEffect(() => observeAccount(user => { setAccount(user); setRemote(undefined); setConfirmation(null); setMessage(''); }), []);
  async function perform(action) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error.code?.startsWith('auth/') ? 'ログインできませんでした。ポップアップの許可と接続を確認して再試行してください。' : error.message || '接続できませんでした。再試行してください。'); }
    finally { setBusy(false); }
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
  return <section className="p-3 rounded-xl bg-slate-800 border border-slate-700 space-y-2">
    <h4 className="font-bold text-sm">アカウント・クラウド保存</h4>
    {account === undefined ? <p className="text-xs">ログイン状態を確認中…</p> : !account ? <>
      <p className="text-xs text-slate-400">ログインして端末間で記録を引き継げます。ログインだけでは記録を送信しません。</p>
      <button disabled={busy} className={button} onClick={() => perform(loginGoogle)}>Googleでログイン</button>
    </> : <>
      <p className="text-xs break-all">{account.email || account.displayName || 'ログイン中'}</p>
      <p className="text-xs text-slate-400">手動で保存・読込します。共用端末では別の人の記録を保存しないよう確認してください。</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={button} onClick={() => perform(refresh)}>クラウドの状態を再確認</button>
        <button disabled={busy} className={button} onClick={() => perform(logoutAccount)}>ログアウト</button>
      </div>
      {remote !== undefined && <>
        <p className="text-xs">{remote ? `保存済み：${remote.updatedAt?.toDate?.().toLocaleString('ja-JP') || '日時を確認中'}` : 'クラウドの記録はまだありません'}</p>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className={button} onClick={() => setConfirmation('upload')}>この端末の記録を保存</button>
          {remote && <button disabled={busy} className={button} onClick={() => setConfirmation('download')}>この端末に読み込む</button>}
        </div>
      </>}
    </>}
    {account && <BillingPanel key={account.uid} uid={account.uid} />}
    {confirmation && <div className="border border-amber-500 rounded-lg p-3 text-xs" role="alert">
      <p>{confirmation === 'upload' ? '表示中のアカウントのクラウド記録を、この端末の記録で置き換えます。' : 'この端末の記録と設定を、クラウドの記録で置き換えます。必要なら先にファイルへ書き出してください。'}よろしいですか？</p>
      <div className="flex gap-2 mt-2"><button disabled={busy} className={button} onClick={() => perform(confirmAction)}>置き換える</button><button disabled={busy} className={button} onClick={() => setConfirmation(null)}>戻る</button></div>
    </div>}
    {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
  </section>;
}
