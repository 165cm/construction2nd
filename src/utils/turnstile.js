// Cloudflare Turnstile（ロボット確認）の読み込みと表示
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

export const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => {
      loading = null;
      reject(new Error('Turnstile を読み込めませんでした'));
    };
    document.head.appendChild(s);
  });
  return loading;
};
