import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {watch} from 'node:fs';
import {runMedia} from '../src/media-io.mjs';
import {Studio} from '../src/store.mjs';
import {saveShotDirection,proposeShots} from '../src/shot-direction.mjs';
import {saveMoment,deleteMoment} from '../src/production-memory.mjs';
import {previewActions} from '../src/director-actions.mjs';
import {inspectCutaway} from '../src/director-evidence.mjs';

let child,base,root,studio,original,alternate;
const version='shutter-actions-v1';
const request=(url,input,method='POST')=>fetch(base+url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(input)});
async function json(response,status=200){const r=await response,data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-evidence-'));
  child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe'],windowsHide:true});
  const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'server_timeout')),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{const value=JSON.parse(out.trim());clearTimeout(timer);resolve(value);}catch{}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server_exit '+code+' '+err));});});
  base=`http://127.0.0.1:${info.port}`;studio=new Studio(info.root);
  for(const [name,rate,offset] of [['original',24,0],['alternate',30,1]]){
    const file=path.join(root,name+'.mp4');
    await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`nullsrc=s=160x90:r=${rate}:d=4,geq=lum='16+mod(N+${offset},4)*50':cb=128:cr=128`,'-c:v','libx264','-threads','1',file]);
    const asset=await json(fetch(base+'/api/media/assets?name='+name+'.mp4',{method:'POST',body:await fs.readFile(file)}),201);if(name==='original')original=asset;else alternate=asset;
  }
});
after(async()=>{studio?.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}if(root)await fs.rm(root,{recursive:true,force:true});});
async function fixture(coverage={}){
  const made=await json(request('/api/media/productions',{title:'Evidence fixture',fps:'24',width:160,height:90}),201),id=made.production.id;
  const timeline={...made.timeline.timeline,clips:[{id:'first',assetId:original.id,sourceStart:'0',frames:48,fit:'contain'},{id:'second',assetId:original.id,sourceStart:'2',frames:48,fit:'cover'}]};
  const record=await json(request(`/api/media/productions/${id}/timeline`,{baseRevision:1,timeline},'PUT'));
  saveShotDirection(studio,id,'first',{baseRevision:0,brief:{goal:'Keep the orb moving.',continuity:['Sol holds the orb.'],query:''}});
  const commands=[{type:'coverage-add',coverage:{id:'angle',assetId:alternate.id,sourceStart:'3/2',at:36,frames:24,fit:'contain',...coverage}}];
  const input={version,baseRevision:record.revision,commands},url=`/api/media/productions/${id}/actions`,preview=await json(request(url+'/preview',input));
  return {id,url,record,input:{...input,previewHash:preview.previewHash,coverageId:'angle'},preview};
}
const inspect=(f,extra={})=>request(f.url+'/evidence',{...f.input,...extra});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
test('real HTTP evidence binds authored intent and six exact frame positions without editing or submitting jobs',async()=>{
  const f=await fixture(),before=await json(fetch(base+'/api/media/state')),e=await json(inspect(f));
  assert.equal(e.schema,'shutter-cutaway-evidence-v1');assert.equal(e.previewHash,f.input.previewHash);assert.deepEqual(e.interval,{at:36,end:60});
  assert.deepEqual(e.frames.map(x=>[x.role,x.sceneFrame,x.sourceStart]),[['entry-before',35,'35/24'],['entry-main',36,'3/2'],['entry-alternate',36,'3/2'],['return-alternate',59,'59/24'],['return-main',59,'59/24'],['return-after',60,'5/2']]);
  assert.equal(e.intent.directions[0].brief.goal,'Keep the orb moving.');assert.equal(e.intent.directions[0].evidence,'artist-authored');assert.deepEqual(e.intent.missingClipIds,['second']);
  for(const frame of e.frames){const r=await fetch(base+frame.url),bytes=Buffer.from(await r.arrayBuffer());assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/jpeg');assert.equal(bytes.readUInt16BE(),0xffd8);assert.equal(digest(bytes),frame.sha256);assert.equal(frame.width,160);}
  assert.deepEqual(await json(fetch(base+'/api/media/state')),before);assert.deepEqual(studio.getTimeline(f.id),f.record);assert.equal(studio.list('job').length,0);
  const again=await json(inspect(f));assert.equal(again.id,e.id);assert.equal(again.cached,true);assert.deepEqual(again.frames,e.frames);
  const context=await json(fetch(base+`/api/media/action-context?projectId=${f.id}`));assert.deepEqual(context.project.intent,e.intent);
});
test('evidence at scene edges omits nonexistent pictures and adjacent coverage is the actual visible neighbor',async()=>{
  const edge=await fixture({at:0,frames:96,sourceStart:'0'}),e=await json(inspect(edge));assert.deepEqual(e.frames.map(f=>f.role),['entry-main','entry-alternate','return-alternate','return-main']);
  const f=await fixture();f.input.commands.push({type:'coverage-add',coverage:{id:'previous',assetId:alternate.id,at:24,frames:12,sourceStart:'0',fit:'contain'}},{type:'coverage-add',coverage:{id:'next',assetId:alternate.id,at:60,frames:12,sourceStart:'1',fit:'contain'}});
  const p=await json(request(f.url+'/preview',{version,baseRevision:f.input.baseRevision,commands:f.input.commands}));f.input.previewHash=p.previewHash;
  const neighbors=await json(inspect(f));assert.equal(neighbors.frames[0].clipId,'previous');assert.equal(neighbors.frames[0].layer,'coverage');assert.equal(neighbors.frames.at(-1).clipId,'next');
});
test('stale previews, wrong coverage, foreign frame scope and extra fields fail without editing',async()=>{
  const f=await fixture(),e=await json(inspect(f)),other=await fixture();
  assert.equal((await inspect(f,{previewHash:'0'.repeat(64)})).status,409);assert.equal((await inspect(f,{coverageId:'absent'})).status,400);assert.equal((await inspect(f,{arbitraryPath:'private'})).status,400);
  assert.equal((await fetch(base+e.frames[0].url.replace(f.id,other.id))).status,404);
  assert.equal((await fetch(base+e.frames[0].url,{headers:{origin:'https://foreign.example'}})).status,403);
  studio.saveTimeline(f.id,f.record.revision,{...f.record.timeline,markers:[{id:'mark',frame:1,label:'new',kind:'cue'}]});assert.equal((await inspect(f)).status,409);
});
test('changed authored intent refreshes evidence identity and corrupt thumbnails rebuild from intact sources',async()=>{
  const f=await fixture(),first=await json(inspect(f));
  saveShotDirection(studio,f.id,'first',{baseRevision:1,brief:{goal:'Set the orb down.',continuity:[],query:''}});
  const changed=await json(inspect(f));assert.notEqual(changed.id,first.id);assert.equal(changed.intent.directions[0].revision,2);
  const cache=studio.read(changed.id,'director-evidence'),file=path.join(studio.root,'director-evidence',cache.folder,'frame-0.jpg');await fs.writeFile(file,'tampered');
  assert.equal((await fetch(base+changed.frames[0].url)).status,400);
  const rebuilt=await json(inspect(f));assert.equal(rebuilt.cached,false);assert.equal(rebuilt.frames[0].sha256,changed.frames[0].sha256);
  const cached=studio.read(rebuilt.id,'director-evidence');studio.db.prepare('UPDATE records SET kind=? WHERE id=?').run('foreign-record',cached.id);
  assert.equal((await inspect(f)).status,409);studio.db.prepare('UPDATE records SET kind=? WHERE id=?').run('director-evidence',cached.id);
});
test('mixed-rate evidence matches the actual rendered cut and underlying main at the same scene time',async()=>{
  const f=await fixture(),e=await json(inspect(f));
  const render=async timeline=>{const current=studio.getTimeline(f.id),saved=studio.saveTimeline(f.id,current.revision,timeline);return json(request(`/api/media/productions/${f.id}/render`,{baseRevision:saved.revision,acknowledgeUnmanagedColor:true}));};
  const covered=await render(f.preview.result.timeline),main=await render(f.record.timeline);
  const pixel=async(file,frame,name)=>{const target=path.join(root,name+'.gray');await runMedia('ffmpeg',['-v','error','-i',file,'-vf',`select=eq(n\\,${frame}),crop=2:2:80:44,format=gray`,'-frames:v','1','-f','rawvideo',target]);return (await fs.readFile(target))[0];};
  for(const frame of e.frames){const cached=studio.read(e.id,'director-evidence'),file=path.join(studio.root,'director-evidence',cached.folder,`frame-${frame.index}.jpg`),actual=await pixel(file,0,'evidence'+frame.index);const output=frame.role.endsWith('main')?main:covered;const expected=await pixel(studio.assetPath(output.output),frame.sceneFrame,'render'+frame.index);assert.ok(Math.abs(actual-expected)<4,`${frame.role}: ${actual} vs ${expected}`);}
});
test('a direction change during extraction rejects obsolete evidence and removes only its partial cache',async()=>{
  const f=await fixture(),cache=path.join(studio.root,'director-evidence');await fs.mkdir(cache,{recursive:true});
  const folders=await fs.readdir(cache),records=studio.list('director-evidence').length;let changed=false;
  const watcher=watch(cache,(_event,name)=>{if(!changed&&String(name).startsWith('cutaway-')){changed=true;saveShotDirection(studio,f.id,'first',{baseRevision:1,brief:{goal:'New action during decoding.',continuity:[],query:''}});}});
  try{const response=await json(inspect(f),409);assert.equal(response.error,'evidence_intent_conflict');assert.equal(changed,true);assert.equal(studio.list('director-evidence').length,records);assert.deepEqual(await fs.readdir(cache),folders);assert.deepEqual(studio.getTimeline(f.id),f.record);}
  finally{watcher.close();}
});
test('cancellation leaves no partial evidence and changed original bytes cannot reuse cached pictures',async()=>{
  const f=await fixture(),e=await json(inspect(f)),cache=path.join(studio.root,'director-evidence'),folders=await fs.readdir(cache);
  await assert.rejects(inspectCutaway(studio,f.id,f.input,{signal:AbortSignal.abort()}),/evidence_cancelled/);assert.deepEqual(await fs.readdir(cache),folders);
  const file=studio.assetPath(alternate.id),bytes=await fs.readFile(file);
  try{await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('tampered')]));assert.equal((await inspect(f)).status,400);}
  finally{await fs.writeFile(file,bytes);}
  assert.equal((await json(inspect(f))).id,e.id);
});

test('a bound source note deleted during decoding rejects the result and cannot reuse stale cached evidence',async()=>{
  const f=await fixture(),moment=await saveMoment(studio,f.id,{id:'marked_'+f.id,assetId:alternate.id,startUs:1000000,endUs:4000000,label:'Turn',notes:'The orb remains in hand.'});
  saveShotDirection(studio,f.id,'first',{baseRevision:1,brief:{goal:'Keep the turn.',continuity:[],query:'',coverage:{at:36,end:60,sourceOffsetUs:500000}}});
  const proposal=proposeShots(studio,f.id,'first',{baseRevision:2,directionRevision:2}),input={version,baseRevision:2,commands:[proposal.candidates[0].command],proposal:{proposalId:proposal.id,momentId:moment.id}};
  const preview=previewActions(studio,f.id,input);f.input={...input,previewHash:preview.previewHash,coverageId:input.commands[0].coverage.id};
  const first=await json(inspect(f));assert.equal((await json(inspect(f))).cached,true);
  // Force a real re-extraction, then change the note while the decoder is in flight.
  const cached=studio.read(first.id,'director-evidence');await fs.writeFile(path.join(studio.root,'director-evidence',cached.folder,'frame-0.jpg'),'broken cache');
  const cache=path.join(studio.root,'director-evidence'),folders=await fs.readdir(cache),records=studio.list('director-evidence').length;let changed=false;
  const watcher=watch(cache,(_event,name)=>{if(!changed&&String(name).startsWith('cutaway-')&&!folders.includes(String(name))){changed=true;deleteMoment(studio,f.id,moment.id,1);}});
  try{
    assert.equal((await json(inspect(f),409)).error,'memory_revision_conflict');assert.equal(changed,true);
    assert.equal(studio.list('director-evidence').length,records);assert.deepEqual(await fs.readdir(cache),folders);assert.deepEqual(studio.getTimeline(f.id),f.record);
    assert.equal((await json(inspect(f),409)).error,'memory_revision_conflict');
  }finally{watcher.close();}
});
test('still coverage always samples source zero while its scene clock advances',async()=>{
  const file=path.join(root,'still.png');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=gold:s=160x90','-frames:v','1','-threads','1',file]);
  const still=await json(fetch(base+'/api/media/assets?name=still.png',{method:'POST',body:await fs.readFile(file)}),201),f=await fixture({assetId:still.id,sourceStart:'0'}),e=await json(inspect(f));
  assert.equal(e.frames.find(f=>f.role==='entry-alternate').sourceStart,'0/1');assert.equal(e.frames.find(f=>f.role==='return-alternate').sourceStart,'0/1');assert.equal(e.frames[2].sha256,e.frames[3].sha256);
});
test('the actual MCP bridge returns six verified images from the real evidence HTTP endpoint',async t=>{
  const f=await fixture(),bridge=spawn(process.execPath,['src/mcp.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,SHUTTER_URL:base},windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>bridge.kill());let sequence=0;const pending=new Map();
  createInterface({input:bridge.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('mcp_timeout')),10000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'evidence-http-test',version:'1'}});
  const result=(await rpc('tools/call',{name:'shutter_inspect_cutaway',arguments:{projectId:f.id,...f.input}})).result;
  assert.equal(result.isError,undefined,JSON.stringify(result));assert.equal(result.structuredContent.intent.directions[0].brief.goal,'Keep the orb moving.');
  const images=result.content.filter(x=>x.type==='image');assert.equal(images.length,6);for(const [i,image] of images.entries())assert.equal(digest(Buffer.from(image.data,'base64')),result.structuredContent.frames[i].sha256);
  assert.deepEqual(studio.getTimeline(f.id),f.record);
});
