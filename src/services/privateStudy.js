import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfig, firebaseEnabled } from './firebaseConfig';
import { getPrivateExam, privateGeneration, publishPrivateExam, isPaidExam, renewPrivateLease, clearPrivateStudy } from './privateStudyStore';

const accessError = (code, message) => Object.assign(new Error(message), { code });

export async function loadPaidExam(examId, { report = () => {}, fetcher = fetch } = {}) {
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
  async function request(asset) {
    ensureCurrent();
    const query = new URLSearchParams({ exam: examId });
    if (asset) query.set('asset', asset);
    const startedAt = performance.now();
    const response = await fetcher(`/api/content?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    ensureCurrent();
    if (response.status === 401 || response.status === 403) clearPrivateStudy();
    if (response.status === 401) throw accessError('login-required', 'ログインし直してください');
    if (response.status === 403) throw accessError('plan-required', 'この年度は有料プランで学習できます');
    if (!response.ok) throw new Error('教材を取得できませんでした。通信を確認して再試行してください');
    if (!renewPrivateLease(Number(response.headers.get('X-Access-Expires-At')), Number(response.headers.get('X-Server-Time')), startedAt)) throw new Error('利用期間を再確認してください');
    return response;
  }
  // 再選択時もサーバーへ確認し、端末内の有無だけで利用を許可しない。
  const response = await request();
  const exam = await response.json();
  if (exam.examId !== examId || exam.questions?.length !== 50 || !Array.isArray(exam.assets)) throw new Error('教材データを確認できませんでした');
  if (getPrivateExam(examId)) return;
  const urls = new Map();
  let cursor = 0, completed = 0;
  try {
    // 画像の取得に失敗した年度は中途半端に公開しない。並行数を4に抑える。
    const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
      while (cursor < exam.assets.length) {
        const path = exam.assets[cursor++];
        if (!/^(pages|crops|choices)\/[a-z0-9_]+\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(path) || path.split('/')[1] !== examId) throw new Error('画像の指定が不正です');
        const image = await request(path);
        const blob = await image.blob(); ensureCurrent();
        urls.set(path, URL.createObjectURL(blob));
        report(++completed, exam.assets.length);
      }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    ensureCurrent();
    if (!publishPrivateExam(exam, urls, generation)) throw new Error('ログイン状態が変わりました');
  } catch (error) {
    // 並行取得がすべて終了してからBlob URLを破棄する。
    urls.forEach(url => URL.revokeObjectURL(url));
    throw error;
  }
}
