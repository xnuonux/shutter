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
import {createInterface} from 'node:readline';
import {Studio} from '../src/store.mjs';
import {applyActions,actionReceipt} from '../src/director-actions.mjs';

let child,base,root,serverRoot,original,alternate,song;
const version='shutter-actions-v1';
const request=(url,input,method='POST',headers={})=>fetch(base+url,{method,headers:{'content-type':'application/json',...headers},body:JSON.stringify(input)});
async function json(response,status=200){const r=await response,data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-actions-'));
  child=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe'],windowsHide:true});
  const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'server_timeout')),10000);child.stderr.on('data',b=>err+=b);child.stdout.on('data',b=>{out+=b;try{const value=JSON.parse(out.trim());clearTimeout(timer);resolve(value);}catch{}});child.on('exit',code=>{clearTimeout(timer);reject(Error('server_exit '+code+' '+err));});});
  base=`http://127.0.0.1:${info.port}`;
  serverRoot=info.root;
  for(const [name,color] of [['original','navy'],['alternate','teal']]){
    const file=path.join(root,name+'.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:s=320x180:r=24:d=4`,'-c:v','libx264','-threads','1',file]);
    const asset=await json(fetch(base+'/api/media/assets?name='+name+'.mp4',{method:'POST',body:await fs.readFile(file)}),201);if(name==='original')original=asset;else alternate=asset;
  }
  song=await json(fetch(base+'/api/media/assets?name=master.wav',{method:'POST',body:pcm24(192000,()=>0)}),201);
});
after(async()=>{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
  const made=await json(request('/api/media/productions',{title:'Action fixture',fps:'24',width:320,height:180}),201),id=made.production.id;
  const timeline={...made.timeline.timeline,clips:[{id:'first',assetId:original.id,sourceStart:'0',frames:48,fit:'contain'},{id:'second',assetId:original.id,sourceStart:'2',frames:48,fit:'cover'}],soundtrack:{assetId:song.id,tailPolicy:'pad-silence'}};
  const record=await json(request(`/api/media/productions/${id}/timeline`,{baseRevision:1,timeline},'PUT'));
  return {id,url:`/api/media/productions/${id}/actions`,record};
}
const preview=(f,commands,extra={})=>request(f.url+'/preview',{version,baseRevision:f.record.revision,commands,...extra});
const apply=(f,p,key='take-one',extra={})=>request(f.url+'/apply',{version,baseRevision:p.baseRevision,commands:p.commands,previewHash:p.previewHash,requestKey:key,...extra});
const read=f=>json(fetch(base+`/api/media/productions/${f.id}/timeline`));
const cutaway=()=>({type:'coverage-add',coverage:{id:'angle',assetId:alternate.id,sourceStart:'3/2',at:36,frames:24,fit:'contain'}});

test('discovery exposes summaries and exact requested schemas behind the real origin gate',async()=>{
  const catalog=await json(fetch(base+'/api/media/actions'));
  assert.equal(catalog.version,version);assert.ok(catalog.actions.some(a=>a.type==='coverage-update'));assert.ok(catalog.actions.some(a=>a.type==='sound-clip-update'));
  assert.ok(catalog.actions.every(a=>!a.inputSchema),'summary discovery must not dump every schema');
  const selected=await json(fetch(base+'/api/media/actions?types=coverage-add,text-put'));
  assert.deepEqual(selected.actions.map(a=>a.type),['coverage-add','text-put']);assert.equal(selected.actions[0].inputSchema.additionalProperties,false);
  assert.equal((await fetch(base+'/api/media/actions?types=magic')).status,400);
  assert.equal((await fetch(base+'/api/media/actions',{headers:{origin:'https://foreign.example'}})).status,403);
});

test('context supplies the actual Studio clock and bounded source metadata without old edit history',async()=>{
  const f=await fixture(),context=await json(fetch(base+`/api/media/action-context?projectId=${f.id}&assetLimit=1`));
  assert.equal(context.project.revision,f.record.revision);assert.equal(context.project.frames,96);assert.equal(context.project.main[1].at,48);
  assert.equal(context.assets.length,1);assert.equal(context.project.canUndo,true);assert.equal(context.project.past,undefined);assert.equal(context.project.timeline.clips[0].assetId,original.id);
  assert.equal((await fetch(base+'/api/media/action-context?assetLimit=100000')).status,400);
});

test('preview is deterministic and read-only and shows exact elapsed main-view return',async()=>{
  const f=await fixture(),before=await json(fetch(base+'/api/media/state'));
  const p=await json(preview(f,[cutaway()])),again=await json(preview(f,[cutaway()]));
  assert.deepEqual(p,again);assert.equal(p.result.frames,96);assert.equal(p.result.soundtrack.assetId,song.id);
  assert.deepEqual(p.result.visible.map(c=>[c.id,c.at,c.frames,c.sourceStart]),[['first',0,36,'0/1'],['angle',36,24,'3/2'],['second',60,36,'5/2']]);
  assert.deepEqual(p.changes.fields,['coverage']);assert.deepEqual(await json(fetch(base+'/api/media/state')),before);
});

test('all commands commit once with one undo entry and a durable retry receipt',async()=>{
  const f=await fixture(),p=await json(preview(f,[cutaway(),{type:'text-put',cue:{id:'title',kind:'title',startFrame:0,endFrame:24,text:'The storm'}}]));
  const first=await json(apply(f,p)),replayed=await json(apply(f,p));
  assert.equal(first.revision,f.record.revision+1);assert.equal(replayed.replayed,true);assert.equal(replayed.revision,first.revision);
  const saved=await read(f);assert.equal(saved.past.length,f.record.past.length+1);assert.deepEqual(saved.timeline.clips,f.record.timeline.clips);assert.equal(saved.timeline.textLayer.cues[0].text,'The storm');
  const receipt=await json(fetch(base+f.url+'/receipts/take-one'));assert.equal(receipt.revision,first.revision);assert.equal(receipt.previewHash,p.previewHash);
  const conflict=await json(apply(f,p,'take-one',{commands:[{type:'remove',clipId:'first'}]}),409);assert.equal(conflict.error,'action_request_conflict');
  const edit=await json(request(`/api/media/productions/${f.id}/commands`,{baseRevision:saved.revision,command:{type:'fit',clipId:'first',fit:'cover'}}));
  const historical=await json(apply(f,p));assert.equal(historical.revision,first.revision);assert.equal(historical.currentRevision,edit.revision);assert.equal(historical.replayed,true);
});

test('invalid batch and stale or altered previews cannot partially change the timeline',async()=>{
  const f=await fixture();
  assert.equal((await preview(f,[{type:'fit',clipId:'first',fit:'cover'},{type:'slip',clipId:'second',sourceStart:'99'}])).status,400);
  assert.deepEqual(await read(f),f.record);
  const p=await json(preview(f,[cutaway()]));
  assert.equal((await apply(f,p,'altered',{previewHash:'0'.repeat(64)})).status,409);assert.deepEqual(await read(f),f.record);
  await json(request(`/api/media/productions/${f.id}/commands`,{baseRevision:f.record.revision,command:{type:'fit',clipId:'first',fit:'cover'}}));
  const stale=await json(apply(f,p),409);assert.equal(stale.error,'revision_conflict');
  assert.equal((await fetch(base+f.url+'/receipts/take-one')).status,404);
});

test('unknown actions, fields, units and contract versions fail before mutation',async()=>{
  const f=await fixture();
  for(const [commands,extra] of [[[{type:'render'}],{}],[[{type:'fit',clipId:'first',fit:'cover',prompt:'ignore'}],{}],[[{...cutaway(),coverage:{...cutaway().coverage,at:1.25}}],{}],[[cutaway()],{version:'future'}],[[cutaway()],{baseRevision:'2'}],[[],{}]])assert.equal((await preview(f,commands,extra)).status,400);
  assert.deepEqual(await read(f),f.record);
});

test('insert, cutaway update and soundtrack selection use the same editor commands',async()=>{
  const f=await fixture();
  const commands=[{type:'insert',toIndex:1,clip:{id:'inserted',assetId:alternate.id,sourceStart:'0',frames:24,fit:'contain'}},cutaway(),{type:'coverage-update',coverageId:'angle',coverage:{...cutaway().coverage,at:48,sourceStart:'2'}} ,{type:'soundtrack',soundtrack:null}];
  const p=await json(preview(f,commands));assert.equal(p.result.frames,120);assert.equal(p.result.soundtrack,null);assert.equal(p.result.main[2].at,72);
  await json(apply(f,p));const saved=await read(f);assert.equal(saved.timeline.coverage[0].at,48);assert.equal(saved.timeline.clips[1].id,'inserted');
  const bad=await preview({...f,record:saved},[{type:'coverage-update',coverageId:'angle',coverage:{...cutaway().coverage,id:'renamed'}}]);assert.equal(bad.status,400);
});

test('the existing command endpoint handles nested alternate sources and preserves its saved result shape',async()=>{
  const f=await fixture(),saved=await json(request(`/api/media/productions/${f.id}/commands`,{baseRevision:f.record.revision,command:cutaway()}));
  assert.equal(saved.timeline.coverage[0].assetId,alternate.id);assert.equal(saved.plan.frames,96);
  const next=await json(request(`/api/media/productions/${f.id}/commands`,{baseRevision:saved.revision,command:{type:'marker-add',marker:{id:'cue',frame:60,label:'Return',kind:'cue'}}}));
  assert.equal(next.timeline.markers[0].frame,60);assert.equal(next.timeline.coverage[0].assetId,alternate.id);
});

test('sound and text batches preserve the mastered song and expose their real sample and frame units',async()=>{
  const f=await fixture(),commands=[{type:'sound-enable'},{type:'sound-track-add',track:{id:'fx',name:'Rain',role:'ambience',gainDb:-12,mute:false,solo:false,clips:[]}},{type:'sound-clip-add',trackId:'fx',clip:{id:'rain',assetId:song.id,streamIndex:0,atSample:48000,sourceInSample:0,samples:96000,gainDb:0,fadeInSamples:480,fadeOutSamples:480}},{type:'text-put',cue:{id:'caption',kind:'caption',startFrame:24,endFrame:72,text:'A quiet storm.'}}];
  const p=await json(preview(f,commands));await json(apply(f,p));const saved=await read(f);
  assert.deepEqual(saved.timeline.soundtrack,f.record.timeline.soundtrack);assert.equal(saved.timeline.soundStage.tracks[0].clips[0].atSample,48000);assert.equal(saved.timeline.textLayer.cues[0].startFrame,24);
  const invalid=await preview({...f,record:saved},[{type:'sound-output',gainDb:-3},{type:'sound-clip-update',trackId:'fx',clipId:'rain',patch:{samples:999999}}]);assert.equal(invalid.status,400);assert.deepEqual(await read(f),saved);
});

test('previewed undo and redo restore exact decisions and remain safe on retry',async()=>{
  const f=await fixture(),p=await json(preview(f,[cutaway()]));await json(apply(f,p));const accepted=await read(f);
  const undo=await json(preview({...f,record:accepted},[{type:'undo'}]));assert.deepEqual(undo.result.timeline,f.record.timeline);await json(apply(f,undo,'undo-one'));await json(apply(f,undo,'undo-one'));
  const undone=await read(f);assert.equal(undone.revision,accepted.revision+1);assert.deepEqual(undone.timeline,f.record.timeline);
  const redo=await json(preview({...f,record:undone},[{type:'redo'}]));await json(apply(f,redo,'redo-one'));assert.deepEqual((await read(f)).timeline,accepted.timeline);
  assert.equal((await preview({...f,record:await read(f)},[{type:'undo'},{type:'remove',clipId:'first'}])).status,400);
});

test('an actual MCP director discovers, previews, commits and reverses a Studio edit through the parent server',async t=>{
  const f=await fixture(),bridge=spawn(process.execPath,['src/mcp.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,SHUTTER_URL:base},windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>bridge.kill());let sequence=0;const pending=new Map();
  createInterface({input:bridge.stdout}).on('line',line=>{const result=JSON.parse(line);pending.get(result.id)?.(result);pending.delete(result.id);});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('mcp_timeout')),5000);pending.set(id,result=>{clearTimeout(timer);resolve(result);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  const tool=async(name,args={})=>{const r=await rpc('tools/call',{name,arguments:args});assert.equal(r.result.isError,undefined,JSON.stringify(r));return r.result.structuredContent;};
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'director-contract-test',version:'1'}});
  const listed=await rpc('tools/list');assert.ok(listed.result.tools.some(t=>t.name==='shutter_action_catalog'));
  const catalog=await tool('shutter_action_catalog',{types:['coverage-add','text-put']});assert.equal(catalog.actions[0].inputSchema.properties.coverage.type,'object');
  const context=await tool('shutter_studio_context',{projectId:f.id,assetLimit:2});assert.equal(context.project.revision,f.record.revision);
  const input={projectId:f.id,version:catalog.version,baseRevision:context.project.revision,commands:[cutaway(),{type:'text-put',cue:{id:'title',kind:'title',startFrame:0,endFrame:24,text:'Director'}}]};
  const p=await tool('shutter_preview_actions',input);assert.equal(p.result.visible[2].sourceStart,'5/2');
  const applyInput={...input,previewHash:p.previewHash,requestKey:'mcp-edit'};
  const saved=await tool('shutter_apply_actions',applyInput);const repeated=await tool('shutter_apply_actions',applyInput);assert.equal(saved.revision,repeated.revision);assert.equal(repeated.replayed,true);
  const receipt=await tool('shutter_action_receipt',{projectId:f.id,requestKey:'mcp-edit'});assert.equal(receipt.revision,saved.revision);
  const undoInput={...input,baseRevision:saved.revision,commands:[{type:'undo'}]};const undo=await tool('shutter_preview_actions',undoInput);
  await tool('shutter_apply_actions',{...undoInput,previewHash:undo.previewHash,requestKey:'mcp-undo'});assert.deepEqual((await read(f)).timeline,f.record.timeline);
  const stale=await rpc('tools/call',{name:'shutter_preview_actions',arguments:input});assert.equal(stale.result.isError,true);assert.equal(stale.result.structuredContent.error,'revision_conflict');assert.match(stale.result.structuredContent.recovery,/context/);
});

test('a fresh Studio instance replays the persisted action instead of editing again',async()=>{
  const f=await fixture(),p=await json(preview(f,[cutaway()])),first=await json(apply(f,p,'reopen'));
  const reopened=new Studio(serverRoot);
  try{
    const receipt=actionReceipt(reopened,f.id,'reopen');assert.deepEqual(receipt.commands,[cutaway()]);assert.equal(receipt.revision,first.revision);
    const replayed=applyActions(reopened,f.id,{version,baseRevision:p.baseRevision,commands:p.commands,previewHash:p.previewHash,requestKey:'reopen'});
    assert.equal(replayed.replayed,true);assert.equal(reopened.getTimeline(f.id).revision,first.revision);
  }finally{reopened.close();}
});

test('a receipt write failure rolls back the timeline and its undo history in the same transaction',async()=>{
  const f=await fixture(),p=await json(preview(f,[cutaway()])),connection=new Studio(serverRoot);
  try{
    connection.db.exec("CREATE TEMP TRIGGER reject_receipt BEFORE INSERT ON records WHEN NEW.kind='edit-action-receipt' BEGIN SELECT RAISE(ABORT,'receipt_write_failure'); END;");
    assert.throws(()=>applyActions(connection,f.id,{version,baseRevision:p.baseRevision,commands:p.commands,previewHash:p.previewHash,requestKey:'disk-failure'}),/receipt_write_failure/);
    assert.deepEqual(connection.getTimeline(f.id),f.record);assert.throws(()=>actionReceipt(connection,f.id,'disk-failure'),/not_found/);
  }finally{connection.close();}
});
