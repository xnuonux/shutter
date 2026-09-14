import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runMedia} from '../src/media-io.mjs';
import {Studio} from '../src/store.mjs';
import {saveMoment,deleteMoment,collectTake,getTakeStack} from '../src/production-memory.mjs';
import {saveShotDirection} from '../src/shot-direction.mjs';
import {applyActions} from '../src/director-actions.mjs';
import crypto from 'node:crypto';
import {watch} from 'node:fs';

let server,bridge,base,root,studio,main,angle,sequence=0;
const pending=new Map(),version='shutter-actions-v1';
const request=(url,input,method='POST')=>fetch(base+url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(input)});
async function json(response,status=200){const r=await response,v=await r.json();assert.equal(r.status,status,JSON.stringify(v));return v;}
function rpc(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('mcp_timeout')),10000);pending.set(id,result=>{clearTimeout(timer);resolve(result);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
async function call(name,args={},error){const r=(await rpc('tools/call',{name,arguments:args})).result;if(error){assert.equal(r.isError,true);assert.match(r.structuredContent.error,error);return r.structuredContent;}assert.equal(r.isError,undefined,JSON.stringify(r));return r.structuredContent;}
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-director-workflow-'));
  server=spawn(process.execPath,['--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe'],windowsHide:true});
  const info=await new Promise((resolve,reject)=>{let out='',err='';const timer=setTimeout(()=>reject(Error(err||'server_timeout')),10000);server.stderr.on('data',b=>err+=b);server.stdout.on('data',b=>{out+=b;try{const v=JSON.parse(out.trim());clearTimeout(timer);resolve(v);}catch{}});});
  base=`http://127.0.0.1:${info.port}`;studio=new Studio(info.root);
  for(const [name,color] of [['main','navy'],['angle','teal']]){const file=path.join(root,name+'.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:s=160x90:r=24:d=4`,'-c:v','libx264','-threads','1',file]);const a=await json(fetch(base+'/api/media/assets?name='+name+'.mp4',{method:'POST',body:await fs.readFile(file)}),201);if(name==='main')main=a;else angle=a;}
  bridge=spawn(process.execPath,['src/mcp.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,SHUTTER_URL:base},windowsHide:true,stdio:['pipe','pipe','pipe']});
  createInterface({input:bridge.stdout}).on('line',line=>{const v=JSON.parse(line);pending.get(v.id)?.(v);pending.delete(v.id);});
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'director-workflow-test',version:'1'}});
});
after(async()=>{if(bridge&&bridge.exitCode===null){bridge.kill();await once(bridge,'exit');}studio?.close();if(server&&server.exitCode===null){server.kill();await once(server,'exit');}if(root)await fs.rm(root,{recursive:true,force:true});});
async function fixture(){const made=await json(request('/api/media/productions',{title:'Director workflow fixture',fps:'24',width:160,height:90}),201),id=made.production.id;const record=studio.saveTimeline(id,1,{...made.timeline.timeline,clips:[{id:'opening',assetId:main.id,sourceStart:'0',frames:48,fit:'contain'},{id:'continuation',assetId:main.id,sourceStart:'2',frames:48,fit:'contain'}]});return {id,record};}
const note=f=>({projectId:f.id,baseRevision:0,moment:{id:'moment_'+f.id,assetId:angle.id,startUs:1000000,endUs:4000000,label:'Orb alternate view',notes:'Observed subject turning with the orb.',tags:['orb']}});
const brief={goal:'Let the turn carry across the cut.',continuity:['The orb stays in hand.'],query:'orb',coverage:{at:36,end:60,sourceOffsetUs:500000}};

test('a real MCP director marks, finds, directs, proposes, inspects, applies and undoes existing footage',async()=>{
  const f=await fixture(),saved=await call('shutter_save_moment',note(f));assert.equal(saved.evidence,'director-authored');
  const search=await call('shutter_search_moments',{projectId:f.id,query:'orb',kind:'video'});assert.equal(search.results.length,1);assert.equal(search.results[0].id,saved.id);
  const current=await call('shutter_get_direction',{projectId:f.id,clipId:'opening'});assert.equal(current.timelineRevision,2);assert.equal(current.directionRevision,0);
  const direction=await call('shutter_save_direction',{projectId:f.id,clipId:'opening',timelineRevision:current.timelineRevision,baseRevision:current.directionRevision,brief});assert.equal(direction.evidence,'director-authored');
  const proposal=await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:direction.revision});assert.equal(proposal.directionEvidence,'director-authored');assert.equal(proposal.candidates[0].evidence,'director-authored');assert.equal(proposal.candidates[0].fits,true);assert.equal(proposal.candidates[0].command.coverage.at,36);assert.equal(proposal.interval.returnTo.sourceStart,'5/2');
  assert.deepEqual(studio.getTimeline(f.id),f.record);
  const binding={proposalId:proposal.id,momentId:saved.id};
  const input={projectId:f.id,version,baseRevision:2,commands:[proposal.candidates[0].command],proposal:binding},preview=await call('shutter_preview_actions',input);
  assert.deepEqual(preview.proposal,binding);assert.equal(preview.proposalContext.moment.revision,1);
  await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:direction.revision});
  assert.equal((await call('shutter_preview_actions',input)).previewHash,preview.previewHash,'equivalent proposal refresh does not invalidate context');
  const evidence=await call('shutter_inspect_cutaway',{...input,previewHash:preview.previewHash,coverageId:proposal.candidates[0].command.coverage.id});assert.equal(evidence.intent.directions[0].evidence,'director-authored');assert.equal(evidence.frames.length,6);
  const applied=await call('shutter_apply_actions',{...input,previewHash:preview.previewHash,requestKey:'director-choice'});assert.equal(applied.revision,3);assert.equal(studio.getTimeline(f.id).timeline.coverage[0].at,36);
  assert.deepEqual(evidence.proposalContext,preview.proposalContext);assert.deepEqual(applied.proposal,binding);
  await call('shutter_save_moment',{...note(f),baseRevision:1,moment:{...note(f).moment,notes:'Later note correction.'}});
  const replay=await call('shutter_apply_actions',{...input,previewHash:preview.previewHash,requestKey:'director-choice'});assert.equal(replay.replayed,true);assert.equal(replay.revision,3);assert.deepEqual(replay.proposalContext,preview.proposalContext);
  const undoInput={projectId:f.id,version,baseRevision:3,commands:[{type:'undo'}]},undo=await call('shutter_preview_actions',undoInput);await call('shutter_apply_actions',{...undoInput,previewHash:undo.previewHash,requestKey:'restore-review'});assert.deepEqual(studio.getTimeline(f.id).timeline,f.record.timeline);assert.equal(studio.list('job').length,0);
});

async function chosen(){
  const f=await fixture();await call('shutter_save_moment',note(f));await call('shutter_save_direction',{projectId:f.id,clipId:'opening',timelineRevision:2,baseRevision:0,brief});
  const p=await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:1});
  const input={projectId:f.id,version,baseRevision:2,commands:[p.candidates[0].command],proposal:{proposalId:p.id,momentId:p.candidates[0].momentId}};
  return {...f,input,preview:await call('shutter_preview_actions',input)};
}
test('bound proposals reject changed direction and deleted/recreated notes without saving edits or receipts',async()=>{
  for(const change of ['direction','recreated-direction','note','recreated-note']){
    const f=await chosen();
    if(change==='direction')await call('shutter_save_direction',{projectId:f.id,clipId:'opening',timelineRevision:2,baseRevision:1,brief:{...brief,goal:'Keep the orb still.'}});
    else if(change==='recreated-direction'){
      const d=studio.list('shot-direction').find(d=>d.projectId===f.id);studio.db.prepare('DELETE FROM records WHERE id=?').run(d.id);
      await call('shutter_save_direction',{projectId:f.id,clipId:'opening',timelineRevision:2,baseRevision:0,brief:{...brief,goal:'Different goal at the same revision.'}});
    }
    else if(change==='note')await call('shutter_save_moment',{...note(f),baseRevision:1,moment:{...note(f).moment,notes:'Changed observed action.'}});
    else {deleteMoment(studio,f.id,note(f).moment.id,1);await call('shutter_save_moment',{...note(f),moment:{...note(f).moment,notes:'The orb has already been put down.'}});}
    const error=change.includes('direction')?/direction_revision_conflict/:/memory_revision_conflict/;
    await call('shutter_apply_actions',{...f.input,previewHash:f.preview.previewHash,requestKey:'stale'},error);
    await call('shutter_inspect_cutaway',{...f.input,previewHash:f.preview.previewHash,coverageId:f.input.commands[0].coverage.id,includeImages:false},error);
    assert.deepEqual(studio.getTimeline(f.id),f.record);assert.equal(studio.list('edit-action-receipt').filter(r=>r.projectId===f.id).length,0);
  }
});
test('a proposal binding cannot be stripped, moved to another production or attached to changed commands',async()=>{
  const f=await chosen(),{proposal,...plain}=f.input;
  await call('shutter_apply_actions',{...plain,previewHash:f.preview.previewHash,requestKey:'stripped'},/action_preview_conflict/);
  await call('shutter_preview_actions',{...f.input,commands:[{...f.input.commands[0],coverage:{...f.input.commands[0].coverage,at:35}}]},/proposal_command_conflict/);
  await call('shutter_preview_actions',{...f.input,commands:[...f.input.commands,{type:'undo'}]},/proposal_command_conflict/);
  const other=await fixture();await call('shutter_preview_actions',{...f.input,projectId:other.id},/not_found/);
  assert.deepEqual(studio.getTimeline(f.id),f.record);
});
test('bound context is rechecked inside the timeline transaction before either edit or receipt is written',async()=>{
  const f=await chosen(),{projectId,...input}=f.input,save=studio.saveTimeline.bind(studio),transaction=studio.transaction.bind(studio);
  let guarded=false;
  studio.saveTimeline=(...args)=>{
    saveShotDirection(studio,f.id,'opening',{baseRevision:1,brief:{...brief,goal:'Direction changed immediately before commit.'}});
    studio.transaction=fn=>transaction(()=>{guarded=true;return fn();});
    return save(...args);
  };
  try{assert.throws(()=>applyActions(studio,projectId,{...input,previewHash:f.preview.previewHash,requestKey:'commit-race'}),/direction_revision_conflict/);}
  finally{studio.saveTimeline=save;studio.transaction=transaction;}
  assert.equal(guarded,true);assert.deepEqual(studio.getTimeline(f.id),f.record);assert.equal(studio.list('edit-action-receipt').filter(r=>r.projectId===f.id).length,0);
});
test('direction writes reject stale cut and direction revisions and uncertain retries cannot repeat saves',async()=>{
  const f=await fixture(),input={projectId:f.id,clipId:'opening',timelineRevision:2,baseRevision:0,brief};
  const saved=await call('shutter_save_direction',input);await call('shutter_save_direction',input,/direction_revision_conflict/);
  const reread=await call('shutter_get_direction',{projectId:f.id,clipId:'opening'});assert.equal(reread.directionRevision,saved.revision);assert.deepEqual(reread.direction.brief,brief);
  studio.saveTimeline(f.id,2,{...f.record.timeline,clips:[...f.record.timeline.clips].reverse()});
  await call('shutter_save_direction',{...input,baseRevision:1},/revision_conflict/);assert.equal(studio.list('shot-direction').find(d=>d.projectId===f.id).revision,1);
  await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:1},/revision_conflict/);
});
test('source edits preserve identity, reject stale note revisions, and do not cross production scope',async()=>{
  const f=await fixture(),other=await fixture(),input=note(f),saved=await call('shutter_save_moment',input);
  await call('shutter_save_moment',input,/revision_conflict/);
  await call('shutter_save_moment',{...input,projectId:other.id,baseRevision:1},/memory_identity_conflict/);
  assert.equal((await call('shutter_search_moments',{projectId:other.id,query:'orb'})).total,0);
  const updated=await call('shutter_save_moment',{...input,baseRevision:1,moment:{...input.moment,notes:'Turn finishes later.',favorite:true}});assert.equal(updated.revision,2);assert.equal(updated.sourceSha256,saved.sourceSha256);
  assert.equal((await call('shutter_search_moments',{projectId:f.id,favorite:true})).results[0].revision,2);
});
test('strict tool schemas reject forged authorship, invalid units and extra fields before writing',async()=>{
  const f=await fixture(),input=note(f);
  for(const bad of [{...input,authoredBy:'artist'},{...input,moment:{...input.moment,startUs:1.5}},{...input,moment:{...input.moment,arbitraryPath:'private'}}])await call('shutter_save_moment',bad,/action_arguments/);
  await call('shutter_search_moments',{projectId:f.id,offset:-1},/action_arguments/);
  await call('shutter_save_direction',{projectId:f.id,clipId:'opening',baseRevision:0,brief},/action_arguments/);
  assert.equal(studio.list('memory-moment').filter(m=>m.projectId===f.id).length,0);assert.equal(studio.list('shot-direction').filter(d=>d.projectId===f.id).length,0);
});
test('source and direction authorship survives proposals, Take Stack and legacy artist saves',async()=>{
  const f=await fixture(),n=await call('shutter_save_moment',note(f));
  await collectTake(studio,f.id,'opening',{baseRevision:2,stackRevision:0,momentId:n.id,momentRevision:1});assert.equal(getTakeStack(studio,f.id,'opening').candidates.find(c=>c.momentId===n.id).evidence,'director-authored');
  const artist=await saveMoment(studio,f.id,{...note(f).moment,notes:'Artist revised the observed turn.'},{baseRevision:1});assert.equal(artist.evidence,'artist-authored');
  saveShotDirection(studio,f.id,'opening',{baseRevision:0,brief});const direction=await call('shutter_get_direction',{projectId:f.id,clipId:'opening'});assert.equal(direction.direction.evidence,'artist-authored');
  const proposal=await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:1});assert.equal(proposal.candidates[0].evidence,'artist-authored');
  await call('shutter_propose_shots',{projectId:f.id,clipId:'opening',baseRevision:2,directionRevision:0},/action_arguments/);
});

test('MCP source inspection returns chronological pictures and verified silent playback without changing the library or cut',async()=>{
  const file=path.join(root,'moving-source.mp4');
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',"nullsrc=s=160x90:r=24:d=4,geq=lum='16+N*2':cb=128:cr=128",'-c:v','libx264','-threads','1',file]);
  const source=await json(fetch(base+'/api/media/assets?name=moving-source.mp4',{method:'POST',body:await fs.readFile(file)}),201),f=await fixture();
  const before=await json(fetch(base+'/api/media/state')),input={assetId:source.id,startUs:1000000,endUs:3000000,frameCount:8};
  const full=(await rpc('tools/call',{name:'shutter_inspect_source',arguments:input})).result;
  assert.equal(full.isError,undefined,JSON.stringify(full));const manifest=full.structuredContent;
  assert.equal(manifest.schema,'shutter-source-inspection-v1');assert.equal(manifest.preview.frames,48);assert.equal(manifest.preview.audio,'omitted');assert.equal(manifest.frames.length,8);
  assert.deepEqual(manifest.frames.map(f=>f.previewFrame),[0,6,13,20,26,33,40,47]);
  assert.equal(manifest.frames[0].sourceTime,'1/1');assert.equal(manifest.frames.at(-1).sourceTime,'71/24');
  const images=full.content.filter(c=>c.type==='image');assert.equal(images.length,8);
  for(const [i,img] of images.entries())assert.equal(crypto.createHash('sha256').update(Buffer.from(img.data,'base64')).digest('hex'),manifest.frames[i].sha256);
  const playback=await fetch(base+manifest.preview.url),bytes=Buffer.from(await playback.arrayBuffer());assert.equal(playback.headers.get('content-type'),'video/mp4');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.preview.sha256);
  const partial=await fetch(base+manifest.preview.url,{headers:{range:'bytes=0-31'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),`bytes 0-31/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(0,32));
  assert.equal((await fetch(base+manifest.preview.url,{headers:{range:`bytes=${bytes.length}-`}})).status,416);
  const cached=await call('shutter_inspect_source',{...input,includeImages:false});assert.equal(cached.cached,true);assert.equal(cached.id,manifest.id);
  const previewFile=path.join(root,'source-playback.mp4');await fs.writeFile(previewFile,bytes);
  const actual=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',previewFile]));assert.equal(Number(actual.streams[0].nb_read_frames),48);assert.equal(actual.streams.length,1);
  // Test the strip against decoded playback, including the final frame, not metadata alone.
  for(const frame of [manifest.frames[0],manifest.frames.at(-1)]){
    const imageFile=path.join(root,'sample-'+frame.index+'.jpg');await fs.writeFile(imageFile,Buffer.from(images[frame.index].data,'base64'));
    const pixel=async(source,index,name)=>{const out=path.join(root,name+'.raw');await runMedia('ffmpeg',['-v','error','-i',source,'-vf',`select=eq(n\\,${index}),crop=2:2:80:44,format=gray`,'-frames:v','1','-f','rawvideo',out]);return(await fs.readFile(out))[0];};
    const playbackPixel=await pixel(previewFile,frame.previewFrame,'playback-'+frame.index);
    assert.ok(Math.abs(playbackPixel-await pixel(imageFile,0,'strip-'+frame.index))<4);
    assert.ok(Math.abs(playbackPixel-await pixel(file,24+frame.previewFrame,'source-'+frame.index))<4,'playback samples the requested original interval');
  }
  assert.deepEqual(await json(fetch(base+'/api/media/state')),before);assert.deepEqual(studio.getTimeline(f.id),f.record);assert.equal(studio.list('job').length,0);
});
test('source inspection rejects bad bounds and unknown input before caching, and cannot reuse corrupt source bytes',async()=>{
  const input={assetId:main.id,startUs:0,endUs:1000000,frameCount:4},before=studio.list('source-inspection').length;
  for(const bad of [{...input,frameCount:13},{...input,startUs:0.5},{...input,shell:'anything'}])await call('shutter_inspect_source',bad,/action_arguments/);
  for(const bad of [{...input,endUs:16000000},{...input,endUs:1000},{...input,startUs:3000000,endUs:5000000}])await call('shutter_inspect_source',bad,/source_inspection_range/);
  assert.equal(studio.list('source-inspection').length,before);
  const first=await call('shutter_inspect_source',{...input,includeImages:false}),record=studio.read(first.id,'source-inspection'),cache=path.join(studio.root,'source-inspections',record.folder,'frame-0.jpg');
  await fs.writeFile(cache,'bad cache');const rebuilt=await call('shutter_inspect_source',{...input,includeImages:false});assert.equal(rebuilt.cached,false);assert.equal(rebuilt.id,first.id);
  const sourceFile=studio.assetPath(main.id),original=await fs.readFile(sourceFile);
  try{await fs.writeFile(sourceFile,Buffer.concat([original,Buffer.from('changed')]));await call('shutter_inspect_source',input,/asset_integrity/);}
  finally{await fs.writeFile(sourceFile,original);}
});
test('source inspection cancellation and a profile change during decoding leave no partial result',async()=>{
  const cache=path.join(studio.root,'source-inspections');await fs.mkdir(cache,{recursive:true});
  for(const mode of ['cancel','profile']){
    const original=studio.read('media_'+main.id,'media-profile'),folders=await fs.readdir(cache),count=studio.list('source-inspection').length,abort=new AbortController();let changed=false;
    const watcher=watch(cache,(_event,name)=>{if(!changed&&String(name).startsWith('range-')&&!folders.includes(String(name))){changed=true;if(mode==='cancel')abort.abort();else studio.write('media-profile',{...original,cadence:'changed-during-decoding'});}});
    try{
      const pending=fetch(base+`/api/media/assets/${main.id}/inspect`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startUs:100000,endUs:2700000,frameCount:5}),signal:abort.signal});
      if(mode==='cancel')await assert.rejects(pending,/abort/i);else assert.equal((await json(pending,409)).error,'source_inspection_context_conflict');
      const until=Date.now()+5000;while(Date.now()<until&&(await fs.readdir(cache)).length!==folders.length)await new Promise(r=>setTimeout(r,20));
      assert.equal(changed,true);assert.deepEqual(await fs.readdir(cache),folders);assert.equal(studio.list('source-inspection').length,count);
    }finally{watcher.close();studio.write('media-profile',original);}
  }
});
