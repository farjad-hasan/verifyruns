// Local-only rehearsal. Run fixture first, then test against a local Wrangler API.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const apiBase = process.env.ALPHA_API || 'http://localhost:8787/api';
assert(['localhost','127.0.0.1'].includes(new URL(apiBase).hostname), 'This fixture smoke is local-only.');
const fixture = 'http://127.0.0.1:8790';
if (process.argv[2] === 'serve') {
  let records = [{id:1,email:'demo@example.test'}]; let alerts=[];
  http.createServer(async(req,res)=>{
    const chunks=[]; for await(const c of req) chunks.push(c);
    let body; try {body=JSON.parse(Buffer.concat(chunks).toString() || '{}');} catch {res.writeHead(400).end();return;}
    res.setHeader('content-type','application/json');
    if(req.url === '/state' && req.method === 'POST'){records=body.records || [];alerts=[];res.end('{}');}
    else if(req.url === '/records' || req.url === '/other-records')res.end(JSON.stringify(records));
    else if(req.url === '/alert' && req.method === 'POST'){alerts.push(body);res.end('{}');}
    else if(req.url === '/alerts')res.end(JSON.stringify(alerts));
    else res.writeHead(404).end('{}');
  }).listen(8790,'127.0.0.1',()=>console.log('Local fixture on 8790'));
  const root=resolve('frontend/build');
  http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname;
    let file=resolve(root,'.'+decodeURIComponent(path));
    if(!file.startsWith(root+'/') && !file.startsWith(root+'\\') && file!==root){res.writeHead(404).end();return;}
    try {let data;try{data=await readFile(file);}catch{file=resolve(root,'index.html');data=await readFile(file);}
      res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(file)] || 'application/octet-stream');res.end(data);
    }catch{res.writeHead(500).end('Build the frontend first.');}
  }).listen(3100,'127.0.0.1',()=>console.log('Local frontend on 3100'));
} else {
  let token; const evidence=[];
  const req=async(path,method='GET',body,expected=200,auth=token)=>{
    const r=await fetch(apiBase+path,{method,headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+auth}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await r.json();assert.equal(r.status,expected,method+' '+path+' status');return data;
  };
  const state=async(n)=>{await fetch(fixture+'/state',{method:'POST',body:JSON.stringify({records:Array.from({length:n},(_,i)=>({id:i,email:'demo@example.test'}))})});};
  const alerts=async()=>await(await fetch(fixture+'/alerts')).json();
  const record=s=>{evidence.push(s);console.log('PASS '+s);};
  try {
    const email='alpha-'+randomUUID()+'@example.test',password=randomUUID();
    const u=await req('/auth/register','POST',{email,password}); token=u.token;
    assert((await req('/auth/login','POST',{email,password})).token);record('signup, login and authenticated account');
    await state(10);
    const c=await req('/checks','POST',{name:'Alpha rehearsal',connector_kind:'http_json',config:{url:fixture+'/records'},expectations:{min_new_records:1,required_fields:['email']},retry_before_alert:false,alert_channels:[{kind:'discord',target:fixture+'/alert'}]});
    const path='/checks/'+c.id;
    const hook=body=>req('/hook/'+c.webhook_secret,'POST',body);
    await req(path+'/channels/'+c.alert_channels[0].id+'/test','POST');assert.equal((await alerts()).length,1);assert.equal((await req(path+'/runs')).length,0);record('independent alert delivery through actual HTTP');
    await state(10);assert.match((await hook()).diff_message,/Baseline recorded/);assert.equal((await alerts()).length,0);
    await state(13);assert.equal((await hook({wrote:3})).verdict,'PASS');
    const fail=await hook({wrote:2});assert.equal(fail.verdict,'FAIL');assert.equal((await alerts()).length,1);
    await hook({wrote:2});assert.equal((await alerts()).length,1);record('baseline, positive growth, no-op failure and duplicate-alert suppression');
    await state(15);assert.equal((await hook({wrote:2})).verdict,'PASS');assert.match((await alerts())[0].content,/Recovered/);record('recovery alert');
    const share=await req(path+'/public','POST');const pub=await req('/public/checks/'+share.public_token);assert.equal(pub.last_verdict,'PASS');assert(!JSON.stringify(pub).includes(c.webhook_secret));assert(!JSON.stringify(pub).includes(fixture));
    await req(path+'/public','DELETE');await req('/public/checks/'+share.public_token,'GET',undefined,404);record('public sharing, redaction and revocation');
    await req(path+'/snooze','POST',{hours:1});await state(15);await hook({failed:true,error:'Synthetic failure'});assert.equal((await alerts()).length,0);await req(path+'/snooze','DELETE');record('snooze and explicit failure');
    await req(path,'PATCH',{config:{url:fixture+'/other-records'}});assert.match((await hook()).diff_message,/Baseline recorded/);record('destination edit resets baseline');
    const manual=await req(path+'/run','POST');
    for(let i=0;i<30;i++){if((await req(path+'/runs')).some(r=>r.id===manual.run_id))break;await new Promise(r=>setTimeout(r,200));}
    assert.equal((await req('/runs/'+manual.run_id)).trigger,'manual');record('manual queue completes');
    const queued=await req('/hook/'+c.webhook_secret+'?wait=0','POST',{failed:true,error:'Queued test'},202);
    const tick=await fetch(apiBase+'/internal/tick',{method:'POST',headers:{'x-tick-secret':process.env.ALPHA_TICK_SECRET || 'alpha-local-tick-only'}});assert.equal(tick.status,200);
    assert.equal((await req('/runs/'+queued.run_id)).reported_failure,true);record('queued webhook drained by scheduler');
    await req('/interest','POST',{plan:'pro'});record('pricing interest records without payment');
    await req(path,'DELETE');await req('/runs/'+fail.run_id,'GET',undefined,404);record('Check deletion removes runs');
  } finally {if(token){await req('/auth/me','DELETE');await req('/auth/me','GET',undefined,401);record('account cleanup and session revocation');}}
  console.log(JSON.stringify({passed:evidence.length,checks:evidence},null,2));
}
