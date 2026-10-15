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
export const loginGoogle = () => signInWithPopup(getClient().auth, new GoogleAuthProvider());
export const logoutAccount = () => signOut(getClient().auth);
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
  });
}
