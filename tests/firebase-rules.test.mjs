import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { assertCloudWrite } from '../src/utils/cloudBackupPolicy.js';
assert.doesNotThrow(() => assertCloudWrite('{}', 0, 0));
assert.throws(() => assertCloudWrite('{}', 0, 1), /別の端末/);
assert.throws(() => assertCloudWrite('あ'.repeat(300000), 0, 0), /大きい/);
const env = await initializeTestEnvironment({ projectId: 'demo-construction2nd', firestore: { rules: fs.readFileSync('firebase/firestore.rules','utf8') } });
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
  await assertFails(setDoc(doc(owner,'users/alice/entitlements/premium'),{expiresAt:9999999999999}));
  await assertFails(getDoc(doc(other,'users/alice/entitlements/premium')));
  await assertFails(setDoc(doc(owner,'privateExams/r7_2'),{questions:[]}));
  console.log('PASS: owner-only backup, revision conflict, entitlement tampering denied, private data denied');
} finally { await env.cleanup(); }
