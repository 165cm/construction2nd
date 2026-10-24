// 明示起動するローカル結合確認。認証/決済/クラウドは模擬で外部に接続しない。
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
if (!process.argv.includes('--serve-local-check')) {
  console.log('未起動。--serve-local-check で http://127.0.0.1:5212/ を確認できます。');
  process.exit(0);
}
const documents = !process.argv.includes('--documents-not-ready');
const billing = !process.argv.includes('--billing-not-ready');
const calendar = !process.argv.includes('--calendar-not-ready');
const fixture = `import React from 'react';import{createRoot}from'react-dom/client';import BillingPanel from '/src/components/BillingPanel.jsx';
const root=createRoot(document.getElementById('root'));
window.fixture={calls:[],navigations:[],held:{},pending:{},access:{hasAccess:false,billingEnabled:true,sandbox:true},
async call(name,uid,data){this.calls.push({name,uid,data});this.show();if(this.held[name])return new Promise(resolve=>{(this.pending[name]||=[]).push(resolve)});return name==='billingAccess'?this.access:{url:'https://checkout.stripe.com/fixture'}},
release(name,value){this.pending[name].shift()(value)},show(){document.getElementById('calls').textContent=JSON.stringify({calls:this.calls,navigations:this.navigations})},mount(uid){root.render(React.createElement('section',null,React.createElement('p',null,'現在の確認用アカウント：'+uid),React.createElement(BillingPanel,{uid})))}};window.fixture.mount('account-a');
for(const id of ['account-a','account-b'])document.getElementById(id).onclick=()=>window.fixture.mount(id);
document.getElementById('active').onclick=()=>{window.fixture.access={hasAccess:true,billingEnabled:true,sandbox:true,expiresAt:Date.now()+60000};document.getElementById('fixture-state').textContent='次の照会で有効権利を返します'};
document.getElementById('hold').onclick=()=>{window.fixture.held.createCheckout=true;document.getElementById('fixture-state').textContent='Checkout応答を保留します'};
document.getElementById('release').onclick=()=>{window.fixture.release('createCheckout',{url:'https://checkout.stripe.com/fixture'});setTimeout(()=>window.fixture.show(),0)};`;

const server = await createServer({ configFile: false, envDir: false, base: '/', cacheDir: '.cache/billing-panel-local-check-vite',
    define: { 'import.meta.env.VITE_BILLING_READY': JSON.stringify(String(billing)),
      'import.meta.env.VITE_CALENDAR_BILLING_READY': JSON.stringify(String(calendar)),
      'import.meta.env.VITE_PURCHASE_DOCUMENTS_READY': JSON.stringify(String(documents)) },
    plugins: [react(), { name: 'local-billing-fixture', enforce: 'pre',
      resolveId(id) { if (id === '/billing-test-app.jsx') return id; },
      load(id) {
        if (id === '/billing-test-app.jsx') return fixture;
        if (id.endsWith('/src/services/billing.js')) return `export const billingCall=(...args)=>window.fixture.call(...args);export const openStripeUrl=url=>{window.fixture.navigations.push(url);window.fixture.show()};`;
      },
      configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
        if (req.url !== '/') return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await vite.transformIndexHtml('/', `<html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#020617;color:white;font:16px sans-serif;max-width:800px;margin:auto;padding:16px"><h1>ローカル模擬BillingPanel</h1><p>実認証・Stripe・Firestoreには接続しません。</p><button id="account-a">アカウントA</button><button id="account-b">アカウントB</button><button id="active">次の照会で利用権を復帰</button><button id="hold">Checkout応答を保留</button><button id="release">保留応答を解放</button><p id="fixture-state"></p><div id="root"></div><pre id="calls" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><script type="module" src="/billing-test-app.jsx"></script></body></html>`));
      }); },
    }], server: { host: '127.0.0.1', port: 5212, strictPort: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react-dom/client', 'react/jsx-runtime'] } });

await server.listen();
console.log('ローカル結合確認: http://127.0.0.1:5212/');
