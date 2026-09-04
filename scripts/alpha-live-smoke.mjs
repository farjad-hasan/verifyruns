// Creates only disposable accounts on VerifyRuns staging and production; deletes both in finally.
// Uses a staging public status feed (under its 30-run cap) as a controlled synthetic destination.
// The alert receiver is another disposable staging Check, NOT a real Slack/Discord inbox.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const staging='https://verifyruns-api-staging.farjad-developer.workers.dev/api';
const production='https://verifyruns-api.farjad-developer.workers.dev/api';
const clients=[];
async function client(base) {
  let token;
  const request=async(path,method='GET',body,status=200,authenticated=true)=>{
    const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(authenticated&&token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await r.json();assert.equal(r.status,status,method+' '+path.split('/').slice(0,3).join('/')+' on '+base);return data;
  };
  const email='alpha-release-'+randomUUID()+'@example.test',password=randomUUID();
  token=(await request('/auth/register','POST',{email,password})).token;
  clients.push({request});
  assert((await request('/auth/login','POST',{email,password})).token);
  return {request};
}
const report=[];const ok=s=>{report.push(s);console.log('PASS '+s)};
try {
  const s=await client(staging),p=await client(production);ok('staging and production signup/login');
  const create=()=>s.request('/checks','POST',{name:'Disposable alpha release fixture',connector_kind:'http_json',config:{url:'https://jsonplaceholder.typicode.com/todos'},expectations:{min_new_records:0},retry_before_alert:false});
  const source=await create(),receiver=await create();
  const share=await s.request('/checks/'+source.id+'/public','POST');
  const destination=staging+'/public/checks/'+share.public_token;
  const c=await p.request('/checks','POST',{name:'Disposable alpha release verification',connector_kind:'http_json',config:{url:destination,json_path:'runs',newest_key:'timestamp'},expectations:{min_new_records:1},retry_before_alert:false,alert_channels:[{kind:'slack',target:staging+'/hook/'+receiver.webhook_secret}]});
  const path='/checks/'+c.id;
  const hook=body=>p.request('/hook/'+c.webhook_secret,'POST',body,200,false);
  const received=()=>s.request('/checks/'+receiver.id+'/runs');
  const write=async(n)=>{for(let i=0;i<n;i++)assert.equal((await s.request('/hook/'+source.webhook_secret,'POST',{},200,false)).verdict,'PASS')};
  assert.equal((await p.request(path+'/channels/'+c.alert_channels[0].id+'/test','POST')).ok,true);
  assert.equal((await received()).length,1);assert.equal((await p.request(path+'/runs')).length,0);ok('production channel test reaches synthetic HTTP receiver without a verdict');
  const baseline=await hook({});assert.equal(baseline.verdict,'FAIL');assert.match(baseline.diff_message,/Baseline recorded at 0/);assert.equal((await received()).length,1);ok('fresh baseline does not claim pre-existing growth or send setup alert');
  await write(3);assert.equal((await hook({wrote:3})).verdict,'PASS');ok('actual staging writes produce production growth PASS');
  const failure=await hook({wrote:3});assert.equal(failure.verdict,'FAIL');assert.match(failure.diff_message,/destination gained 0/);assert.equal((await received()).length,2);
  await hook({wrote:3});assert.equal((await received()).length,2);ok('missing additions produce FAIL and one synthetic failure notification');
  await write(3);assert.equal((await hook({wrote:3})).verdict,'PASS');assert.equal((await received()).length,3);ok('new additions recover and deliver synthetic recovery notification');
  const publicStatus=await p.request(path+'/public','POST');
  const pub=await p.request('/public/checks/'+publicStatus.public_token,'GET',undefined,200,false);
  assert.equal(pub.last_verdict,'PASS');assert(!JSON.stringify(pub).includes(c.webhook_secret));assert(!JSON.stringify(pub).includes(destination));
  await p.request(path+'/public','DELETE');await p.request('/public/checks/'+publicStatus.public_token,'GET',undefined,404,false);ok('anonymous public status redaction and revocation');
  await p.request(path,'PATCH',{expectations:{min_new_records:0,required_fields:['definitely_absent_release_field']}});
  const fields=await hook({});assert.equal(fields.verdict,'FAIL');assert.match(fields.diff_message,/field .* is missing/);ok('configured missing field fails on the deployed engine');
  await p.request('/interest','POST',{plan:'pro'});ok('pricing interest endpoint');
  for(const [name,base] of [['staging',staging],['production',production]]){
    const r=await fetch(base+'/health');assert.equal(r.status,200);assert.equal((await r.json()).ok,true);ok(name+' scheduler health');
  }
} finally {
  let cleanupError;
  for(const c of clients.reverse())try{await c.request('/auth/me','DELETE');await c.request('/auth/me','GET',undefined,401);ok('disposable account and session removed')}catch(e){cleanupError=e;console.error('Account cleanup failed; inspect the disposable alpha release account.');}
  if(cleanupError)throw cleanupError;
}
console.log(JSON.stringify({passed:report.length,checks:report,providerReceipt:'synthetic HTTP only; confirm actual pilot inbox separately'},null,2));
