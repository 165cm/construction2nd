import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { contentHandler } from '../functions/contentAccess.js';
import { accessSummary } from '../functions/billingPolicy.js';

if (!process.argv.includes('--serve-local-check')) {
  console.log('No server started. Use --serve-local-check, then open http://127.0.0.1:5204/ .');
  process.exit(0);
}
const root = new URL('../functions/private-content/', import.meta.url);
const manifest = new Set(JSON.parse(await readFile(new URL('manifest.json',root),'utf8')));
const imageCheck = process.argv.includes('--image-failure-check');
const port = imageCheck ? 5207 : 5204;
const targetAsset = 'choices/r7_2/48.webp';
if(imageCheck && !manifest.has('assets/'+targetAsset)) throw new Error('Generate private content before the image check');
let imageMode = 'http';
let expired = false;
const expiresAt = Date.now()+1800000;
const metrics = { authorized:0, denied:0, imageAttempts:0, imageFailures:0, imageSuccesses:0 };
const grants = uid => uid==='fixture-paid-user' ? [{startsAt:0,expiresAt:expired?0:expiresAt,revoked:false}] : [];
const verify = async token => {
  if(token==='fixture-paid-token')return {uid:'fixture-paid-user'};
  if(token==='fixture-other-token')return {uid:'fixture-other-user'};
  throw new Error('invalid-fixture-token');
};
const handler = contentHandler({enabled:()=>true,verifyToken:verify,getGrants:async uid=>grants(uid),
  readContent:async key=>manifest.has(key)?readFile(new URL(key,root)):null,
});
const state = {schemaVersion:3,examResults:{r7_2:[{id:'fixture-expiry-history',finishedAt:1792493052000,score:8,correctCount:4,totalCount:50,isPassed:false,timeSpent:146,contentFormat:'references-v1',details:[]}]},records:{},bookmarks:[],exp:0,level:1,streak:0,maxStreak:0,totalAnswered:0,totalCorrect:0,totalTimeSpentSec:0,responseTimes:[],badges:[],recentHistory:[],examProgress:{},dailyLog:{}};
if(imageCheck) state.examProgress.r7_2 = {round:1,currentQuestionId:48,currentQuizIndex:47};
const controls = `<script>
if(!sessionStorage.getItem('expiry-fixture-seeded')){
 localStorage.setItem('denkou2_current_exam_id','r7_2');
 localStorage.setItem('denkou2_mastery_state_v1',${JSON.stringify(JSON.stringify(state))});
 localStorage.setItem('denkou2_auto_advance_v1','off');
 sessionStorage.setItem('expiry-fixture-seeded','yes');
}
window.addEventListener('DOMContentLoaded',async()=>{
 const panel=document.createElement('aside');panel.style='position:fixed;z-index:9999;bottom:85px;right:8px;background:#fff;color:#111;padding:10px;border:2px solid #2563eb;font:12px system-ui;max-width:250px';
 panel.innerHTML='<strong>ローカル専用・本人契約は変更なし</strong><br><button id="fixture-end">検証用の期限を終了する</button><p id="fixture-status">利用権あり</p>';
 document.body.append(panel);
 const status=await(await fetch('/fixture/metrics')).json();
 if(status.expired){document.querySelector('#fixture-status').textContent='検証用の利用権：期限切れ';document.querySelector('#fixture-end').disabled=true}
 document.querySelector('#fixture-end').onclick=async()=>{
  await fetch('/fixture/end',{method:'POST'});
  document.querySelector('#fixture-status').textContent='検証用の利用権：期限切れ';
  document.querySelector('#fixture-end').disabled=true;
  window.dispatchEvent(new Event('pageshow'));
 };
});
</script>`;
const imageControls = `<script>
if(!sessionStorage.getItem('image-fixture-seeded')){
 localStorage.setItem('denkou2_current_exam_id','r7_2');
 localStorage.setItem('denkou2_mastery_state_v1',${JSON.stringify(JSON.stringify(state))});
 localStorage.setItem('denkou2_auto_advance_v1','off');
 sessionStorage.setItem('image-fixture-seeded','yes');
}
window.addEventListener('DOMContentLoaded',()=>{
 const panel=document.createElement('aside');
 panel.style='position:fixed;z-index:9999;bottom:85px;right:8px;background:#fff;color:#111;padding:8px;border:2px solid #2563eb;font:12px system-ui;max-width:240px';
 panel.innerHTML='<strong>ローカル専用：問48の選択肢画像だけ障害</strong><br><button id="image-http">503を再現</button> <button id="image-corrupt">破損画像を再現</button><br><button id="image-recover">画像通信を復旧</button><p id="image-status">他の画像・利用権は正常</p>';
 document.body.append(panel);
 const change=async mode=>{await fetch('/fixture/image/'+mode,{method:'POST'});};
 document.querySelector('#image-http').onclick=async()=>{await change('http');location.reload()};
 document.querySelector('#image-corrupt').onclick=async()=>{await change('corrupt');location.reload()};
 document.querySelector('#image-recover').onclick=async()=>{await change('healthy');document.querySelector('#image-status').textContent='復旧済み：画像を再試行してください'};
});
</script>`;
const server = await createServer({
  define:{'import.meta.env.VITE_PRIVATE_CONTENT':JSON.stringify('true')},
  server:{host:'127.0.0.1',port,strictPort:true},
  optimizeDeps:{noDiscovery:true,entries:[],include:['react','react-dom/client','react/jsx-runtime','lucide-react']},
  plugins:[{name:'expiry-fixture',enforce:'pre',transformIndexHtml:html=>html.replace('</head>',(imageCheck?imageControls:controls)+'</head>'),
    resolveId(id){if(id==='firebase/auth'||id==='/expiry-fixture-auth.js')return '/expiry-fixture-auth.js';if(id==='firebase/app')return '/expiry-fixture-app.js'},
    load(id){
      if(id==='/expiry-fixture-auth.js')return "const other=new URLSearchParams(location.search).get('account')==='other';export const auth={currentUser:{uid:other?'fixture-other-user':'fixture-paid-user',getIdToken:async()=>other?'fixture-other-token':'fixture-paid-token'},authStateReady:async()=>{}};export const getAuth=()=>auth;";
      if(id==='/expiry-fixture-app.js')return 'export const getApps=()=>[{}];export const initializeApp=()=>({});';
      if(id.endsWith('/src/services/firebaseConfig.js'))return 'export const firebaseEnabled=true;export const firebaseConfig={};';
      if(id.endsWith('/src/services/cloudBackup.js'))return "import{auth}from'/expiry-fixture-auth.js';export const observeAccount=fn=>{fn(auth.currentUser);return()=>{}};export const loginGoogle=async()=>{};export const logoutAccount=async()=>{};export const readCloudBackup=async()=>null;export const writeCloudBackup=async()=>{throw new Error('Fixture does not write cloud data')};";
      if(id.endsWith('/src/services/billing.js'))return "import{auth}from'/expiry-fixture-auth.js';export const billingCall=async()=>await(await fetch('/fixture/access',{headers:{Authorization:'Bearer '+await auth.currentUser.getIdToken()}})).json();export const openStripeUrl=()=>{throw new Error('Fixture does not open checkout')};";
    },
    configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url,`http://127.0.0.1:${port}`);
      if(imageCheck && url.pathname.startsWith('/fixture/image/') && req.method==='POST'){
        const mode=url.pathname.split('/').at(-1);
        if(!['http','corrupt','healthy'].includes(mode)){res.statusCode=400;res.end('Unknown fixture mode');return}
        imageMode=mode;res.end('Fixture image mode updated');return;
      }
      if(url.pathname==='/fixture/end'&&req.method==='POST'){expired=true;res.end('Expired fixture only');return}
      if(url.pathname==='/fixture/access'){
        const user=await verify((req.headers.authorization||'').replace(/^Bearer /,''));
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({...accessSummary(grants(user.uid),Date.now()),serverNow:Date.now(),billingEnabled:false,sandbox:true}));return;
      }
      if(url.pathname==='/fixture/metrics'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...metrics,expired,...(imageCheck?{imageMode,targetAsset}:{})}));return}
      if(url.pathname!=='/api/content')return next();
      if(imageCheck && req.method==='GET' && url.searchParams.get('asset')===targetAsset && req.headers.authorization==='Bearer fixture-paid-token'){
        metrics.imageAttempts++;
        if(imageMode!=='healthy'){
          metrics.imageFailures++;res.setHeader('Cache-Control','no-store');
          if(imageMode==='http'){res.statusCode=503;res.end('Local isolated image failure');return}
          res.setHeader('Content-Type','image/webp');
          res.setHeader('X-Server-Time',String(Date.now()));res.setHeader('X-Access-Expires-At',String(Math.min(expiresAt,Date.now()+60000)));
          res.end('Intentionally corrupt local image');return;
        }
        metrics.imageSuccesses++;
      }
      const response={set(k,v){res.setHeader(k,v);return this},status(code){res.statusCode=code;return this},send(body){if(res.statusCode===200)metrics.authorized++;if(res.statusCode===403)metrics.denied++;res.end(body);return this}};
      await handler({method:req.method,query:Object.fromEntries(url.searchParams),headers:req.headers},response);
    })},
  }],
});
await server.listen();
console.log(`Local ${imageCheck?'isolated image retry':'expiry'} check: http://127.0.0.1:${port}/ (fixture auth/grants; real app and content handler)`);
