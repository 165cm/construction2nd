import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { default: PricingPlans } = await server.ssrLoadModule('/src/components/PricingPlans.jsx');
  const { default: BillingPanel } = await server.ssrLoadModule('/src/components/BillingPanel.jsx');
  const { openStripeUrl } = await server.ssrLoadModule('/src/services/billing.js');
  const pending = renderToStaticMarkup(React.createElement(PricingPlans));
  assert.equal((pending.match(/disabled=""/g) || []).length, 2);
  assert.match(pending, /自動更新なし/);
  assert.match(pending, /毎月自動更新/);
  assert.match(pending, /1〜2か月/);
  const active = renderToStaticMarkup(React.createElement(PricingPlans, { enabled: true, hasAccess: true, expiresAt: Date.parse('2027-01-16T00:00:00+09:00') }));
  assert.match(active, /利用期間中の追加購入は不要/);
  assert.doesNotMatch(active, /パックの内容を確認|月額プランの内容を確認/);
  assert.match(active, /2027\/1\/16/);
  const panel = renderToStaticMarkup(React.createElement(BillingPanel, { uid: 'test' }));
  assert.doesNotMatch(panel, /Stripeで支払いに進む/);
  let navigated;
  globalThis.window = { location: { assign: url => { navigated = url; } } };
  for (const url of ['http://checkout.stripe.com/a', 'https://checkout.stripe.com.attacker.example/a', 'javascript:alert(1)', 'https://example.com']) assert.throws(() => openStripeUrl(url));
  openStripeUrl('https://checkout.stripe.com/c/pay/test');
  assert.equal(navigated, 'https://checkout.stripe.com/c/pay/test');
  console.log('PASS: disabled checkout, recurring terms, active entitlement, safe redirect');
} finally { await server.close(); }
