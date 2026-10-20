import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig, firebaseEnabled } from './firebaseConfig';
import { getPrivateExam, privateGeneration, publishPrivateExam, isPaidExam, renewPrivateLease, clearPrivateStudy, getPrivateAsset, publishPrivateAsset } from './privateStudyStore';

const accessError = (code, message) => Object.assign(new Error(message), { code });

async function requestFor(examId, fetcher) {
  if (!isPaidExam(examId)) throw new Error('収録されていない年度です');
  if (!firebaseEnabled) throw new Error('アカウント接続を準備中です');
  const app = getApps()[0] || initializeApp(firebaseConfig);
  const user = getAuth(app).currentUser;
  if (!user) throw accessError('login-required', '購入済みの方はログインして利用状態を確認してください');
  const generation = privateGeneration();
  const token = await user.getIdToken();
  const ensureCurrent = () => {
    if (getAuth(app).currentUser?.uid !== user.uid || privateGeneration() !== generation) throw new Error('ログイン状態が変わりました。やり直してください');
  };
  return async function request(asset) {
    ensureCurrent();
    const query = new URLSearchParams({ exam: examId });
    if (asset) query.set('asset', asset);
    const startedAt = performance.now();
    const startedWallAt = Date.now();
    const response = await fetcher(`/api/content?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    ensureCurrent();
    if (response.status === 401 || response.status === 403) clearPrivateStudy();
    if (response.status === 401) throw accessError('login-required', 'ログインし直してください');
    if (response.status === 403) throw accessError('plan-required', 'この年度は有料プランで学習できます');
    if (!response.ok) throw new Error('教材を取得できませんでした。通信を確認して再試行してください');
    if (!renewPrivateLease(Number(response.headers.get('X-Access-Expires-At')), Number(response.headers.get('X-Server-Time')), startedAt, startedWallAt)) throw new Error('利用期間を再確認してください');
    return response;
  }
}

export async function loadPaidExam(examId, { fetcher = fetch } = {}) {
  const request = await requestFor(examId, fetcher);
  const generation = privateGeneration();
  const response = await request();
  const exam = await response.json();
  if (exam.examId !== examId || exam.questions?.length !== 50 || !Array.isArray(exam.assets)) throw new Error('教材データを確認できませんでした');
  if (getPrivateExam(examId)) return;
  if (!publishPrivateExam(exam, new Map(), generation)) throw new Error('ログイン状態が変わりました');
}

const pendingAssets = new Map();
export async function loadPrivateAsset(path, { fetcher = fetch } = {}) {
  const clean = path.replace(/^\//, '');
  const examId = clean.split('/')[1];
  const exam = getPrivateExam(examId);
  if (!exam || !exam.assets.includes(clean)) throw new Error('この画像は利用できません');
  const cached = getPrivateAsset(clean);
  if (cached) return cached;
  const generation = privateGeneration();
  const key = generation + ':' + clean;
  if (pendingAssets.has(key)) return pendingAssets.get(key);
  const promise = (async () => {
    const request = await requestFor(examId, fetcher);
    const response = await request(clean);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (!publishPrivateAsset(clean, url, generation)) throw new Error('利用状態が変わりました');
    return url;
  })();
  pendingAssets.set(key, promise);
  try { return await promise; } finally { pendingAssets.delete(key); }
}
