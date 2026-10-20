// Real purchase/webhook handlers + Firestore emulator, controllable Stripe fixture.
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if(!process.argv.includes('--run-emulator-check')){
  console.log('No connections. Run with --run-emulator-check inside the demo Firestore emulator.');
  process.exit(0);
}
assert.match(process.env.FIRESTORE_EMULATOR_HOST||'',/^(127\.0\.0\.1|localhost):\d+$/);
assert.equal(process.env.GCLOUD_PROJECT,'demo-construction2nd');
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(root+'functions/package.json');
const {Firestore}=require('@google-cloud/firestore');
const {OAuth2Client}=require('google-auth-library');
const authClient=new OAuth2Client();
authClient.setCredentials({access_token:'emulator-fixture-token',expiry_date:Date.now()+3600000});
const db=new Firestore({projectId:'demo-construction2nd',authClient});
const dbSymbol=Symbol.for('construction-notification-race-db');
const stripeSymbol=Symbol.for('construction-notification-race-stripe');
const uid='notification-race-fixture';
const customer='cus_notification_race_fixture';
const sessionId='cs_test_notification_race_fixture';
const attemptId='notification-race-attempt';
const customerRef=db.doc(`sandboxBillingCustomers/${uid}`);
const grantRef=db.doc(`users/${uid}/sandboxEntitlements/${sessionId}`);
const sessions=new Map();
let creations=0,failNextCommit=false,hooks;
const counts={cases:0,replays:0};
const record=name=>{counts.cases++;console.log(JSON.stringify({pass:name}))};
const signing='whsec_local_fixture_only';
Object.assign(process.env,{GOOGLE_CLOUD_PROJECT:'demo-construction2nd',BILLING_ENABLED:'true',BILLING_SANDBOX:'true',BILLING_TESTER_UIDS:uid,STRIPE_SECRET_KEY:'sk_test_local_fixture_only',STRIPE_WEBHOOK_SECRET:signing,STRIPE_MONTHLY_PRICE_ID:'price_fixture_monthly',STRIPE_PACK_PRICE_ID:'price_fixture_pack',SITE_URL:'https://fixture.invalid'});
const {default:Stripe}=await import(pathToFileURL(root+'functions/node_modules/stripe/esm/stripe.esm.node.js'));
const signingClient=new Stripe('sk_test_local_fixture_only',{apiVersion:'2024-06-20'});
const paidSession={id:sessionId,customer,client_reference_id:uid,mode:'payment',status:'complete',payment_status:'paid',amount_total:980,currency:'jpy',livemode:false,created:Math.floor(Date.now()/1000),metadata:{attemptId},line_items:{data:[{price:{id:'price_fixture_pack'},quantity:1}],has_more:false},payment_intent:{latest_charge:{id:'ch_fixture_paid',paid:true,captured:true,currency:'jpy',amount:980,created:Math.floor(Date.now()/1000),amount_refunded:0}}};
sessions.set(sessionId,paidSession);
class FixtureStripe{
  prices={retrieve:async id=>({id,active:true,currency:'jpy',unit_amount:id==='price_fixture_pack'?980:480,tax_behavior:'inclusive',...(id==='price_fixture_monthly'?{recurring:{interval:'month',interval_count:1}}:{})})};
  subscriptions={list:async function*(){}};
  checkout={sessions:{
    list:async function*(){yield paidSession},
    retrieve:async id=>{assert.equal(id,sessionId);return structuredClone(sessions.get(id))},
    create:async(params,options)=>{
      assert.equal(params.customer,customer);
      if(options.idempotencyKey===`checkout:${attemptId}`)return structuredClone(paidSession);
      creations++;return {id:'cs_test_unexpected_new',status:'open',url:'https://checkout.stripe.com/fixture'};
    },
  }};
  webhooks=signingClient.webhooks;
}
globalThis[stripeSymbol]=FixtureStripe;
globalThis[dbSymbol]={
  doc:(...args)=>db.doc(...args),collection:(...args)=>db.collection(...args),batch:()=>db.batch(),
  runTransaction:fn=>db.runTransaction(async tx=>{
    const value=await fn(tx);
    if(failNextCommit){failNextCommit=false;throw new Error('fixture-commit-failure')}
    return value;
  }),
};
try{
  const entry=pathToFileURL(root+'functions/index.js').href;
  hooks=registerHooks({resolve(specifier,context,next){
    if(specifier==='firebase-admin/firestore')return {url:'data:text/javascript,'+encodeURIComponent("export const getFirestore=()=>globalThis[Symbol.for('construction-notification-race-db')];"),shortCircuit:true};
    if(specifier==='stripe'&&context.parentURL===entry)return {url:'data:text/javascript,'+encodeURIComponent("export default globalThis[Symbol.for('construction-notification-race-stripe')];"),shortCircuit:true};
    return next(specifier,context);
  }});
  const {createCheckout,stripeWebhook,billingAccess}=await import(entry);
  const call=(planId='pack')=>createCheckout.run({auth:{uid},data:{planId}});
  const pending=expiresAt=>({attemptId,planId:'pack',createdAt:Date.now()-120000,expiresAt});
  await customerRef.create({customerId:customer,pending:pending(Date.now()+3600000)});
  await assert.rejects(call(),error=>error.code==='failed-precondition'&&error.message.includes('支払い結果を確認中'));
  await assert.rejects(call('monthly'),error=>error.code==='already-exists');
  assert.equal(creations,0);assert.equal((await grantRef.get()).exists,false);
  record('paid Checkout, missing notification, reservation still valid: both plans reject another purchase');

  await customerRef.update({pending:pending(Date.now()-1000)});
  for(const plan of ['pack','monthly'])await assert.rejects(call(plan),error=>error.code==='failed-precondition'&&error.message.includes('支払い結果を確認中'));
  assert.equal(creations,0);assert.equal((await grantRef.get()).exists,false);
  record('reservation deadline passed, paid Checkout still awaiting grant: neither plan creates another Checkout');

  const event={id:'evt_fixture_delayed_paid',type:'checkout.session.completed',livemode:false,data:{object:{id:sessionId}}};
  const payload=JSON.stringify(event);
  async function notify(){
    const response={code:null,body:null,set(){return this},status(code){this.code=code;return this},send(body){this.body=body;return this},sendStatus(code){this.code=code;return this}};
    await stripeWebhook({method:'POST',rawBody:Buffer.from(payload),headers:{'stripe-signature':signingClient.webhooks.generateTestHeaderString({payload,secret:signing})}},response);
    counts.replays++;return response;
  }
  failNextCommit=true;
  assert.equal((await notify()).code,500);
  assert.equal((await grantRef.get()).exists,false);
  await assert.rejects(call(),error=>error.code==='failed-precondition');
  assert.equal(creations,0);
  record('notification fails before transaction commit: HTTP 500, no partial grant, repurchase remains blocked');

  const parallel=await Promise.allSettled([notify(),...Array.from({length:8},(_,i)=>call(i%2?'pack':'monthly'))]);
  assert.equal(parallel[0].status,'fulfilled');assert.equal(parallel[0].value.code,200);
  for(const item of parallel.slice(1)){
    assert.equal(item.status,'rejected');assert.ok(['failed-precondition','already-exists'].includes(item.reason.code));
  }
  assert.equal(creations,0);
  const saved=(await grantRef.get()).data();assert.equal(saved.revoked,false);
  assert.equal((await db.collection(`users/${uid}/sandboxEntitlements`).get()).size,1);
  assert.equal((await billingAccess.run({auth:{uid},data:{}})).hasAccess,true);
  record('retry notification plus eight mixed-plan purchase calls: one active grant and zero new Checkouts');

  await assert.rejects(call(),error=>error.code==='already-exists');
  await assert.rejects(call('monthly'),error=>error.code==='already-exists');
  const duplicate=await Promise.all([notify(),notify()]);assert.ok(duplicate.every(item=>item.code===200));
  assert.deepEqual((await grantRef.get()).data(),saved);assert.equal(creations,0);
  record('after notification recovery: both plans blocked by active grant, duplicate notifications preserve all fields');
  console.log(JSON.stringify({result:'passed',...counts,newCheckouts:creations,environment:'Firestore emulator + Stripe fixture; no real service changes'}));
}finally{
  hooks?.deregister();delete globalThis[dbSymbol];delete globalThis[stripeSymbol];await db.terminate();
}
