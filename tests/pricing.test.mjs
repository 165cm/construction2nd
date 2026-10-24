import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { default: PricingPlans } = await server.ssrLoadModule('/src/components/PricingPlans.jsx');
  const { default: BillingPanel } = await server.ssrLoadModule('/src/components/BillingPanel.jsx');
  const { default: PurchaseConfirmation } = await server.ssrLoadModule('/src/components/PurchaseConfirmation.jsx');
  const { default: PaidAccessDialog } = await server.ssrLoadModule('/src/components/PaidAccessDialog.jsx');
  const gate = kind => renderToStaticMarkup(React.createElement(PaidAccessDialog, { kind, title: '令和7年度 下期' }));
  assert.match(gate('login-required'), /購入に使ったアカウントでログイン/);
  assert.match(gate('plan-required'), /980円/);
  assert.match(gate('plan-required'), /600円/);
  assert.match(gate('plan-required'), /無料の最新問題を続ける/);
  assert.match(gate('retry'), /追加購入せず/);
  assert.match(gate('retry'), /再試行/);
  assert.doesNotMatch(gate('retry'), /980円|600円/);
  const { openStripeUrl } = await server.ssrLoadModule('/src/services/billing.js');
  const pending = renderToStaticMarkup(React.createElement(PricingPlans));
  assert.equal((pending.match(/disabled=""/g) || []).length, 2);
  assert.match(pending, /自動更新なし/);
  assert.match(pending, /毎月自動更新/);
  assert.match(pending, /1か月だけ/);
  const active = renderToStaticMarkup(React.createElement(PricingPlans, { enabled: true, hasAccess: true, expiresAt: Date.parse('2027-01-16T00:00:00+09:00') }));
  assert.match(active, /利用期間中の追加購入は不要/);
  const activeWhileClosed = renderToStaticMarkup(React.createElement(PricingPlans, { enabled: false, hasAccess: true, expiresAt: Date.now() + 60000, onManage: () => {} }));
  assert.doesNotMatch(activeWhileClosed, /有料プランは準備中/);
  assert.match(activeWhileClosed, /契約管理・月額の解約/);
  assert.doesNotMatch(active, /パックの内容を確認|月額プランの内容を確認/);
  assert.match(active, /2027\/1\/16/);
  for (const hasAccess of [true, false]) {
    const paused = renderToStaticMarkup(React.createElement(PricingPlans, {
      enabled: false, hasAccess, expiresAt: Date.parse('2027-01-16T00:00:00+09:00'), onManage: () => {},
    }));
    assert.match(paused, /<button(?![^>]*disabled)[^>]*>契約管理・月額の解約<\/button>/,
      '購入受付を停止しても、有効/期限切れ契約の解約入口は維持する');
    if (!hasAccess) assert.equal((paused.match(/disabled=""/g) || []).length, 2, '購入ボタンだけを停止');
  }
  const panel = renderToStaticMarkup(React.createElement(BillingPanel, { uid: 'test' }));
  assert.doesNotMatch(panel, /Stripeで支払いに進む/);
  const confirmation = props => renderToStaticMarkup(React.createElement(PurchaseConfirmation, props));
  const legalLinks = { terms: '/terms.html', privacy: '/privacy.html', trade: '/trade.html' };
  for (const planId of ['pack', 'monthly']) {
    const blocked = confirmation({ planId, legalLinks });
    assert.match(blocked, /必要な文書を準備中/);
    assert.doesNotMatch(blocked, /<a[^>]+href="\/terms.html"/);
    const ready = confirmation({ planId, legalLinks, documentsReady: true });
    assert.match(ready, /type="submit" disabled=""/u, '文書があっても確認欄の初期状態では決済へ進めない');
    assert.match(ready, /法定代理人の同意/);
    assert.match(ready, /法令に基づく権利を制限しません/);
    assert.match(ready, /target="_blank" rel="noopener noreferrer"/);
  }
  assert.match(confirmation({ planId: 'pack' }), /980円[\s\S]*3か月後の同日の前日23:59/);
  assert.match(confirmation({ planId: 'monthly' }), /初回600円、以後毎月600円/);
  assert.match(confirmation({ planId: 'monthly' }), /次回更新日時より前/);
  assert.match(confirmation({ planId: 'monthly' }), /カード保存と、以後毎月600円の継続請求に同意/);
  assert.doesNotMatch(confirmation({ planId: 'pack' }), /カード保存と/);
  assert.match(confirmation({ planId: 'pack' }), /翌年1月9日/);
  assert.match(confirmation({ planId: 'monthly' }), /11月9日/);
  assert.equal(confirmation({ planId: 'unknown' }), '');
  assert.match(confirmation({ planId: 'pack', documentsReady: true, legalLinks: { ...legalLinks, terms: '//outside.example' } }), /必要な文書を準備中/);
  let navigated;
  globalThis.window = { location: { assign: url => { navigated = url; } } };
  for (const url of ['http://checkout.stripe.com/a', 'https://checkout.stripe.com.attacker.example/a', 'javascript:alert(1)', 'https://example.com']) assert.throws(() => openStripeUrl(url));
  openStripeUrl('https://checkout.stripe.com/c/pay/test');
  assert.equal(navigated, 'https://checkout.stripe.com/c/pay/test');
  console.log('PASS: disabled checkout, recurring terms, active entitlement, safe redirect');
} finally { await server.close(); }
