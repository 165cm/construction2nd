// 保存に失敗した最新値だけをメモリに保持。再試行で古い値に戻さない。
const pending = new Map();
const listeners = new Set();
let failed = false;
const notify = () => { failed = pending.size > 0; listeners.forEach(fn => fn()); };
export const subscribeSaveStatus = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const hasUnsavedChanges = () => failed;
export const writeStoredJSON = (key, value) => {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(key, serialized);
    pending.delete(key);
    notify();
    return true;
  } catch {
    pending.set(key, serialized);
    notify();
    return false;
  }
};
export const retryPendingSaves = () => {
  for (const [key, value] of pending) {
    try { localStorage.setItem(key, value); pending.delete(key); } catch { /* 表示を維持 */ }
  }
  notify();
  return !failed;
};
