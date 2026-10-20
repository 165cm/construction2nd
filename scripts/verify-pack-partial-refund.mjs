// A one-time 1 JPY sandbox refund of the dedicated UI test pack; never personal grants.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--run-sandbox-check')) {
  console.log('No connections. --run-sandbox-check refunds 1 test JPY on the dedicated UI-test pack only.');
  process.exit(0);
}
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(root+'package.json');
const runId=new Date().toISOString().replace(/[^0-9]/g,'');
const file=`/tmp/construction-pack-partial-${runId}.json`;
const state={runId,cases:[],replays:[]};
const save=()=>writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const stable=value=>JSON.stringify(canonical(value));
try{
  const config=Object.fromEntries(readFileSync(root+'functions/.env.construction2nd','utf8').split('\n').filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1).trim()]));
  assert.equal(config.BILLING_SANDBOX,'true');
  const target=JSON.parse(readFileSync('/tmp/construction-checkout-ui-state.json','utf8'));
  assert.equal(target.uid,'billing-checkout-ui-test-20261020');
  const testers=config.BILLING_TESTER_UIDS.split(',').map(value=>value.trim()).filter(Boolean);
  assert.ok(testers.length>0&&!testers.includes(target.uid),'dedicated fake target only');
  const secret=name=>execFileSync(root+'node_modules/.bin/firebase',['functions:secrets:access',name,'--project','construction2nd'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const key=secret('STRIPE_SECRET_KEY');assert.ok(key.startsWith('sk_test_'));
  const signing=secret('STRIPE_WEBHOOK_SECRET');
  const {default:Stripe}=await import(pathToFileURL(root+'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  const {accessSummary}=await import(pathToFileURL(root+'functions/billingPolicy.js'));
  const stripe=new Stripe(key,{apiVersion:'2024-06-20',maxNetworkRetries:2});
  const auth=require('firebase-tools/lib/auth.js');
  const token=await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const base='https://firestore.googleapis.com/v1/projects/construction2nd/databases/(default)/documents/';
  const headers={Authorization:'Bearer '+token.access_token};
  async function get(path){const response=await fetch(base+path,{headers,signal:AbortSignal.timeout(30000)});if(response.status===404)return null;assert.equal(response.status,200);return response.json()}
  const grants=async uid=>((await get(`users/${uid}/sandboxEntitlements`))?.documents||[]).sort((a,b)=>a.name.localeCompare(b.name));
  const fields=docs=>docs.map(doc=>doc.fields);
  const plain=doc=>Object.fromEntries(Object.entries(doc.fields).map(([name,value])=>[name,'integerValue'in value?Number(value.integerValue):'booleanValue'in value?value.booleanValue:value.stringValue]));
  const testerBefore=await Promise.all(testers.map(async uid=>stable(fields(await grants(uid)))));
  const customerBefore=await get(`sandboxBillingCustomers/${target.uid}`);
  assert.equal(customerBefore?.fields?.customerId?.stringValue,target.customer);
  const session=await stripe.checkout.sessions.retrieve(target.session,{expand:['payment_intent.latest_charge']});
  assert.equal(session.livemode,false);assert.equal(session.customer,target.customer);assert.equal(session.client_reference_id,target.uid);
  assert.equal(session.status,'complete');assert.equal(session.payment_status,'paid');assert.equal(session.amount_total,980);assert.equal(session.currency,'jpy');assert.equal(session.mode,'payment');
  const charge=session.payment_intent.latest_charge;
  assert.equal(charge.livemode,false);assert.equal(charge.customer,target.customer);assert.equal(charge.amount,980);assert.equal(charge.amount_refunded,0,'already refunded: do not make another refund');
  const before=await grants(target.uid);
  assert.equal(before.length,1);assert.equal(before[0].name.split('/').at(-1),session.id);
  assert.equal(before[0].fields.planId.stringValue,'pack');assert.equal(before[0].fields.chargeId.stringValue,charge.id);assert.equal(before[0].fields.revoked.booleanValue,false);
  assert.equal(accessSummary(before.map(plain)).hasAccess,true);
  Object.assign(state,{uid:target.uid,customer:target.customer,session:session.id,charge:charge.id,before:fields(before)});save();
  const record=name=>{state.cases.push(name);save();console.log(JSON.stringify({pass:name}))};
  record('dedicated fake paid 980 JPY pack, no prior refund, active grant verified');
  const refund=await stripe.refunds.create({charge:charge.id,amount:1,metadata:{purpose:'dedicated-pack-partial-refund-check'}},{idempotencyKey:session.id+'-partial-refund-check'});
  assert.equal(refund.status,'succeeded');assert.equal(refund.amount,1);state.refund=refund.id;save();
  const afterCharge=await stripe.charges.retrieve(charge.id);assert.equal(afterCharge.amount_refunded,1);
  async function poll(read,ready,label){for(let attempt=0;attempt<40;attempt++){const value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,800))}throw new Error(label+'-timeout')}
  const after=await poll(()=>grants(target.uid),docs=>docs.length===1&&docs[0].fields.revoked.booleanValue===true,'refund-notification');
  const expected=structuredClone(fields(before));expected[0].revoked={booleanValue:true};
  assert.equal(stable(fields(after)),stable(expected));assert.equal(accessSummary(after.map(plain)).hasAccess,false);
  state.after=fields(after);record('actual 1 JPY refund notification revoked grant; period and other fields unchanged');
  async function event(type,id){return poll(async()=>{for await(const item of stripe.events.list({type,limit:100})){if(item.data.object.id===id){assert.equal(item.livemode,false);return item}}return null},Boolean,'event')}
  const paidEvent=await event('checkout.session.completed',session.id);
  const refundEvent=await event('charge.refunded',charge.id);
  async function replay(item){const payload=JSON.stringify(item);const signature=stripe.webhooks.generateTestHeaderString({payload,secret:signing});const response=await fetch('https://asia-northeast1-construction2nd.cloudfunctions.net/stripeWebhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload,signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);state.replays.push({id:item.id,type:item.type});save()}
  await replay(paidEvent);await replay(paidEvent);
  assert.equal(stable(fields(await grants(target.uid))),stable(fields(after)));
  record('paid notification replayed twice: access remains revoked and grant count unchanged');
  await Promise.all([replay(paidEvent),replay(refundEvent)]);
  assert.equal(stable(fields(await grants(target.uid))),stable(fields(after)));
  assert.equal(accessSummary((await grants(target.uid)).map(plain)).hasAccess,false);
  record('concurrent paid/refund replays: access remains revoked');
  const sessions=await stripe.checkout.sessions.list({customer:target.customer,limit:100});assert.equal(sessions.has_more,false);assert.deepEqual(sessions.data.map(item=>item.id),[session.id]);
  assert.deepEqual(await Promise.all(testers.map(async uid=>stable(fields(await grants(uid))))),testerBefore);
  record('no additional Checkout; original tester grants unchanged');
  state.result='passed';
}catch(error){state.result='failed';state.failure={type:error.type||error.name,code:error.code||'check-failed'};console.error(JSON.stringify(state.failure));process.exitCode=1}
finally{save();console.log(JSON.stringify({result:state.result,cases:state.cases.length,replays:state.replays.length,refund:state.refund,file}))}
