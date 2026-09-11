import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {pcm24,fixturePng} from './helpers/sound-fixtures.mjs';
let child,base,production,cut,report;
before(async()=>{
 child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error('server_timeout '+err)),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{resolve(JSON.parse(out.trim()));clearTimeout(timer);}catch{}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server_exit '+code+' '+err));});});base=`http://127.0.0.1:${info.port}`;
});
after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}});
const post=(url,input)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
test('delivery UI and shared contract are served as the exact source files',async()=>{
 for(const [name,type]of [['delivery-contract.mjs','text/javascript'],['delivery-room.js','text/javascript'],['delivery-room.css','text/css']]){const r=await fetch(base+'/'+name);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),type);assert.equal(await r.text(),await fs.readFile(new URL('../public/'+name,import.meta.url),'utf8'));}
});
test('setup uses actual import, save and export HTTP routes with synthetic material',async()=>{
 let r=await post('/api/media/productions',{title:'Delivery HTTP fixture',fps:'24',width:160,height:90});assert.equal(r.status,201);const created=await r.json();production=created.production;
 async function asset(name,bytes){const r=await fetch(base+'/api/media/assets?name='+name,{method:'POST',headers:{'content-type':'application/octet-stream'},body:bytes});assert.equal(r.status,201);return(await r.json()).id;}
 const image=await asset('black.png',fixturePng),audio=await asset('audio.wav',pcm24(48000,i=>Math.round(200000*Math.sin(2*Math.PI*997*i/48000))));
 const timeline={...created.timeline.timeline,clips:[{id:'still',assetId:image,sourceStart:'0',frames:48,fit:'contain'}],soundtrack:{assetId:audio,tailPolicy:'pad-silence'}};
 r=await fetch(base+`/api/media/productions/${production.id}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:created.timeline.revision,timeline})});assert.equal(r.status,200);const record=await r.json();
 r=await post(`/api/media/productions/${production.id}/render`,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});assert.equal(r.status,200);cut=await r.json();
});
test('inspection requires an explicit POST; GET alone does no analysis',async()=>{
 const url=`/api/media/cuts/${cut.id}/check`;let r=await fetch(base+url);assert.deepEqual(await r.json(),[]);
 r=await post(url,{scanPicture:true});assert.equal(r.status,201);report=await r.json();assert.equal(report.cutId,cut.id);assert.equal(report.readOnly,true);assert.equal(report.audio.encoded.status,'measured');
 r=await fetch(base+url);assert.deepEqual((await r.json()).map(r=>r.id),[report.id]);
});
test('historical JSON report has no-store semantics and does not alter edit revision',async()=>{
 const r=await fetch(base+`/api/media/checks/${report.id}`);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),report);
 const current=await(await fetch(base+`/api/media/productions/${production.id}/timeline`)).json();assert.equal(current.revision,cut.revision);
 const state=await(await fetch(base+'/api/media/state')).json();assert.ok(state.deliveryChecks.some(c=>c.id===report.id));
});
test('untrusted paths, URLs, bad targets and wrong record kinds are rejected',async()=>{
 for(const input of [{file:'/etc/passwd'},{url:'https://example.invalid/media'},{targetLufs:'-14'},{scanPicture:'false'}]){const r=await post(`/api/media/cuts/${cut.id}/check`,input);assert.equal(r.status,400);}
 const r=await post(`/api/media/cuts/${production.id}/check`,{});assert.equal(r.status,404);
 assert.equal((await(await fetch(base+`/api/media/cuts/${cut.id}/check`)).json()).length,1);
});
test('foreign origin and Host requests cannot trigger analysis or read reports',async()=>{
 for(const [url,method]of [[`/api/media/cuts/${cut.id}/check`,'POST'],[`/api/media/checks/${report.id}`,'GET']]){
  const r=await fetch(base+url,{method,headers:{origin:'https://foreign.invalid'},...(method==='POST'?{body:'{}'}:{})});assert.equal(r.status,403);
 }
 // Node fetch may replace a caller-supplied Host; send an actual raw HTTP header.
 const status=await new Promise((resolve,reject)=>{
  const req=http.get(base+`/api/media/checks/${report.id}`,{headers:{host:'foreign.invalid'}},res=>{res.resume();resolve(res.statusCode);});
  req.on('error',reject);
 });assert.equal(status,403);
});
