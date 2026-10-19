import { readFile } from 'node:fs/promises';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineBoolean } from 'firebase-functions/params';
import { contentHandler } from './contentAccess.js';
import { allowedBillingUser, currentBillingPaths } from './billingEnvironmentConfig.js';

const enabled = defineBoolean('PRIVATE_CONTENT_ENABLED', { default: false });
const root = new URL('./private-content/', import.meta.url);
let manifest;
export const privateContent = onRequest({ region: 'asia-northeast1', maxInstances: 3 }, contentHandler({
  enabled: () => enabled.value(),
  verifyToken: token => getAuth().verifyIdToken(token, true),
  getGrants: async uid => allowedBillingUser(uid) ? (await getFirestore().collection(currentBillingPaths(uid).grants).where('expiresAt', '>', Date.now()).get()).docs.map(doc => doc.data()) : [],
  readContent: async key => {
    // ファイル一覧にあるものだけ配信。任意のファイル・ディレクトリは公開しない。
    manifest ||= new Set(JSON.parse(await readFile(new URL('manifest.json', root), 'utf8')));
    return manifest.has(key) ? readFile(new URL(key, root)) : null;
  }
}));
