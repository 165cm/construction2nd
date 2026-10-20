// Read-only real Stripe/Firestore check; only callable auth is simulated locally.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--run-read-only-check')) {
  console.log('No connections. Use --run-read-only-check with the dedicated payment-failure fixture state.');
  process.exit(0);
}
const root = fileURLToPath(new URL('../',import.meta.url));
const require = createRequire(root+'package.json');
const runId = new Date().toISOString().replace(/[^0-9]/g,'');
const file = `/tmp/construction-existing-subscriptions-${runId}.json`;
const state = {runId,cases:[],stripeWritesBlocked:0,firestoreWritesBlocked:0};
let db,hooks;
const dbSymbol = Symbol.for('construction-readonly-subscription-db');
const stripeSymbol = Symbol.for('construction-readonly-subscription-stripe');
const stable = value => JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
try {
  const config=Object.fromEntries(readFileSync(root+'functions/.env.construction2nd','utf8').split('\n').filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1).trim()]));
  assert.equal(config.BILLING_SANDBOX,'true');
  const fixture=JSON.parse(readFileSync('/tmp/construction-payment-failure-state.json','utf8'));
  const targets=[fixture.initial,fixture.renewal];
  assert.deepEqual(targets.map(item=>item.uid),['billing-failure-test-20261020-initial','billing-failure-test-20261020-renewal']);
  for(const key of ['STRIPE_MONTHLY_PRICE_ID','STRIPE_PACK_PRICE_ID','SITE_URL'])process.env[key]=config[key];
  Object.assign(process.env,{GOOGLE_CLOUD_PROJECT:'construction2nd',BILLING_ENABLED:'true',BILLING_SANDBOX:'true',BILLING_TESTER_UIDS:targets.map(item=>item.uid).join(',')});
  process.env.STRIPE_SECRET_KEY=execFileSync(root+'node_modules/.bin/firebase',['functions:secrets:access','STRIPE_SECRET_KEY','--project','construction2nd'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
  const {default:Stripe}=await import(pathToFileURL(root+'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  class ReadOnlyStripe extends Stripe {
    constructor(key,options){
      const httpClient=Stripe.createNodeHttpClient();
      const original=httpClient.makeRequest.bind(httpClient);
      httpClient.makeRequest=(...args)=>{
        if(args[3]!=='GET'){state.stripeWritesBlocked++;throw new Error('stripe-mutation-prohibited')}
        return original(...args);
      };
      super(key,{...options,httpClient});
    }
  }
  globalThis[stripeSymbol]=ReadOnlyStripe;
  const stripe=new ReadOnlyStripe(process.env.STRIPE_SECRET_KEY,{apiVersion:'2024-06-20',maxNetworkRetries:0});
  const auth=require('firebase-tools/lib/auth.js');
  const token=await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const fnRequire=createRequire(root+'functions/package.json');
  const {Firestore}=fnRequire('@google-cloud/firestore');
  const {OAuth2Client}=fnRequire('google-auth-library');
  const authClient=new OAuth2Client();authClient.setCredentials({access_token:token.access_token,expiry_date:Date.now()+45*60000});
  db=new Firestore({projectId:'construction2nd',authClient});
  const paths=new Set(targets.map(item=>`sandboxBillingCustomers/${item.uid}`));
  const grantPaths=new Set(targets.map(item=>`users/${item.uid}/sandboxEntitlements`));
  globalThis[dbSymbol]={
    doc(path){assert.ok(paths.has(path));return {get:()=>db.doc(path).get()}},
    collection(path){assert.ok(grantPaths.has(path));return {where:(...args)=>({get:()=>db.collection(path).where(...args).get()})}},
    runTransaction(){state.firestoreWritesBlocked++;throw Object.assign(new Error('readonly-check-stops-before-reservation'),{code:'readonly-boundary'})},
  };
  const dbWrapper="export const getFirestore=()=>globalThis[Symbol.for('construction-readonly-subscription-db')];";
  const stripeWrapper="export default globalThis[Symbol.for('construction-readonly-subscription-stripe')];";
  hooks=registerHooks({resolve(specifier,context,next){
    if(specifier==='firebase-admin/firestore')return {url:'data:text/javascript,'+encodeURIComponent(dbWrapper),shortCircuit:true};
    if(specifier==='stripe'&&context.parentURL===pathToFileURL(root+'functions/index.js').href)return {url:'data:text/javascript,'+encodeURIComponent(stripeWrapper),shortCircuit:true};
    return next(specifier,context);
  }});
  const {createCheckout}=await import(pathToFileURL(root+'functions/index.js'));
  for(const target of targets){
    const ref=db.doc(`sandboxBillingCustomers/${target.uid}`);
    const snapshot=await ref.get();assert.equal(snapshot.data()?.customerId,target.customer,'fixture mapping must already exist');
    const sub=await stripe.subscriptions.retrieve(target.sub);
    assert.equal(sub.livemode,false);assert.equal(sub.customer,target.customer);
    const currentSubscriptions=await stripe.subscriptions.list({customer:target.customer,status:'all',limit:100});
    assert.equal(currentSubscriptions.has_more,false);
    const blocked=currentSubscriptions.data.some(item=>!['canceled','incomplete_expired'].includes(item.status));
    const sessionsBefore=await stripe.checkout.sessions.list({customer:target.customer,limit:100});
    const grantsBefore=(await db.collection(`users/${target.uid}/sandboxEntitlements`).get()).docs.map(item=>[item.id,item.data()]);
    for(const planId of ['monthly','pack']){
      await assert.rejects(createCheckout.run({auth:{uid:target.uid},data:{planId}}),error=>{
        if(blocked)return error.code==='already-exists'&&error.message.includes('月額契約があります');
        return error.code==='readonly-boundary';
      });
      state.cases.push({uid:target.uid,status:sub.status,planId,result:blocked?'existing-subscription-rejected':'terminal-subscription-passed-to-reservation-boundary'});
      console.log(JSON.stringify(state.cases.at(-1)));
    }
    assert.equal(stable((await ref.get()).data()),stable(snapshot.data()));
    assert.deepEqual((await stripe.checkout.sessions.list({customer:target.customer,limit:100})).data.map(item=>item.id),sessionsBefore.data.map(item=>item.id));
    assert.equal(stable((await db.collection(`users/${target.uid}/sandboxEntitlements`).get()).docs.map(item=>[item.id,item.data()])),stable(grantsBefore));
    assert.equal(stable(await stripe.subscriptions.retrieve(target.sub)),stable(sub));
  }
  assert.equal(state.stripeWritesBlocked,0,'handler must never attempt a Stripe write');
  state.result='passed';
}catch(error){state.result='failed';state.failure={type:error.type||error.name,code:error.code||'check-failed'};console.error(JSON.stringify(state.failure));process.exitCode=1}
finally{
  hooks?.deregister();delete globalThis[dbSymbol];delete globalThis[stripeSymbol];delete process.env.STRIPE_SECRET_KEY;await db?.terminate();
  writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
  console.log(JSON.stringify({result:state.result,cases:state.cases.length,stripeWritesBlocked:state.stripeWritesBlocked,firestoreWritesBlocked:state.firestoreWritesBlocked,file}));
}
