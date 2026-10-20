import { clearPrivateStudy } from './privateStudyStore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig, firebaseEnabled } from './firebaseConfig';
import { assertCloudWrite } from '../utils/cloudBackupPolicy';

let client;
function getClient() {
  if (!firebaseEnabled) throw new Error('Firebaseの設定が必要です');
  if (!client) {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    client = { auth: getAuth(app), db: getFirestore(app) };
  }
  return client;
}
export const observeAccount = (listener) => onAuthStateChanged(getClient().auth, listener);
export const loginGoogle = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(getClient().auth, provider);
};
export const logoutAccount = () => { clearPrivateStudy(); return signOut(getClient().auth); };
function requireUser(uid) {
  if (!uid || getClient().auth.currentUser?.uid !== uid) throw new Error('ログイン状態が変わりました。画面を開き直してください');
}
export async function readCloudBackup(uid) {
  requireUser(uid);
  const snapshot = await getDocFromServer(doc(getClient().db, 'users', uid, 'learning', 'backup'));
  requireUser(uid);
  return snapshot.exists() ? snapshot.data() : null;
}
export async function writeCloudBackup(uid, backup, expectedRevision) {
  requireUser(uid);
  const payload = JSON.stringify(backup);
  const ref = doc(getClient().db, 'users', uid, 'learning', 'backup');
  return runTransaction(getClient().db, async tx => {
    requireUser(uid);
    const snapshot = await tx.get(ref);
    const currentRevision = snapshot.exists() ? snapshot.data().revision : 0;
    assertCloudWrite(payload, expectedRevision, currentRevision);
    const revision = currentRevision + 1;
    tx.set(ref, { payload, revision, updatedAt: serverTimestamp() });
    return revision;
  }).catch(async error => {
    // 競合時にルールのrevision判定が先に失敗するとSDKは再試行せず権限エラーを返す。
    // 本人の最新データで競合を確認できた場合だけ、通常の競合案内へ置き換える。
    if (error.code === 'permission-denied') {
      const current = await readCloudBackup(uid);
      assertCloudWrite(payload, expectedRevision, current?.revision ?? 0);
    }
    throw error;
  });
}
