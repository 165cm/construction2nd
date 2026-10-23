// 通知のHTTP境界だけを共用し、決済処理と設定は呼出側から渡す。
// 別の試験受信先では、既存受信先と異なる署名用秘密値を使う。
export function createBillingWebhookHandler({ stripeClient, webhookSecret, sandbox, processEvent, acceptsEvent }) {
  if (typeof stripeClient !== 'function' || typeof processEvent !== 'function'
    || (acceptsEvent !== undefined && typeof acceptsEvent !== 'function')) throw new Error('invalid-webhook-handler');
  const valueOf = value => typeof value === 'function' ? value() : value;
  const fail = (res, event) => {
    // 例外本文・本文・署名・キー・個人情報はログへ渡さない。
    console.error('billing-webhook-retry', { eventId: event?.id ?? null, type: event?.type ?? null });
    return res.status(500).send('Retry later');
  };
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.sendStatus(405);
    let stripe, event;
    try { stripe = stripeClient(); } catch { return fail(res); }
    try { event = stripe.webhooks.constructEvent(req.rawBody, req.headers?.['stripe-signature'], valueOf(webhookSecret)); }
    catch { return res.status(400).send('Invalid signature'); }
    let sandboxValue;
    try { sandboxValue = valueOf(sandbox); if (typeof sandboxValue !== 'boolean') throw new Error('invalid-environment'); }
    catch { return fail(res, event); }
    if (event.livemode !== !sandboxValue) return res.status(400).send('Environment mismatch');
    try {
      if (acceptsEvent && !(await acceptsEvent(event, stripe))) return res.status(200).send('ignored');
      await processEvent(event, stripe);
      return res.status(200).send('ok');
    } catch { return fail(res, event); }
  };
}
