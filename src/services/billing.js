import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, firebaseEnabled } from './firebaseConfig';

export async function billingCall(name, uid, data = {}) {
  if (!firebaseEnabled) throw new Error('アカウント接続を準備中です');
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('ログイン状態を確認してください');
  const result = await httpsCallable(getFunctions(app, 'asia-northeast1'), name)(data);
  if (auth.currentUser?.uid !== uid) throw new Error('ログイン状態が変わりました。画面を開き直してください');
  return result.data;
}
export function openStripeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw new Error('支払い先を確認できませんでした');
  window.location.assign(url.href);
}
