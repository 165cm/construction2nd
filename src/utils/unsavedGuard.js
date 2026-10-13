// 管理画面の「保存していない変更」を見張る。
// 編集画面が変更の有無を知らせ、画面を移る側（タブ切り替え・アプリに戻る・ページを閉じる）が確認を出す。
let hasUnsaved = false;

export const setUnsavedChanges = (value) => {
  hasUnsaved = Boolean(value);
};

export const hasUnsavedChanges = () => hasUnsaved;

// 保存していない変更があれば確認する。移ってよければ true
export const confirmDiscardUnsaved = () => {
  if (!hasUnsaved) return true;
  const ok = window.confirm('保存していない変更があります。\n保存せずに移動しますか？（変更は消えます）');
  if (ok) hasUnsaved = false;
  return ok;
};
