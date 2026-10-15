// Firebase Webアプリの公開設定のみ。サービスアカウント鍵やStripe秘密鍵は置かない。
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ''
};
export const firebaseEnabled = Object.values(firebaseConfig).every(Boolean);
