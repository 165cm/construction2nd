import { observeAccount } from './cloudBackup';
import { billingCall } from './billing';
import { setPrivateOwner, clearPrivateStudy, expirePrivateStudy, renewPrivateLease, privateGeneration, hasStoredPrivateStudy, suspendPrivateStudy, resumePrivateStudy, isPrivateStudySuspended } from './privateStudyStore';

export function watchPrivateStudy() {
  let uid = null, stopped = false, checking = false;
  let backgrounded = document.hidden;
  const unsubscribe = observeAccount(user => { uid = user?.uid || null; setPrivateOwner(uid); });
  async function check() {
    expirePrivateStudy();
    if (document.hidden || backgrounded || !uid || checking || !hasStoredPrivateStudy()) return;
    checking = true;
    const generation = privateGeneration();
    const account = uid;
    const startedAt = performance.now();
    const startedWallAt = Date.now();
    try {
      const access = await billingCall('billingAccess', account);
      if (stopped || backgrounded || document.hidden || account !== uid || generation !== privateGeneration()) return;
      if (!access.hasAccess) clearPrivateStudy();
      else if (renewPrivateLease(access.expiresAt, access.serverNow, startedAt, startedWallAt) && !document.hidden) resumePrivateStudy();
    } catch { if (!stopped && generation === privateGeneration()) clearPrivateStudy(); }
    finally {
      checking = false;
      if (!stopped && !document.hidden && !backgrounded && isPrivateStudySuspended()) void check();
    }
  }
  const timer = setInterval(check, 30000);
  const expiryTimer = setInterval(expirePrivateStudy, 250);
  // 短いタブ移動ではメモリを保持。復帰時は権限を再確認するまで表示しない。
  // 最大60秒の保持期限は延長せず、長い非表示・失効時は従来どおり破棄する。
  const hide = () => {
    backgrounded = document.hidden;
    if (document.hidden) suspendPrivateStudy();
    else { suspendPrivateStudy(); expirePrivateStudy(); check(); }
  };
  const offline = () => clearPrivateStudy();
  const leave = () => { backgrounded = true; suspendPrivateStudy(); };
  const resume = () => { if (!document.hidden) { backgrounded = false; suspendPrivateStudy(); expirePrivateStudy(); void check(); } };
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('blur', leave);
  window.addEventListener('focus', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', offline);
  return () => {
    stopped = true; unsubscribe(); clearInterval(timer); clearInterval(expiryTimer);
    document.removeEventListener('visibilitychange', hide);
    window.removeEventListener('blur', leave);
    window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume);
    window.removeEventListener('offline', offline); window.removeEventListener('pagehide', offline);
    clearPrivateStudy();
  };
}
