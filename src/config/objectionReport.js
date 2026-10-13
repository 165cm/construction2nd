// 「この問題に異議あり！」の送信先（方式A：Cloudflare Workers → GitHub の issue）
// どちらも公開してよい値（秘密の鍵ではない）。受付窓口の準備ができたら設定する。
// 空のままなら送信せず、これまでどおりその端末だけに保存する。
export const OBJECTION_ENDPOINT = ''; // 例: 'https://objection-receiver.xxxx.workers.dev'
export const TURNSTILE_SITE_KEY = '0x4AAAAAAFVT3oUAEh0Pyhfp'; // Cloudflare Turnstile のサイトキー（公開用）

export const isObjectionSendingEnabled = () => Boolean(OBJECTION_ENDPOINT && TURNSTILE_SITE_KEY);
