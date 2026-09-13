import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runMedia} from '../src/media-io.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
import {fingerprint} from '../src/store.mjs';

let child,base,root,original,alternate,song;
const request=(url,input,method='POST',extra={})=>fetch(base+url,{method,headers:{'content-type':'application/json',...extra},body:JSON.stringify(input)});
async function json(response,status=200){const r=await response,data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-direction-'));
  child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe']});
  const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'server_timeout')),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{const parsed=JSON.parse(out.trim());clearTimeout(timer);resolve(parsed);}catch{}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server_exit '+code+' '+err));});});
  base=`http://127.0.0.1:${info.port}`;
  for(const [name,color] of [['original','navy'],['alternate','teal']]){
    const file=path.join(root,name+'.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:s=320x180:r=24:d=4`,'-c:v','libx264','-threads','1',file]);
    const a=await json(fetch(base+'/api/media/assets?name='+name+'.mp4',{method:'POST',body:await fs.readFile(file)}),201);if(name==='original')original=a;else alternate=a;
  }
  song=await json(fetch(base+'/api/media/assets?name=master.wav',{method:'POST',body:pcm24(192000,()=>0)}),201);
});
after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
  const made=await json(request('/api/media/productions',{title:'Director fixture',fps:'24',width:320,height:180}),201),id=made.production.id;
  const timeline={...made.timeline.timeline,clips:[{id:'first',assetId:original.id,sourceStart:'0',frames:48,fit:'contain'},{id:'second',assetId:original.id,sourceStart:'2',frames:48,fit:'cover'}],
    coverage:[{id:'angle',assetId:alternate.id,sourceStart:'0',at:42,frames:12,fit:'contain'}],soundtrack:{assetId:song.id,tailPolicy:'pad-silence'},markers:[{id:'cue',frame:48,kind:'cue',label:'Turn'}]};
  const record=await json(request(`/api/media/productions/${id}/timeline`,{baseRevision:1,timeline},'PUT'));
  const m={id:'moment_'+crypto.randomUUID(),assetId:alternate.id,startUs:1000000,endUs:3000000,label:'Sol turns toward the orb',notes:'Artist observed: blue coat, orb in left hand.',tags:['orb','close'],favorite:false};
  const moment=await json(request(`/api/media/productions/${id}/memory`,{moment:m,baseRevision:0}),201);
  const url=`/api/media/productions/${id}/direction/first`;
  return {id,url,record,moment,brief:{goal:'Let the hesitation land before he releases the orb.',continuity:['Orb stays in the left hand.','Rain and blue coat continue.'],query:'orb'}};
}
const saveBrief=f=>json(request(f.url,{baseRevision:0,brief:f.brief},'PUT'));
const propose=f=>json(request(f.url+'/proposals',{baseRevision:f.record.revision,directionRevision:1}),201);
const accept=(f,p,extra={})=>request(f.url+'/accept',{proposalId:p.id,momentId:f.moment.id,reviewed:true,checkedContinuity:[0,1],...extra});

test('director is delivered by the actual parent server',async()=>{
  for(const name of ['direction-room.js','direction-room.css']){const r=await fetch(base+'/'+name);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),name.endsWith('.js')?/javascript/:/css/);}
  assert.match(await(await fetch(base+'/media-studio')).text(),/id="direction-room"/);
});
test('shot briefs persist independently of picture and reject stale updates',async()=>{
  const f=await fixture(),saved=await saveBrief(f);
  assert.deepEqual(saved.brief,f.brief);assert.equal(saved.revision,1);
  assert.deepEqual((await json(fetch(base+f.url))).direction,saved);
  assert.deepEqual((await json(fetch(base+`/api/media/productions/${f.id}/timeline`))).timeline,f.record.timeline);
  assert.equal((await request(f.url,{baseRevision:0,brief:{...f.brief,goal:'Overwrite'}},'PUT')).status,409);
  assert.equal((await request(f.url,{baseRevision:1,brief:{...f.brief,continuity:[''] }},'PUT')).status,400);
});
test('proposals name exact source and scene intervals and do not infer continuity',async()=>{
  const f=await fixture();await saveBrief(f);
  await json(request(`/api/media/productions/${f.id}/memory`,{baseRevision:0,moment:{...f.moment,id:'short_'+crypto.randomUUID(),startUs:0,endUs:100000,label:'orb insert',sourceSha256:undefined,schema:undefined,projectId:undefined,revision:undefined,technical:undefined,evidence:undefined,assetName:undefined,mediaKind:undefined,createdAt:undefined,updatedAt:undefined}}),201);
  const p=await propose(f),c=p.candidates.find(c=>c.momentId===f.moment.id);
  assert.equal(p.shot.at,0);assert.equal(p.shot.end,48);assert.equal(p.shot.coverage.length,1);
  assert.deepEqual(c.command,{type:'replace',clipId:'first',assetId:alternate.id,sourceStart:'1000000/1000000'});
  assert.equal(c.evidence,'artist-authored');assert.equal(c.continuity,'needs-review');assert.equal(c.fits,true);
  assert.equal(p.candidates.find(c=>c.momentId!==f.moment.id).fits,false);
  assert.equal((await json(fetch(base+f.url))).proposal.id,p.id);
  assert.equal((await json(fetch(base+`/api/media/productions/${f.id}/timeline`))).revision,f.record.revision);
});
test('acceptance requires review and every continuity item before changing picture',async()=>{
  const f=await fixture();await saveBrief(f);const p=await propose(f);
  for(const extra of [{reviewed:false},{checkedContinuity:[]},{checkedContinuity:[0,0]},{checkedContinuity:[0,1,2]}])assert.equal((await accept(f,p,extra)).status,400);
  assert.equal((await json(fetch(base+`/api/media/productions/${f.id}/timeline`))).revision,f.record.revision);
});
test('acceptance preserves scene clock, overlay, song and original take and is undoable',async()=>{
  const f=await fixture();await saveBrief(f);const p=await propose(f),after=await json(accept(f,p));
  assert.equal(after.timeline.clips[0].assetId,alternate.id);assert.equal(after.timeline.clips[0].sourceStart,'1/1');assert.equal(after.timeline.clips[0].frames,48);
  for(const field of ['coverage','soundtrack','markers'])assert.deepEqual(after.timeline[field],f.record.timeline[field]);
  assert.deepEqual(after.timeline.clips[1],f.record.timeline.clips[1]);
  const stack=await json(fetch(base+`/api/media/productions/${f.id}/takes/first`));assert.equal(stack.candidates[0].assetId,original.id);assert.equal(stack.candidates[1].momentId,f.moment.id);
  const undone=await json(request(`/api/media/productions/${f.id}/timeline/undo`,{baseRevision:after.revision}));assert.deepEqual(undone.timeline,f.record.timeline);
  const notebook=await json(fetch(base+`/api/media/productions/${f.id}/memory-export`));assert.equal(notebook.directions[0].brief.goal,f.brief.goal);assert.equal(notebook.shotProposals[0].id,p.id);
});
test('saved picture, brief or source-note changes invalidate earlier proposals',async()=>{
  for(const change of ['picture','brief','moment']){
    const f=await fixture();await saveBrief(f);const p=await propose(f);
    if(change==='picture')await json(request(`/api/media/productions/${f.id}/timeline`,{baseRevision:f.record.revision,timeline:{...f.record.timeline,markers:[]}},'PUT'));
    if(change==='brief')await json(request(f.url,{baseRevision:1,brief:{...f.brief,goal:'A different intention'}},'PUT'));
    if(change==='moment')await json(request(`/api/media/productions/${f.id}/memory`,{baseRevision:1,moment:{id:f.moment.id,assetId:alternate.id,startUs:0,endUs:3000000,label:'Changed orb shot'} }),201);
    const before=await json(fetch(base+`/api/media/productions/${f.id}/timeline`));assert.equal((await accept(f,p)).status,409,change);
    assert.deepEqual(await json(fetch(base+`/api/media/productions/${f.id}/timeline`)),before);
  }
});
test('proposal ids cannot be reused for another shot or production',async()=>{
  const f=await fixture(),other=await fixture();await saveBrief(f);const p=await propose(f);
  for(const url of [other.url,f.url.replace('/first','/second')])assert.equal((await request(url+'/accept',{proposalId:p.id,momentId:f.moment.id,reviewed:true,checkedContinuity:[0,1]})).status,404);
});
test('unmatched direction stays empty and cross-origin writes remain blocked',async()=>{
  const f=await fixture();f.brief.query='unlabelled nebula';await saveBrief(f);const p=await propose(f);assert.deepEqual(p.candidates,[]);
  const result=await request(f.url,{baseRevision:1,brief:f.brief},'PUT',{origin:'https://untrusted.invalid'});assert.equal(result.status,403);
});
test('reusing an earlier identical proposal still makes it the latest reviewed plan',async()=>{
  const f=await fixture();await saveBrief(f);const original=await propose(f);
  const added=await json(request(`/api/media/productions/${f.id}/memory`,{baseRevision:0,moment:{id:'extra_'+crypto.randomUUID(),assetId:alternate.id,startUs:0,endUs:3000000,label:'orb wide'}}),201);
  const expanded=await propose(f);assert.notEqual(expanded.id,original.id);
  await json(request(`/api/media/productions/${f.id}/memory/${added.id}`,{baseRevision:1},'DELETE'));
  const reused=await propose(f);assert.equal(reused.id,original.id);
  assert.equal((await json(fetch(base+f.url))).proposal.id,reused.id);
});
test('direction storage cannot replace an existing source note with a colliding id',async()=>{
  const f=await fixture(),id='direction_'+fingerprint([f.id,'first']);
  const note=await json(request(`/api/media/productions/${f.id}/memory`,{baseRevision:0,moment:{id,assetId:alternate.id,startUs:0,endUs:3000000,label:'Preserve this note'}}),201);
  assert.equal((await request(f.url,{baseRevision:0,brief:f.brief},'PUT')).status,409);
  const notes=await json(fetch(base+`/api/media/productions/${f.id}/memory?q=preserve`));assert.deepEqual(notes.results,[note]);
});
