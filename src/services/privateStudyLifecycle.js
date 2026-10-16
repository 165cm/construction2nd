import { observeAccount } from './cloudBackup';
import { billingCall } from './billing';
import { setPrivateOwner, clearPrivateStudy, expirePrivateStudy, renewPrivateLease, privateGeneration, paidExamIds, getPrivateExam } from './privateStudyStore';

export function watchPrivateStudy() {
  let uid = null, stopped = false, checking = false;
  const unsubscribe = observeAccount(user => { uid = user?.uid || null; setPrivateOwner(uid); });
  async function check() {
    expirePrivateStudy();
    if (!uid || checking || !paidExamIds.some(id => getPrivateExam(id))) return;
    checking = true;
    const generation = privateGeneration();
    const account = uid;
    const startedAt = performance.now();
    try {
      const access = await billingCall('billingAccess', account);
      if (stopped || account !== uid || generation !== privateGeneration()) return;
      if (!access.hasAccess) clearPrivateStudy();
      else renewPrivateLease(access.expiresAt, access.serverNow, startedAt);
    } catch { if (!stopped && generation === privateGeneration()) clearPrivateStudy(); }
    finally { checking = false; }
  }
  const timer = setInterval(check, 30000);
  const expiryTimer = setInterval(expirePrivateStudy, 250);
  // バックグラウンドではタイマーが止まるため、非表示時に解放する。
  const hide = () => { if (document.hidden) clearPrivateStudy(); };
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
