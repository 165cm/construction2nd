import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
const app = initializeApp(__AUTH_PROBE_PUBLIC_CONFIG__, 'release-readonly-probe');
const auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
const functions = getFunctions(app, 'asia-northeast1');
const login = document.querySelector('#login'), logout = document.querySelector('#logout');
const account = document.querySelector('#account'), output = document.querySelector('#results');
const completed = new Map();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const lines = [];
const note = value => { lines.push(value); output.textContent = lines.join('\n'); };
const call = (data = {}) => httpsCallable(functions, 'billingAccess')(data).then(r => r.data);
async function content(authorization = '', forgedUid = false) {
  const response = await fetch('/probe-content', { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Probe-Nonce': __AUTH_PROBE_NONCE__, ...(authorization ? { Authorization: authorization } : {}) }, body: JSON.stringify({ forgedUid }) });
  assert(response.ok, '確認画面の読取接続に失敗しました'); return response.json();
}
function safeError(error) { return typeof error?.code === 'string' && /^[a-z/-]+$/.test(error.code) ? error.code : error.message?.startsWith('確認') ? error.message : '確認未完了。画面の状態を確認してください'; }
async function anonymousChecks() {
  let rejected = false; try { await call(); } catch (error) { rejected = error.code === 'functions/unauthenticated'; }
  assert(rejected, '確認：未ログインの利用権取得が拒否されませんでした'); note('OK：未ログインの利用権取得を拒否');
  for (const [label, token, forged] of [['未ログインの教材取得', '', false], ['不正トークン', 'Bearer invalid-readonly-probe', false], ['UID指定だけの教材取得', '', true]]) {
    const result = await content(token, forged); assert(result.status === 401 && result.noStore && result.variesByAuthorization, '確認：' + label); note('OK：' + label + 'を拒否');
  }
}
async function authenticatedChecks(expected) {
  const user = auth.currentUser, uid = user.uid;
  const first = await call(), forged = await call({ uid: 'read-only-probe-untrusted-uid' });
  assert(auth.currentUser?.uid === uid, '確認中にアカウントが変わりました');
  assert(typeof first.hasAccess === 'boolean' && first.hasAccess === (expected === 'paid'), '確認：選択した購入状態と利用権が一致しません');
  assert(first.hasAccess === forged.hasAccess && first.expiresAt === forged.expiresAt, '確認：別UID指定で利用権が変わりました');
  note('OK：本人の利用権と購入状態が一致'); note('OK：別UIDを指定しても本人の結果を維持');
  const token = await user.getIdToken();
  for (const forgedUid of [false, true]) {
    const result = await content('Bearer ' + token, forgedUid);
    assert(auth.currentUser?.uid === uid, '確認中にアカウントが変わりました');
    assert(result.status === (first.hasAccess ? 200 : 403) && result.noStore && result.variesByAuthorization, '確認：教材の許可・拒否');
    if (first.hasAccess) assert(result.examMatches && result.questionCount === 50 && result.expiresAt === first.expiresAt && result.expiresAt > result.serverTime, '確認：教材の年度・問題数・期限');
    note('OK：' + (forgedUid ? '別UID指定時も' : '') + (first.hasAccess ? '教材50問と利用期限を確認' : '未購入の教材取得を拒否'));
  }
  if ([...completed].some(([other, kind]) => other !== uid && kind === expected)) note('参考：同じ購入状態の別アカウントです');
  completed.set(uid, expected);
  const kinds = new Set(completed.values());
  note(kinds.has('paid') && kinds.has('free') ? '完了：異なる購入済み・未購入アカウントの両方で確認できました' : 'このアカウントは完了。ログアウト後にもう一方を確認できます');
}
login.addEventListener('click', async () => {
  login.disabled = true; logout.disabled = true; lines.length = 0; output.textContent = '';
  const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
  try {
    if (auth.currentUser) await signOut(auth);
    const result = await signInWithPopup(auth, provider);
    account.textContent = '接続中：' + (result.user.email || '選択したアカウント');
    await authenticatedChecks(document.querySelector('input[name=kind]:checked').value);
  } catch (error) { note('未完了：' + safeError(error)); }
  finally { login.disabled = false; logout.disabled = !auth.currentUser; }
});
logout.addEventListener('click', async () => {
  login.disabled = true; logout.disabled = true;
  try { await signOut(auth); account.textContent = '未ログイン'; note('この確認画面からログアウトしました'); }
  finally { login.disabled = false; }
});
try { await auth.authStateReady(); await anonymousChecks(); }
catch (error) { note('未完了：' + safeError(error)); }
finally { login.disabled = false; }
