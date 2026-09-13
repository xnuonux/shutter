import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {byteRange} from '../src/media-stream.mjs';
import {assetRecordKey} from '../src/media-recovery.mjs';
import {Studio} from '../src/store.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
let child,base,root,studio,asset,record,project,bytes;
for(const [header,size,expected] of [
 ['bytes=0-0',100,{status:206,start:0,end:0}],['bytes=90-',100,{status:206,start:90,end:99}],['bytes=-10',100,{status:206,start:90,end:99}],
 ['bytes=-999',100,{status:206,start:0,end:99}],['bytes=90-999999999999999999999',100,{status:206,start:90,end:99}],
 ['bytes=100-',100,{status:416}],['bytes=-0',100,{status:416}],['bytes=999999999999999999999-',100,{status:416}],
 ['bytes=8-2',100,{status:200,start:0,end:99}],['items=1-2',100,{status:200,start:0,end:99}],['bytes=0-1,5-6',100,{status:200,start:0,end:99}],
 ['bytes=-',100,{status:200,start:0,end:99}],['bytes=0-',0,{status:416}],['bytes=-2',0,{status:416}],
])test(`single range ${header} for ${size} bytes`,()=>assert.deepEqual(byteRange(header,size),expected));
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-recovery-http-'));bytes=pcm24(4800,(i,c)=>i*(c+1));
 child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,SHUTTER_TEST_ROOT:root},stdio:['ignore','pipe','pipe']});
 const info=await new Promise((resolve,reject)=>{let output='',error='';const timer=setTimeout(()=>reject(Error(error||'server_timeout')),10000);child.stderr.on('data',b=>error+=b);child.stdout.on('data',b=>{output+=b;try{const parsed=JSON.parse(output.trim());clearTimeout(timer);resolve(parsed);}catch{}});child.on('exit',c=>{clearTimeout(timer);reject(Error('server_exit '+c+' '+error));});});
 base='http://127.0.0.1:'+info.port;studio=new Studio(root);
 asset=await(await fetch(base+'/api/media/assets?name=Master.wav',{method:'POST',body:bytes})).json();
 const made=await post('/api/media/productions',{title:'HTTP restoration',fps:'24',width:320,height:180});const data=await made.json();project=data.production.id;
 const edit=data.timeline.timeline;edit.soundtrack={assetId:asset.id,tailPolicy:'pad-silence'};
 record=await(await post(`/api/media/productions/${project}/timeline`,{baseRevision:1,timeline:edit},'PUT')).json();
});
after(async()=>{studio?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await fs.rm(root,{recursive:true,force:true});});
function post(url,input,method='POST',headers={}){return fetch(base+url,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});}
const url=()=>base+'/media/'+asset.id;
test('ordinary GET returns identical original bytes',async()=>{const r=await fetch(url());assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal(r.headers.get('accept-ranges'),'bytes');});
test('HEAD supplies full length and no body, ignoring Range',async()=>{const r=await fetch(url(),{method:'HEAD',headers:{range:'bytes=0-9'}});assert.equal(r.status,200);assert.equal(r.headers.get('content-length'),String(bytes.length));assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(r.headers.get('content-range'),null);});
test('suffix request returns the actual final bytes',async()=>{const r=await fetch(url(),{headers:{range:'bytes=-31'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${bytes.length-31}-${bytes.length-1}/${bytes.length}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(-31));});
test('open-ended request returns exactly the requested remainder',async()=>{const r=await fetch(url(),{headers:{range:'bytes=33-'}});assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(33));});
test('oversized end is clamped without unsafe integer coercion',async()=>{const r=await fetch(url(),{headers:{range:'bytes=42-999999999999999999'}});assert.equal(r.status,206);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(42));});
test('range reassembly produces the exact original digest material',async()=>{const chunks=[];for(let i=0;i<bytes.length;i+=997){const r=await fetch(url(),{headers:{range:`bytes=${i}-${Math.min(i+996,bytes.length-1)}`}});assert.equal(r.status,206);chunks.push(Buffer.from(await r.arrayBuffer()));}assert.deepEqual(Buffer.concat(chunks),bytes);});
test('unsatisfiable range supplies 416 and complete resource length',async()=>{const r=await fetch(url(),{headers:{range:`bytes=${bytes.length}-`}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),`bytes */${bytes.length}`);assert.equal((await r.arrayBuffer()).byteLength,0);});
test('unsupported multipart, malformed and If-Range requests safely return whole file',async()=>{for(const headers of [{range:'bytes=1-2,5-6'},{range:'what'},{range:'bytes=0-5','if-range':'"not-validated"'}]){const r=await fetch(url(),{headers});assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);}});
test('health APIs serve through unchanged same-origin gates',async()=>{const r=await post(`/api/media/productions/${project}/media-health`,{baseRevision:record.revision});assert.equal(r.status,201);const h=await r.json();assert.equal(h.counts.verified,1);assert.equal(h.revision,record.revision);
 assert.equal((await post(`/api/media/productions/${project}/media-health`,{baseRevision:record.revision},'POST',{origin:'https://elsewhere.invalid'})).status,403);
 assert.equal((await fetch(url(),{method:'HEAD',headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('static health module is reachable and the main workspace includes it',async()=>{assert.equal((await fetch(base+'/media-health-room.js')).status,200);assert.equal((await fetch(base+'/media-health-room.css')).status,200);assert.ok((await(await fetch(base+'/media-studio')).text()).includes('id="media-health-room"'));});
test('missing file is a controlled 404, scan identifies it, wrong restore fails, exact restore succeeds',async()=>{
 const file=studio.assetPath(asset.id),before=JSON.stringify(studio.read('timeline_'+project));await fs.unlink(file);
 let r=await fetch(url());assert.equal(r.status,404);assert.equal((await r.json()).error,'media_file_missing');
 const h=await(await post(`/api/media/productions/${project}/media-health`,{baseRevision:record.revision})).json();assert.equal(h.counts.missing,1);
 const restoreUrl=`${base}/api/media/assets/${asset.id}/restore?recordKey=${h.assets[0].recordKey}`,wrong=Buffer.from(bytes);wrong[50]^=7;
 r=await fetch(restoreUrl,{method:'POST',body:wrong});assert.equal(r.status,400);assert.equal((await r.json()).error,'media_restore_hash_mismatch');
 r=await fetch(restoreUrl,{method:'POST',body:bytes});assert.equal(r.status,201);assert.equal((await r.json()).status,'restored');
 assert.equal(JSON.stringify(studio.read('timeline_'+project)),before);assert.deepEqual(Buffer.from(await(await fetch(url())).arrayBuffer()),bytes);
});
test('stale record key and foreign-origin restore are rejected',async()=>{
 let r=await fetch(`${base}/api/media/assets/${asset.id}/restore?recordKey=old`,{method:'POST',body:bytes});assert.equal(r.status,409);
 r=await fetch(`${base}/api/media/assets/${asset.id}/restore?recordKey=${assetRecordKey(asset)}`,{method:'POST',headers:{origin:'https://elsewhere.invalid'},body:bytes});assert.equal(r.status,403);
});
test('file length mismatch produces a controlled error rather than byte leakage',async()=>{
 const file=studio.assetPath(asset.id);try{await fs.truncate(file,20);assert.equal((await fetch(url())).status,409);}finally{await fs.writeFile(file,bytes);}
});
test('a symlink produces a controlled error rather than byte leakage',async t=>{
 const file=studio.assetPath(asset.id),outside=path.join(root,'outside.wav');
 await fs.writeFile(outside,bytes);await fs.unlink(file);
 try{try{await fs.symlink(outside,file);}catch(e){if(e.code==='EPERM'){t.skip('File symlinks require an OS privilege unavailable on this host');return;}throw e;}assert.equal((await fetch(url())).status,409);}
 finally{await fs.rm(file,{force:true});await fs.writeFile(file,bytes);}
});
test('client cancelling a range does not crash the server or poison following requests',async()=>{
 const abort=new AbortController(),response=await fetch(url(),{headers:{range:'bytes=0-'},signal:abort.signal});abort.abort();try{await response.arrayBuffer();}catch{}
 const next=await fetch(url(),{headers:{range:'bytes=0-0'}});assert.equal(next.status,206);assert.deepEqual(Buffer.from(await next.arrayBuffer()),bytes.subarray(0,1));
});
