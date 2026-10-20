import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { assertCloudWrite } from '../src/utils/cloudBackupPolicy.js';
assert.doesNotThrow(() => assertCloudWrite('{}', 0, 0));
assert.throws(() => assertCloudWrite('{}', 0, 1), /別の端末/);
assert.throws(() => assertCloudWrite('あ'.repeat(300000), 0, 0), /大きい/);
const env = await initializeTestEnvironment({ projectId: 'demo-construction2nd', firestore: { rules: fs.readFileSync('firebase/firestore.rules','utf8') } });
// 実サービスの関数を使用し、アプリ初期化と認証だけを専用端末に差し替える。
// Firestore SDK・transaction・ルールはエミュレータへ実際に接続する。
const fixtures = new Map();
globalThis.__cloudBackupTestClients = fixtures;
async function device(key, uid) {
  const fixture = { auth: { currentUser: { uid } }, db: env.authenticatedContext(uid).firestore() };
  fixtures.set(key, fixture);
  let source = fs.readFileSync('src/services/cloudBackup.js', 'utf8');
  for (const dependency of ['./privateStudyStore', 'firebase/app', 'firebase/auth', './firebaseConfig']) {
    const pattern = new RegExp(`^import .* from '${dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';\\n`, 'm');
    assert.match(source, pattern);
    source = source.replace(pattern, '');
  }
  source = source.replace('getFirestore, doc,', 'doc,')
    .replace("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')))
    .replace("'../utils/cloudBackupPolicy'", JSON.stringify(pathToFileURL(`${process.cwd()}/src/utils/cloudBackupPolicy.js`).href));
  const setup = `
    const fixture = globalThis.__cloudBackupTestClients.get(${JSON.stringify(key)});
    const firebaseEnabled = true, firebaseConfig = {};
    const getApps = () => [{}], initializeApp = () => ({});
    const getAuth = () => fixture.auth, getFirestore = () => fixture.db;
  `;
  return { fixture, service: await import(`data:text/javascript;base64,${Buffer.from(setup + source).toString('base64')}`) };
}
try {
  const owner = env.authenticatedContext('alice').firestore();
  const other = env.authenticatedContext('bob').firestore();
  const guest = env.unauthenticatedContext().firestore();
  const path = 'users/alice/learning/backup';
  const data = { payload: '{}', revision: 1, updatedAt: serverTimestamp() };
  await assertFails(getDoc(doc(guest,path)));
  await assertFails(setDoc(doc(guest,path),data));
  await assertFails(setDoc(doc(other,path),data));
  await assertSucceeds(setDoc(doc(owner,path),data));
  await assertSucceeds(getDoc(doc(owner,path)));
  await assertFails(getDoc(doc(other,path)));
  await assertFails(setDoc(doc(owner,path),data)); // 古いrevisionで上書き不可
  await assertSucceeds(setDoc(doc(owner,path),{...data,revision:2}));
  await assertFails(setDoc(doc(owner,path),{...data,revision:3,paid:true}));
  await assertFails(setDoc(doc(owner,path),{...data,revision:4}));
  await assertFails(setDoc(doc(owner,path),{...data,revision:3,updatedAt:new Date(0)}));
  await assertFails(setDoc(doc(owner,path),{...data,revision:3,payload:'x'.repeat(800001)}));
  await assertFails(setDoc(doc(owner,'users/alice/entitlements/premium'),{expiresAt:9999999999999}));
  await assertFails(getDoc(doc(other,'users/alice/entitlements/premium')));
  await assertFails(setDoc(doc(owner,'users/alice/sandboxEntitlements/premium'),{expiresAt:9999999999999}));
  await assertFails(setDoc(doc(owner,'privateExams/r7_2'),{questions:[]}));
  console.log('PASS: owner-only backup, revision conflict, entitlement tampering denied, private data denied');

  const a = await device('first-device', 'concurrent-owner');
  const b = await device('second-device', 'concurrent-owner');
  const outsider = await device('other-account', 'isolated-owner');
  const uid = 'concurrent-owner';
  assert.equal(await a.service.readCloudBackup(uid), null);
  assert.equal(await a.service.writeCloudBackup(uid, { records: ['initial'] }, 0), 1);
  assert.equal((await b.service.readCloudBackup(uid)).revision, 1);
  const results = await Promise.allSettled([
    a.service.writeCloudBackup(uid, { records: ['device-a'] }, 1),
    b.service.writeCloudBackup(uid, { records: ['device-b'] }, 1),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /別の端末/);
  const saved = await a.service.readCloudBackup(uid);
  assert.equal(saved.revision, 2);
  const winner = results[0].status === 'fulfilled' ? 'device-a' : 'device-b';
  assert.deepEqual(JSON.parse(saved.payload), { records: [winner] });
  await assert.rejects(b.service.writeCloudBackup(uid, { records: ['stale'] }, 1), /別の端末/);
  assert.deepEqual(await b.service.readCloudBackup(uid), saved);
  assert.equal(await b.service.writeCloudBackup(uid, { records: ['refreshed'] }, saved.revision), 3);
  const refreshed = await a.service.readCloudBackup(uid);
  assert.deepEqual(JSON.parse(refreshed.payload), { records: ['refreshed'] });
  await assert.rejects(a.service.writeCloudBackup(uid, { text: 'あ'.repeat(300000) }, 3), /大きい/);
  assert.deepEqual(await a.service.readCloudBackup(uid), refreshed);
  await assert.rejects(outsider.service.readCloudBackup(uid), /ログイン状態/);
  await assert.rejects(outsider.service.writeCloudBackup(uid, {}, 3), /ログイン状態/);
  await assertFails(getDoc(doc(outsider.fixture.db, `users/${uid}/learning/backup`)));
  await assertFails(setDoc(doc(outsider.fixture.db, `users/${uid}/learning/backup`), {
    payload: '{}', revision: 4, updatedAt: serverTimestamp(),
  }));
  assert.equal(await outsider.service.readCloudBackup('isolated-owner'), null);
  assert.equal(await outsider.service.writeCloudBackup('isolated-owner', { records: ['separate'] }, 0), 1);
  assert.deepEqual(await a.service.readCloudBackup(uid), refreshed);
  // ログイン表示だけ偽装しても、実際のSDK資格情報が別人なら拒否を維持する。
  outsider.fixture.auth.currentUser = { uid };
  await assert.rejects(outsider.service.writeCloudBackup(uid, {}, 3), { code: 'permission-denied' });
  assert.deepEqual(await a.service.readCloudBackup(uid), refreshed);
  a.fixture.auth.currentUser = null;
  await assert.rejects(a.service.readCloudBackup(uid), /ログイン状態/);
  await assert.rejects(a.service.writeCloudBackup(uid, {}, 3), /ログイン状態/);
  console.log('PASS: actual backup service concurrent writes preserve winner, stale/oversize writes preserve data, refresh retries, accounts isolated, logout denied');
} finally {
  delete globalThis.__cloudBackupTestClients;
  await env.cleanup();
}
