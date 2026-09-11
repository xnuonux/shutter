import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {emptySoundStage,SOUND_POLICY} from '../public/sound-edit.mjs';
import {pcm24,fixturePng} from './helpers/sound-fixtures.mjs';
let child,base,production,record,audioId;
before(async()=>{
 child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']});
 const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error('server_timeout '+err)),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{resolve(JSON.parse(out.trim()));clearTimeout(timer);}catch{}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server_exit '+code+' '+err));});});base=`http://127.0.0.1:${info.port}`;
});
after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}});
const post=(url,input)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
const current=()=>fetch(base+`/api/media/productions/${production.id}/timeline`).then(r=>r.json());
const command=cmd=>post(`/api/media/productions/${production.id}/commands`,{baseRevision:record.revision,command:cmd});
test('Sound Stage modules and styles are served as exact source bytes behind the parent gate',async()=>{for(const [name,type]of [['sound-edit.mjs','text/javascript'],['sound-room.js','text/javascript'],['sound-room.css','text/css']]){const r=await fetch(base+'/'+name);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),type);assert.equal(await r.text(),await fs.readFile(new URL('../public/'+name,import.meta.url),'utf8'));}});
test('setup uses streamed local imports and the real SQLite production routes',async()=>{
 let r=await post('/api/media/productions',{title:'Sound API fixture',fps:'24000/1001',width:160,height:90});assert.equal(r.status,201);production=(await r.json()).production;
 async function asset(name,bytes){const r=await fetch(base+'/api/media/assets?name='+name,{method:'POST',headers:{'content-type':'application/octet-stream'},body:bytes});assert.equal(r.status,201);return (await r.json()).id;}
 const imageId=await asset('test.png',fixturePng);audioId=await asset('audio.wav',pcm24(4800,(_i,c)=>c?-1048576:1048576));record=await current();
 const timeline={...record.timeline,clips:[{id:'shot',assetId:imageId,sourceStart:'0',frames:8,fit:'contain'}],soundtrack:{assetId:audioId,tailPolicy:'pad-silence'}};
 r=await fetch(base+`/api/media/productions/${production.id}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:record.revision,timeline})});assert.equal(r.status,200);record=await r.json();
});
test('enable, add a lane and place audio as revisioned commands',async()=>{
 for(const cmd of [{type:'sound-enable'},{type:'sound-track-add',track:{id:'fx',name:'Effects',role:'effects',gainDb:0,mute:false,solo:false,clips:[]}},{type:'sound-clip-add',trackId:'fx',clip:{id:'audio',assetId:audioId,streamIndex:0,atSample:801,sourceInSample:0,samples:4000,gainDb:-6,fadeInSamples:100,fadeOutSamples:100}}]){const r=await command(cmd);assert.equal(r.status,200);record=await r.json();}
 assert.equal(record.timeline.audioPolicy,SOUND_POLICY);assert.equal(record.plan.soundStage.tracks[0].clips[0].atSample,801);assert.equal(record.timeline.soundtrack.assetId,audioId);
});
test('stale and malformed sound commands fail atomically',async()=>{
 const old=structuredClone(record);let r=await post(`/api/media/productions/${production.id}/commands`,{baseRevision:record.revision-1,command:{type:'sound-output',gainDb:-6}});assert.equal(r.status,409);
 r=await command({type:'sound-clip-update',trackId:'fx',clipId:'audio',patch:{sourceInSample:4700}});assert.equal(r.status,400);assert.match((await r.json()).error,/sound_source_range/);
 r=await command({type:'sound-clip-add',trackId:'fx',clip:{id:'bad',assetId:'https://bad.invalid'}});assert.equal(r.status,400);assert.deepEqual((await current()).timeline,old.timeline);assert.equal((await current()).revision,old.revision);
});
test('listening mix is explicit and stores evidence without advancing edit revision',async()=>{
 const url=`/api/media/productions/${production.id}/listening-mix`;let r=await post(url,{baseRevision:record.revision-1});assert.equal(r.status,409);
 r=await post(url,{baseRevision:record.revision});assert.equal(r.status,201);const mix=await r.json();assert.equal(mix.revision,record.revision);assert.equal(mix.report.samples,16016);assert.equal(mix.report.overloadSamples,0);assert.equal((await current()).revision,record.revision);
 const state=await(await fetch(base+'/api/media/state')).json();assert.ok(state.listeningMixes.some(m=>m.id===mix.id));assert.ok(state.assets.some(a=>a.id===mix.assetId&&a.kind==='audio'));
});
test('clipping returns a structured gain suggestion and never publishes a partial mix',async()=>{
 for(const cmd of [{type:'sound-track-update',trackId:'fx',patch:{gainDb:12}},{type:'sound-clip-update',trackId:'fx',clipId:'audio',patch:{gainDb:12}}]){const r=await command(cmd);assert.equal(r.status,200);record=await r.json();}
 const old=await(await fetch(base+'/api/media/state')).json(),r=await post(`/api/media/productions/${production.id}/listening-mix`,{baseRevision:record.revision});assert.equal(r.status,400);const body=await r.json();assert.equal(body.error,'sound_mix_clipping');assert.ok(body.details.overloadSamples>0);assert.ok(body.details.suggestedOutputGainDb<0);assert.equal(body.details.limiter,false);
 const next=await(await fetch(base+'/api/media/state')).json();assert.equal(next.listeningMixes.length,old.listeningMixes.length);assert.equal(next.assets.length,old.assets.length);
});
test('saved undo and redo retain sound and preserve fixed song placement',async()=>{
 let r=await post(`/api/media/productions/${production.id}/timeline/undo`,{baseRevision:record.revision});assert.equal(r.status,200);const undone=await r.json();assert.equal(undone.timeline.soundStage.tracks[0].clips[0].gainDb,-6);
 r=await post(`/api/media/productions/${production.id}/timeline/redo`,{baseRevision:undone.revision});assert.equal(r.status,200);record=await r.json();assert.equal(record.timeline.soundStage.tracks[0].clips[0].gainDb,12);assert.equal(record.timeline.soundtrack.assetId,audioId);
});
test('foreign-origin sound mix or edit requests remain blocked before processing',async()=>{for(const suffix of ['commands','listening-mix']){const r=await fetch(base+`/api/media/productions/${production.id}/${suffix}`,{method:'POST',headers:{origin:'https://foreign.invalid','content-type':'application/json'},body:JSON.stringify({baseRevision:record.revision})});assert.equal(r.status,403);}assert.equal((await current()).revision,record.revision);});
