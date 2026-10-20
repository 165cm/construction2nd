import { observeAccount } from './cloudBackup';
import { billingCall } from './billing';
import { setPrivateOwner, clearPrivateStudy, expirePrivateStudy, renewPrivateLease, privateGeneration, hasStoredPrivateStudy, suspendPrivateStudy, resumePrivateStudy, isPrivateStudySuspended } from './privateStudyStore';

export function watchPrivateStudy() {
  let uid = null, stopped = false, checking = false;
  const unsubscribe = observeAccount(user => { uid = user?.uid || null; setPrivateOwner(uid); });
  async function check() {
    expirePrivateStudy();
    if (document.hidden || !uid || checking || !hasStoredPrivateStudy()) return;
    checking = true;
    const generation = privateGeneration();
    const account = uid;
    const startedAt = performance.now();
    try {
      const access = await billingCall('billingAccess', account);
      if (stopped || account !== uid || generation !== privateGeneration()) return;
      if (!access.hasAccess) clearPrivateStudy();
      else if (renewPrivateLease(access.expiresAt, access.serverNow, startedAt) && !document.hidden) resumePrivateStudy();
    } catch { if (!stopped && generation === privateGeneration()) clearPrivateStudy(); }
    finally {
      checking = false;
      if (!stopped && !document.hidden && isPrivateStudySuspended()) void check();
    }
  }
  const timer = setInterval(check, 30000);
  const expiryTimer = setInterval(expirePrivateStudy, 250);
  // 短いタブ移動ではメモリを保持。復帰時は権限を再確認するまで表示しない。
  // 最大60秒の保持期限は延長せず、長い非表示・失効時は従来どおり破棄する。
  const hide = () => {
    if (document.hidden) suspendPrivateStudy();
    else { suspendPrivateStudy(); expirePrivateStudy(); check(); }
  };
  const offline = () => clearPrivateStudy();
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', offline);
  return () => {
    stopped = true; unsubscribe(); clearInterval(timer); clearInterval(expiryTimer);
    document.removeEventListener('visibilitychange', hide);
    window.removeEventListener('offline', offline); window.removeEventListener('pagehide', offline);
    clearPrivateStudy();
  };
}
