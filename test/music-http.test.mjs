import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import http from 'node:http';
let child,base,production;
before(async()=>{
 const cwd=fileURLToPath(new URL('../',import.meta.url));
 child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd,stdio:['ignore','pipe','pipe']});
 const info=await new Promise((resolve,reject)=>{let out='',err='';const t=setTimeout(()=>reject(Error('server_timeout '+err)),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{resolve(JSON.parse(out.trim()));clearTimeout(t);}catch{}});child.on('exit',code=>{clearTimeout(t);reject(Error('server_exit '+code+' '+err));});});
 base=`http://127.0.0.1:${info.port}`;
});
after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}});
const post=(url,input)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});

let imageId,record,audioId;
const fixturePng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP4z8Dwn4GBgYGJAQoAHgQCAf2H6y0AAAAASUVORK5CYII=','base64');
const current=()=>fetch(base+`/api/media/productions/${production.id}/timeline`).then(r=>r.json());
test('Music Cut browser modules and styles are served by the actual gated parent server',async()=>{
 for(const [filename,type] of [['music-edit.mjs','text/javascript'],['music-room.js','text/javascript'],['edit-recovery.mjs','text/javascript'],['music-room.css','text/css']]){
  const r=await fetch(base+'/'+filename);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),type);assert.equal(await r.text(),await fs.readFile(new URL('../public/'+filename,import.meta.url),'utf8'));
 }
});
test('music test creates a production with an imported photograph and real PCM song',async()=>{
 const result=await(await post('/api/media/productions',{title:'Music command HTTP',fps:'24',width:320,height:180})).json();production=result.production;
 const r=await fetch(base+'/api/media/assets?name=still.png',{method:'POST',body:fixturePng,headers:{'content-type':'application/octet-stream'}});assert.equal(r.status,201);imageId=(await r.json()).id;
 const samples=4800,data=Buffer.alloc(samples*6),h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(data.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(288000,28);h.writeUInt16LE(6,32);h.writeUInt16LE(24,34);h.write('data',36);h.writeUInt32LE(data.length,40);
 const a=await fetch(base+'/api/media/assets?name=silence.wav',{method:'POST',body:Buffer.concat([h,data]),headers:{'content-type':'application/octet-stream'}});assert.equal(a.status,201);audioId=(await a.json()).id;
 record=await current();const timeline={...record.timeline,clips:[{id:'photo',assetId:imageId,sourceStart:'0',frames:96,fit:'contain'}],soundtrack:{assetId:audioId,tailPolicy:'pad-silence'}};
 const save=await fetch(base+`/api/media/productions/${production.id}/timeline`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:record.revision,timeline})});assert.equal(save.status,200);record=await save.json();
});
test('command endpoint splits picture as one saved revision and does not move the master',async()=>{
 const r=await post(`/api/media/productions/${production.id}/commands`,{baseRevision:record.revision,command:{type:'split',clipId:'photo',frame:37,newId:'right'}});assert.equal(r.status,200);record=await r.json();assert.deepEqual(record.timeline.clips.map(c=>c.frames),[37,59]);assert.equal(record.timeline.soundtrack.assetId,audioId);assert.equal(record.plan.frames,96);
});
test('stale or invalid commands do not mutate the saved cut',async()=>{
 const url=`/api/media/productions/${production.id}/commands`;
 assert.equal((await post(url,{baseRevision:record.revision-1,command:{type:'remove',clipId:'right'}})).status,409);
 assert.equal((await post(url,{baseRevision:record.revision,command:{type:'split',clipId:'right',frame:999,newId:'bad'}})).status,400);
 assert.equal((await post(url,{baseRevision:record.revision,command:{type:'execute-provider',url:'https://example.invalid'}})).status,400);
 assert.deepEqual((await current()).timeline,record.timeline);assert.equal((await current()).revision,record.revision);
});
test('song map and cues survive persistence, command undo, and redo',async()=>{
 let r=await post(`/api/media/productions/${production.id}/commands`,{baseRevision:record.revision,command:{type:'music',music:{schema:'shutter-music-map-v1',bpm:'96',beatsPerBar:3,beatUnit:4,offsetFrames:7}}});assert.equal(r.status,200);record=await r.json();
 r=await post(`/api/media/productions/${production.id}/commands`,{baseRevision:record.revision,command:{type:'marker-add',marker:{id:'chorus',frame:54,label:'First chorus',kind:'chorus'}}});assert.equal(r.status,200);record=await r.json();assert.equal(record.plan.markers[0].frame,54);
 r=await post(`/api/media/productions/${production.id}/timeline/undo`,{baseRevision:record.revision});assert.equal(r.status,200);const undone=await r.json();assert.equal(undone.timeline.markers?.length||0,0);
 r=await post(`/api/media/productions/${production.id}/timeline/redo`,{baseRevision:undone.revision});assert.equal(r.status,200);record=await r.json();assert.equal(record.timeline.markers[0].frame,54);assert.equal(record.timeline.music.bpm,'96/1');
});
test('explicit waveform POST caches bounded native stereo peaks and GET retrieves them',async()=>{
 const url=`/api/media/assets/${audioId}/waveform`;assert.equal((await fetch(base+url)).status,404);
 const r=await post(url,{});assert.equal(r.status,200);const wave=await r.json();assert.equal(wave.channels,2);assert.equal(wave.sampleFrames,4800);assert.equal(wave.sampleRate,48000);
 const cached=await(await fetch(base+url)).json();assert.deepEqual(cached,wave);assert.ok(cached.peaks.flat().every(x=>x===0));
});
test('foreign-origin requests still cannot execute edits or waveform analysis',async()=>{
 for(const url of [`/api/media/productions/${production.id}/commands`,`/api/media/assets/${audioId}/waveform`]){
  const r=await fetch(base+url,{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'});assert.equal(r.status,403);
 }
 assert.equal((await current()).revision,record.revision);
});
