import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({
  ssr: { noExternal: ['firebase'] }, optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom',
  plugins: [{ name: 'private-request-fixture', enforce: 'pre',
    resolveId(id) { if (id === 'firebase/auth') return '/test-auth.js'; if (id === 'firebase/app') return '/test-app.js'; },
    load(id) {
      if (id === '/test-auth.js') return "export const auth={ready:Promise.resolve(),authStateReady(){return this.ready},currentUser:{uid:'test-owner',getIdToken:async()=>'test-token'}};export const getAuth=()=>auth;";
      if (id === '/test-app.js') return 'export const getApps=()=>[{}];export const initializeApp=()=>({});';
      if (id.endsWith('/src/services/firebaseConfig.js')) return 'export const firebaseEnabled=true;export const firebaseConfig={};';
      if (id.endsWith('/src/services/cloudBackup.js')) return "export const observeAccount=fn=>{fn({uid:'test-owner'});return()=>{}};";
      if (id.endsWith('/src/services/billing.js')) return 'export let access;export let calls=0;export const setAccess=value=>{access=value};export const billingCall=async()=>{calls++;return await access};';
    }
  }]
});
try {
  const store = await server.ssrLoadModule('/src/services/privateStudyStore.js');
  const { loadPaidExam, loadPrivateAsset } = await server.ssrLoadModule('/src/services/privateStudy.js');
  const { watchPrivateStudy } = await server.ssrLoadModule('/src/services/privateStudyLifecycle.js');
  const { auth } = await server.ssrLoadModule('/test-auth.js');
  const billing = await server.ssrLoadModule('/src/services/billing.js');
  const path = 'choices/r7_2/1.webp';
  const exam = { examId:'r7_2', questions:Array.from({length:50},(_,i)=>({id:i+1})), assets:[path,'pages/r7_2/page_15.webp'], crops:{} };
  const response = body => new Response(body,{headers:{'X-Access-Expires-At':String(Date.now()+60000),'X-Server-Time':String(Date.now())}});
  let calls = [];
  const fetcher = async url => { calls.push(url); return response(url.includes('asset=') ? 'image' : JSON.stringify(exam)); };
  const originalUser = auth.currentUser;
  auth.currentUser = null;
  let settleAuth;
  auth.ready = new Promise(resolve => { settleAuth = resolve; });
  const startup = loadPaidExam('r7_2', { fetcher });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length,0,'初期認証の復元中は未ログイン扱いや教材通信をしない');
  auth.currentUser = originalUser;
  settleAuth();
  await startup;
  assert.ok(store.getPrivateExam('r7_2'),'初期認証の復元後に前回の有料教材を取得できる');
  store.clearPrivateStudy();
  calls = [];
  auth.currentUser = null;
  await assert.rejects(loadPaidExam('r7_2',{fetcher}),error => error.code==='login-required');
  assert.equal(calls.length,0,'確定した未ログイン状態では教材を取得しない');
  auth.currentUser = originalUser;
  store.setPrivateOwner('test-owner');
  await loadPaidExam('r7_2',{fetcher});
  assert.equal(calls.length,1,'年度選択はJSONだけを取得');
  assert.ok(store.getPrivateExam('r7_2'));
  const [a,b] = await Promise.all([loadPrivateAsset(path,{fetcher}),loadPrivateAsset(path,{fetcher})]);
  assert.equal(a,b);
  assert.equal(calls.length,2,'同じ画像の並行取得を一本化');
  assert.equal(await loadPrivateAsset(path,{fetcher}),a);
  assert.equal(calls.length,2,'同じ画像はメモリから再利用');
  await assert.rejects(loadPrivateAsset('choices/r7_2/unlisted.webp',{fetcher}));
  assert.equal(calls.length,2,'manifest外の画像は通信しない');
  await assert.rejects(loadPrivateAsset('pages/r7_2/page_15.webp',{fetcher:async()=>new Response('',{status:503})}));
  assert.ok(await loadPrivateAsset('pages/r7_2/page_15.webp',{fetcher}),'失敗画像を再試行できる');

  assert.equal((await fetch(a)).ok,true,'保持期間内は実際のBlob URLを読める');
  store.setPrivateOwner('another-owner');
  assert.equal(store.getPrivateExam('r7_2'),undefined,'アカウント変更で本文を破棄');
  assert.equal(store.getPrivateAsset(path),'');
  await assert.rejects(fetch(a),'アカウント変更で以前のBlob URL自体も失効');
  await loadPaidExam('r7_2',{fetcher});
  const beforeExpiry = await loadPrivateAsset(path,{fetcher});
  store.renewPrivateLease(200,100,performance.now()-1000);
  store.expirePrivateStudy();
  assert.equal(store.getPrivateExam('r7_2'),undefined,'期限切れで本文を破棄');
  await assert.rejects(fetch(beforeExpiry),'期限切れでBlob URL自体も失効');
  await loadPaidExam('r7_2',{fetcher});
  const beforeDenied = await loadPrivateAsset(path,{fetcher});
  await assert.rejects(loadPrivateAsset('pages/r7_2/page_15.webp',{
    fetcher:async()=>new Response('',{status:403}),
  }),error=>error.code==='plan-required');
  assert.equal(store.getPrivateExam('r7_2'),undefined,'画像の権限拒否でも本文を破棄');
  await assert.rejects(fetch(beforeDenied),'権限拒否で他の取得済み画像も失効');

  store.clearPrivateStudy();
  await loadPaidExam('r7_2',{fetcher});
  let finish, started;
  const underway = new Promise(r=>{started=r});
  const stale = loadPrivateAsset(path,{fetcher:async()=>{started();return new Promise(r=>{finish=r})}});
  await underway;
  store.clearPrivateStudy();
  finish(response('late-image'));
  await assert.rejects(stale);
  assert.equal(store.getPrivateAsset(path),'','ログアウト後の遅延画像を公開しない');

  globalThis.document = new EventTarget(); document.hidden=false;
  globalThis.window = new EventTarget();
  const intervals=[];
  const originalSetInterval=globalThis.setInterval;
  let stop;
  try {
    globalThis.setInterval=fn=>{intervals.push(fn);return undefined};
    stop=watchPrivateStudy();
  } finally { globalThis.setInterval=originalSetInterval; }
  try {
    await loadPaidExam('r7_2',{fetcher});
    const cached = await loadPrivateAsset(path,{fetcher});
    document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(store.isPrivateStudySuspended(),true);
    let resolve;
    billing.setAccess(new Promise(r=>{resolve=r}));
    document.hidden=false; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(store.isPrivateStudySuspended(),true,'再確認中は教材画面を再開しない');
    resolve({hasAccess:true,expiresAt:Date.now()+60000,serverNow:Date.now()});
    await new Promise(r=>setTimeout(r,0));
    assert.equal(store.isPrivateStudySuspended(),false);
    assert.equal(store.getPrivateAsset(path),cached,'短いタブ移動で画像を破棄しない');
    billing.setAccess({hasAccess:false});
    document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
    document.hidden=false; document.dispatchEvent(new Event('visibilitychange'));
    await new Promise(r=>setTimeout(r,0));
    assert.equal(store.getPrivateExam('r7_2'),undefined,'復帰時に失効していたら教材を破棄');
    assert.equal(store.getPrivateAsset(path),'');
    await loadPaidExam('r7_2',{fetcher});
    await loadPrivateAsset(path,{fetcher});
    document.hidden=true; document.dispatchEvent(new Event('visibilitychange'));
    store.renewPrivateLease(200,100,performance.now()-1000);
    document.hidden=false; document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(store.getPrivateExam('r7_2'),undefined,'長い非表示で保持期限が過ぎた教材は破棄');
    assert.equal(store.getPrivateAsset(path),'');
    for (const eventName of ['focus', 'pageshow']) {
      await loadPaidExam('r7_2',{fetcher});
      const retained = await loadPrivateAsset(path,{fetcher});
      let ready;
      billing.setAccess(new Promise(r=>{ready=r}));
      window.dispatchEvent(new Event('blur'));
      assert.equal(store.isPrivateStudySuspended(),true,'visibilitychangeなしでもblurで停止');
      const checksBefore = billing.calls;
      await intervals[0]();
      assert.equal(billing.calls,checksBefore,'blur中はvisibilityがvisibleでも定期確認で期限を延ばさない');
      window.dispatchEvent(new Event(eventName));
      assert.equal(store.isPrivateStudySuspended(),true,eventName+'だけでも再認証まで表示を止める');
      ready({hasAccess:true,expiresAt:Date.now()+60000,serverNow:Date.now()});
      await new Promise(r=>setTimeout(r,0));
      assert.equal(store.isPrivateStudySuspended(),false);
      assert.equal(store.getPrivateAsset(path),retained);
      const originalNow = Date.now;
      const wallNow = Date.now();
      try {
        Date.now = () => wallNow + 120000;
        window.dispatchEvent(new Event(eventName));
        assert.equal(store.getPrivateExam('r7_2'),undefined,'単調時計が進まなくても'+eventName+'で2分経過を検知');
        assert.equal(store.getPrivateAsset(path),'');
      } finally { Date.now = originalNow; }
    }
    store.renewPrivateLease(200,100,performance.now()-1000,Date.now()+120000);
    assert.equal(store.hasPrivateLease(),false,'時計を戻す方向の補正でも単調時計の期限を延ばさない');
  } finally { stop(); delete globalThis.document; delete globalThis.window; }
  console.log('PASS: JSON-only selection, lazy assets, dedup/cache/retry, stale result rejection, tab resume authorization');
} finally { await server.close(); }
