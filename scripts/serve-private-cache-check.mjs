import http from 'node:http';
import fs from 'node:fs/promises';

// 本番・本人の端末記録に接続せず、実ブラウザでリポジトリのSWを検証する。
if (!process.argv.includes('--serve-local-check')) {
  console.log('No server started. Use --serve-local-check, then open http://127.0.0.1:5203/ .');
  process.exit(0);
}
const hits = new Map();
const page = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>教材キャッシュの検証</title>
<style>body{font:17px system-ui;background:#0f172a;color:#e2e8f0;margin:40px;line-height:1.8}button{font:inherit;padding:14px 22px}li{margin:8px 0}.pass{color:#6ee7b7}.fail{color:#fda4af}</style>
<h1>教材キャッシュの検証</h1><p>ローカル専用・実際のService Workerを使用。本人の記録・契約には接続しません。</p>
<button id="run">まとめて検証する</button><h2 id="status">未実行</h2><ol id="results"></ol>
<script type="module">
const assert=(ok,message)=>{if(!ok)throw new Error(message)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cached=async path=>{for(const name of await caches.keys()){if(await (await caches.open(name)).match(path))return true}return false};
const report=(name,error)=>{const li=document.createElement('li');li.textContent=(error?'失敗：':'成功：')+name+(error?' / '+error.message:'');li.className=error?'fail':'pass';document.querySelector('#results').append(li)};
document.querySelector('#run').onclick=async()=>{
 document.querySelector('#run').disabled=true;
 document.querySelector('#status').textContent='検証中';
 let failures=0;
 const check=async(name,fn)=>{try{await fn();report(name)}catch(error){failures++;report(name,error)}};
 const run=String(Date.now());
 await check('旧版キャッシュを更新時に削除',async()=>{
   const old=await caches.open('denkou-cache-check-old-'+run);
   await old.put('/old-paid-test-only',new Response('test-only'));
   const changed=new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
   await navigator.serviceWorker.register('/sw.js?run='+run);
   await navigator.serviceWorker.ready;
   await Promise.race([changed,sleep(15000).then(()=>{throw new Error('SWの切替待機が時間切れ')})]);
   // controllerchangeはactivate内の非同期キャッシュ削除より先に届く場合がある。
   for(let attempt=0;attempt<40&&(await caches.keys()).includes('denkou-cache-check-old-'+run);attempt++)await sleep(50);
   assert(!(await caches.keys()).includes('denkou-cache-check-old-'+run),'旧版キャッシュが残る');
 });
 for(const policy of ['no-store','private'])for(const kind of ['image.png','code.js']){
   await check(policy+'応答を保存しない：'+kind,async()=>{
     const path='/cache-check/'+policy+'/'+kind+'?run='+run;
     const response=await fetch(path);assert(response.ok,'HTTP失敗');await response.text();
     await sleep(150);assert(!await cached(path),'永続キャッシュに保存された');
   });
 }
 await check('認証ヘッダー付き通信を保存しない',async()=>{
   const path='/cache-check/public/auth.png?run='+run;
   await (await fetch(path,{headers:{Authorization:'Bearer local-fixture-only'}})).text();
   await sleep(150);assert(!await cached(path),'認証付き通信が保存された');
 });
 await check('教材API通信を保存しない',async()=>{
   const path='/api/content?run='+run;
   await (await fetch(path)).text();await sleep(150);assert(!await cached(path),'API通信が保存された');
 });
 await check('公開画像は保存できる',async()=>{
   const path='/cache-check/public/free.png?run='+run;
   await (await fetch(path)).text();await sleep(150);assert(await cached(path),'公開画像が保存されない');
 });
 await check('公開ファイルの通信失敗では保存済み内容を利用',async()=>{
   const path='/cache-check/fail-second/free.js?run='+run;
   const first=await (await fetch(path)).text();await sleep(150);assert(await cached(path),'初回内容が未保存');
   assert(await (await fetch(path)).text()===first,'公開ファイルの復帰に失敗');
 });
 await check('非保存画像の通信失敗で以前の内容を再表示しない',async()=>{
   const path='/cache-check/fail-second/private.png?run='+run;
   await (await fetch(path)).text();await sleep(150);assert(!await cached(path),'初回画像が保存された');
   let failed=false;try{await fetch(path)}catch{failed=true}assert(failed,'非保存画像が再表示された');
 });
 document.querySelector('#status').textContent=failures?'失敗 '+failures+'件':'全10項目成功';
};
</script></html>`;
const server = http.createServer(async (req,res)=>{
  const url = new URL(req.url, 'http://127.0.0.1:5203');
  if (url.pathname === '/sw.js') {
    res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
    res.end(await fs.readFile(new URL('../public/sw.js',import.meta.url)));return;
  }
  if (url.pathname === '/api/content' || url.pathname.startsWith('/cache-check/')) {
    const count=(hits.get(req.url)||0)+1;hits.set(req.url,count);
    if(url.pathname.includes('/fail-second/')&&count>1){req.socket.destroy();return}
    const policy=url.pathname.includes('/no-store/')||url.pathname.endsWith('/private.png')?'no-store':url.pathname.includes('/private/')?'private, max-age=600':'public, max-age=600';
    res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':policy});
    res.end('local-test-only:'+url.pathname);return;
  }
  if (['/','/index.html','/manifest.json','/icon.svg'].includes(url.pathname)) {
    res.writeHead(200,{'Content-Type':url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.svg')?'image/svg+xml':'text/html','Cache-Control':'no-store'});
    res.end(url.pathname.endsWith('.json')?'{}':url.pathname.endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg"/>':page);return;
  }
  res.writeHead(404);res.end();
});
server.listen(5203,'127.0.0.1',()=>console.log('Local cache check: http://127.0.0.1:5203/ (no production connections)'));
