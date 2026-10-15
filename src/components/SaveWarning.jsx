import React, { useSyncExternalStore } from 'react';
import { subscribeSaveStatus, hasUnsavedChanges, retryPendingSaves } from '../utils/saveRecovery';
export default function SaveWarning() {
  const failed = useSyncExternalStore(subscribeSaveStatus, hasUnsavedChanges, () => false);
  if (!failed) return null;
  return <aside role="alert" className="max-w-md mx-auto m-3 p-3 border border-amber-400 rounded-xl bg-amber-950 text-amber-100 text-sm">
    <strong>この端末に保存できていません</strong>
    <p className="mt-1 text-xs">ページを閉じると今回の記録が失われます。空き容量やブラウザの保存設定を確認してから再試行してください。</p>
    <button className="mt-2 min-h-[44px] px-4 rounded-lg bg-amber-200 text-slate-950 font-bold" onClick={retryPendingSaves}>保存を再試行</button>
  </aside>;
}
