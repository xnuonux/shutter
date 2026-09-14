import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {watch} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {Studio} from '../src/store.mjs';
import {runMedia,importMediaFile,fileDigest} from '../src/media-io.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {renderMediaEdit} from '../src/media-edit.mjs';
import {reviewScene,readSceneReviewFile} from '../src/scene-review.mjs';
import {emptyTextLayer} from '../public/text-edit.mjs';
import {emptySoundStage,SOUND_POLICY,samplesAtFrame} from '../public/sound-edit.mjs';
import {pcm24,fixturePng} from './helpers/sound-fixtures.mjs';

let root,studio,server,bridge,base,main,angle,still,sound,sequence=0;const pending=new Map();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('mcp_timeout'));},60000);pending.set(id,r=>{clearTimeout(timer);resolve(r);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function json(response,status=200){const r=await response,v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
const request=(id,input)=>fetch(`${base}/api/media/productions/${id}/review`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
async function production({fps='24',audio=true,image=false}={}){
  const {production:p,timeline:r}=createMediaProduction(studio,{title:'Scene review fixture',fps,width:320,height:180});
  const edit={...r.timeline,clips:[{id:'main',assetId:image?still.id:main.id,sourceStart:'0',frames:48,fit:'contain'}],
    ...(!image?{coverage:[{id:'angle',assetId:angle.id,sourceStart:'1/10',at:18,frames:12,fit:'contain'}]}:{}),
    textLayer:{...emptyTextLayer(),captionDelivery:'burn-and-sidecar',cues:[{id:'caption',kind:'caption',text:'Hold the orb',startFrame:20,endFrame:25}]}};
  if(audio)Object.assign(edit,{soundtrack:{assetId:sound.id,tailPolicy:'pad-silence'},audioPolicy:SOUND_POLICY,soundStage:{...emptySoundStage(),outputGainDb:-6,tracks:[{id:'rain',name:'Texture',role:'effects',gainDb:-3,mute:false,solo:false,clips:[{id:'fade',assetId:sound.id,streamIndex:0,atSample:1000,sourceInSample:200,samples:70000,gainDb:-6,fadeInSamples:35000,fadeOutSamples:35000}]}]}});
  const record=studio.saveTimeline(p.id,1,edit);return {id:p.id,record};
}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-scene-review-'));const data=path.join(root,'studio');
  server=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{env:{...process.env,SHUTTER_TEST_ROOT:data},stdio:['ignore','pipe','pipe'],windowsHide:true});
  const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'server_timeout')),10000);server.stderr.on('data',b=>err+=b);server.stdout.on('data',b=>{out+=b;try{const v=JSON.parse(out.trim());clearTimeout(timer);resolve(v);}catch{}});});
  base=`http://127.0.0.1:${info.port}`;studio=new Studio(data);
  for(const [name,filter] of [['main','testsrc2=s=320x180:r=30:d=3'],['angle','color=teal:s=320x180:r=30:d=3']]){const f=path.join(root,name+'.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',filter,'-c:v','libx264','-threads','1',f]);const a=await importMediaFile(studio,f,{name:name+'.mp4'});if(name==='main')main=a;else angle=a;}
  const wav=path.join(root,'master.wav');await fs.writeFile(wav,pcm24(71000,(i,c)=>(c?-1:1)*(300000+i%179*700)));sound=await importMediaFile(studio,wav,{name:'Master.wav'});
  const png=path.join(root,'still.png');await fs.writeFile(png,fixturePng);still=await importMediaFile(studio,png,{name:'still.png'});
  bridge=spawn(process.execPath,['src/mcp.mjs'],{env:{...process.env,SHUTTER_URL:base},stdio:['pipe','pipe','pipe'],windowsHide:true});
  createInterface({input:bridge.stdout}).on('line',line=>{const r=JSON.parse(line);pending.get(r.id)?.(r);pending.delete(r.id);});await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'scene-review-test',version:'1'}});
});
after(async()=>{if(bridge?.exitCode===null){bridge.kill();await once(bridge,'exit');}studio?.close();if(server?.exitCode===null){server.kill();await once(server,'exit');}if(root)await fs.rm(root,{recursive:true,force:true});});
async function rawVideo(file,name){const out=path.join(root,name+'.rgb');await runMedia('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-pix_fmt','rgb24','-f','rawvideo','-threads','1',out]);return fs.readFile(out);}
async function rawAudio(file,name){const out=path.join(root,name+'.pcm');await runMedia('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-c:a','pcm_s24le','-f','s24le',out]);return fs.readFile(out);}
test('actual HTTP and MCP review the same saved coverage, text and exact sound interval as the full export',async()=>{
  const f=await production(),input={baseRevision:2,startFrame:12,endFrame:42,frameCount:8},before=studio.getTimeline(f.id),counts=['asset','cut','job','moment'].map(k=>studio.list(k).length);
  const manifest=await json(request(f.id,input));assert.equal(manifest.preview.frames,30);assert.equal(manifest.preview.audio,'mixed');assert.equal(manifest.planHash,before.plan.hash);assert.deepEqual(manifest.selections.map(c=>[c.at,c.frames,c.layer||'main']),[[12,6,'main'],[18,12,'coverage'],[30,12,'main']]);
  assert.deepEqual(studio.getTimeline(f.id),before);assert.deepEqual(['asset','cut','job','moment'].map(k=>studio.list(k).length),counts);
  const result=(await rpc('tools/call',{name:'shutter_review_scene',arguments:{projectId:f.id,...input,includeAudio:true}})).result;
  assert.equal(result.isError,undefined,JSON.stringify(result));assert.equal(result.structuredContent.cached,true);assert.equal(result.content.filter(c=>c.type==='image').length,8);assert.equal(result.content.filter(c=>c.type==='audio').length,1);
  for(const [i,b] of result.content.filter(c=>c.type==='image').entries())assert.equal(hash(Buffer.from(b.data,'base64')),manifest.frames[i].sha256);
  assert.equal(hash(Buffer.from(result.content.find(c=>c.type==='audio').data,'base64')),manifest.audio.sha256);
  const preview=path.join(root,'review.mp4');await fs.writeFile(preview,await readSceneReviewFile(studio,f.id,manifest.id,'preview'));
  const full=await renderMediaEdit(studio,f.id,{baseRevision:2,acknowledgeUnmanagedColor:true}),reviewPixels=await rawVideo(preview,'review'),fullPixels=await rawVideo(studio.assetPath(full.output),'full'),area=320*180*3;
  assert.equal(reviewPixels.length,30*area);let error=0;for(let i=0;i<reviewPixels.length;i++)error+=Math.abs(reviewPixels[i]-fullPixels[i+12*area]);assert.ok(error/reviewPixels.length<3,`full/interval pixel mean difference ${error/reviewPixels.length}`);
  for(let frame=6;frame<18;frame++){let white=0;for(let pixel=frame*area;pixel<(frame+1)*area;pixel+=3)if(reviewPixels[pixel]>170&&reviewPixels[pixel+1]>170&&reviewPixels[pixel+2]>170)white++;assert.equal(white>3,frame>=8&&frame<13,`caption presence at scene frame ${frame+12}: ${white} bright pixels`);}
  const wave=path.join(root,'review.wav');await fs.writeFile(wave,await readSceneReviewFile(studio,f.id,manifest.id,'wave'));
  const whole=await rawAudio(path.join(studio.root,'media-renders',full.bridgeFolder,'mix-48k.wav'),'whole'),part=await rawAudio(wave,'part');
  assert.deepEqual(part,whole.subarray(12*2000*6,42*2000*6));assert.equal(manifest.audio.samples,30*2000);
  for(const url of [manifest.preview.url,manifest.audio.url,manifest.audio.waveUrl]){const range=await fetch(base+url,{headers:{range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);assert.match(range.headers.get('content-range'),/^bytes 0-99\//);assert.equal((await fetch(base+url,{headers:{range:'bytes=999999999-'}})).status,416);assert.equal((await fetch(base+url,{method:'HEAD'})).status,200);}
  assert.equal((await fetch(base+manifest.preview.url.replace(f.id,'prod_foreign'))).status,404);
  const cached=studio.read(manifest.id,'scene-review');assert.deepEqual((await fs.readdir(path.join(studio.root,'scene-reviews',cached.folder))).sort(),['audio.mp3','mix-48k.wav','preview.mp4',...Array.from({length:8},(_,i)=>`frame-${i}.jpg`)].sort());
});
test('fractional scene clock, repeated stills and absent sound remain explicit',async()=>{
  const f=await production({fps:'24000/1001',audio:false,image:true}),m=await json(request(f.id,{baseRevision:2,startFrame:19,endFrame:27,frameCount:12}));
  assert.equal(m.fps,'24000/1001');assert.equal(m.preview.audio,'none');assert.equal(m.audio,undefined);assert.equal(m.frames.length,8);assert.equal(m.frames[0].sceneTime,'19019/24000');assert.equal(m.frames.at(-1).sceneFrame,26);assert.equal(m.selections[0].sourceStart,'0/1');
  const noImages=(await rpc('tools/call',{name:'shutter_review_scene',arguments:{projectId:f.id,baseRevision:2,startFrame:19,endFrame:27,frameCount:12,includeImages:false}})).result;assert.equal(noImages.isError,undefined);assert.equal(noImages.content.length,1);
  assert.equal((await fetch(base+`/api/media/productions/${f.id}/reviews/${m.id}/audio`)).status,404);
});
test('bad ranges, corrupt cache, changed saved context and cancellation cannot publish a stale review',async()=>{
  const f=await production({audio:false}),input={baseRevision:2,startFrame:0,endFrame:12,frameCount:2};
  for(const patch of [{startFrame:12},{endFrame:60},{startFrame:-1},{baseRevision:1},{frameCount:13},{extra:true}])await json(request(f.id,{...input,...patch}),patch.baseRevision?409:400);
  const m=await json(request(f.id,input)),cache=studio.read(m.id,'scene-review'),file=path.join(studio.root,'scene-reviews',cache.folder,'frame-0.jpg');await fs.writeFile(file,'bad');
  await assert.rejects(readSceneReviewFile(studio,f.id,m.id,0),/cache_integrity/);assert.equal((await json(request(f.id,input))).cached,false);
  const other={...input,startFrame:2,endFrame:14},rootCache=path.join(studio.root,'scene-reviews');let changed=false;
  const watcher=watch(rootCache,()=>{if(changed)return;changed=true;studio.saveTimeline(f.id,2,{...f.record.timeline,title:'Changed while rendering'});});
  try{await assert.rejects(reviewScene(studio,f.id,other),/revision_conflict|context_conflict/);}finally{watcher.close();}
  assert.equal(changed,true);assert.equal(studio.list('scene-review').filter(r=>r.projectId===f.id).length,1);
  const abort=new AbortController();abort.abort();await assert.rejects(reviewScene(studio,f.id,{...other,baseRevision:3},{signal:abort.signal}),/cancelled/);
  const folders=await fs.readdir(rootCache),liveAbort=new AbortController(),active=watch(rootCache,()=>liveAbort.abort());
  try{await assert.rejects(reviewScene(studio,f.id,{...other,baseRevision:3},{signal:liveAbort.signal}),/cancelled/);}finally{active.close();}
  assert.deepEqual(await fs.readdir(rootCache),folders);
  const original=await fs.readFile(studio.assetPath(main.id));await fs.writeFile(studio.assetPath(main.id),Buffer.from('corrupt source'));
  try{await assert.rejects(reviewScene(studio,f.id,{...other,baseRevision:3}),/integrity|hash|source/);}finally{await fs.writeFile(studio.assetPath(main.id),original);}
});
test('master-only fractional audio uses separately rounded global boundaries and large pictures downscale',async()=>{
  const f=await production({fps:'30000/1001',audio:false,image:true}),record=studio.saveTimeline(f.id,2,{...f.record.timeline,width:1600,height:900,soundtrack:{assetId:sound.id,tailPolicy:'pad-silence'}});
  const m=await json(request(f.id,{baseRevision:3,startFrame:1,endFrame:4,frameCount:3}));
  assert.equal(m.preview.width,1280);assert.equal(m.preview.height,720);assert.equal(m.audio.startSample,1602);assert.equal(m.audio.endSample,6406);assert.equal(m.audio.samples,4804);
  const wave=path.join(root,'fractional.wav');await fs.writeFile(wave,await readSceneReviewFile(studio,f.id,m.id,'wave'));
  const pcm=await rawAudio(wave,'fractional'),original=await fs.readFile(studio.assetPath(sound.id));assert.deepEqual(pcm,original.subarray(44+1602*6,44+6406*6));
  studio.saveTimeline(f.id,3,{...record.timeline,fps:'1',textLayer:null});await json(request(f.id,{baseRevision:4,startFrame:0,endFrame:31}),400);
});
