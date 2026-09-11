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
test('actual parent server serves new studio after its local-origin gates',async()=>{const r=await fetch(base+'/media-studio');assert.equal(r.status,200);assert.match(await r.text(),/Your footage/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);});
test('foreign Origin and cross-site fetch cannot create productions',async()=>{
 for(const headers of [{'origin':'https://attacker.invalid'},{'sec-fetch-site':'cross-site'},{host:'attacker.invalid'}]) {
  const status=await new Promise((resolve,reject)=>{const req=http.request(base+'/api/media/productions',{method:'POST',headers:{...headers,'content-type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{"title":"bad"}');});
  assert.equal(status,403,JSON.stringify(headers));
 }
});
test('failed creation rolls back both production and timeline',async()=>{const r=await post('/api/media/productions',{title:'bad',width:17});assert.equal(r.status,400);const state=await(await fetch(base+'/api/media/state')).json();assert.equal(state.productions.length,0);assert.equal(state.timelines.length,0);});
test('production and shared timeline are created atomically',async()=>{const r=await post('/api/media/productions',{title:'Camera + WAV',width:640,height:360});assert.equal(r.status,201);const data=await r.json();production=data.production;assert.equal(data.timeline.revision,1);assert.equal(data.timeline.timeline.format,'shutter-media-edit-v1');});
test('legacy export path refuses new schema without bypassing consent',async()=>{const r=await post(`/api/productions/${production.id}/export-video`,{});assert.equal(r.status,409);assert.match((await r.json()).error,/explicit saved revision/);});
test('new media save rejects stale revisions',async()=>{const url=`/api/media/productions/${production.id}/timeline`;const r=await(await fetch(base+url)).json();const response=await fetch(base+url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:0,timeline:r.timeline})});assert.equal(response.status,409);});
test('streamed WAV larger than legacy 32 MiB limit imports and serves ranges',async()=>{
 const size=36*1024*1024;const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(size+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(288000,28);h.writeUInt16LE(6,32);h.writeUInt16LE(24,34);h.write('data',36);h.writeUInt32LE(size,40);
 async function* bytes(){yield h;const block=Buffer.alloc(65536);for(let i=0;i<size/65536;i++)yield block;}
 const r=await fetch(base+'/api/media/assets?name=large-master.wav',{method:'POST',body:Readable.from(bytes()),duplex:'half',headers:{'content-type':'application/octet-stream'}});assert.equal(r.status,201);const asset=await r.json();assert.equal(asset.bytes,size+44);assert.equal(asset.kind,'audio');assert.equal(asset.media.audio[0].bits,24);
 const media=await fetch(base+'/media/'+asset.id,{headers:{range:'bytes=0-43'}});assert.equal(media.status,206);assert.equal(Number(media.headers.get('content-length')),44);assert.deepEqual(Buffer.from(await media.arrayBuffer()),h);
});
test('production export remains accessible with new timeline schema',async()=>{const r=await fetch(base+'/api/export/'+production.id);assert.equal(r.status,200);assert.equal((await r.json()).timeline.timeline.format,'shutter-media-edit-v1');});
test('unknown file and traversal-like handoff requests are refused',async()=>{for(const suffix of ['missing/files/secret.txt','missing/files/%2e%2e%2fstudio.sqlite']){const r=await fetch(base+'/api/media/cuts/'+suffix);assert.equal(r.status,404);}});
