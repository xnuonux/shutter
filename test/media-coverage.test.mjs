import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as edits from '../public/music-edit.mjs';
import {Studio} from '../src/store.mjs';
import {emptyMediaEdit,renderMediaEdit,mediaPictureFilters} from '../src/media-edit.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {importMediaFile,runMedia,getMediaProfile} from '../src/media-io.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
import {mediaHealthScope} from '../src/media-recovery.mjs';
import {planGenerativeInsert} from '../src/generative-inserts.mjs';

const profiles={main:{kind:'video',duration:60},angle:{kind:'video',duration:15}};
function scene(){return {...emptyMediaEdit(),fps:'24',width:160,height:90,
 clips:[0,1,2,3].map(i=>({id:'main'+i,assetId:'main',sourceStart:String(i*15),frames:360,fit:'contain'})),
 soundtrack:{assetId:'song',tailPolicy:'pad-silence'},markers:[{id:'cue',label:'Action continues',kind:'cue',frame:408}]};}

test('coverage replaces scene 14–17 seconds and returns at elapsed main time without moving the song',()=>{
 const original=scene(),before=structuredClone(original);
 const edit=edits.applyEdit(original,{type:'coverage-add',coverage:{id:'angle1',assetId:'angle',sourceStart:'1',at:336,frames:72,fit:'contain'}},profiles);
 assert.equal(edits.totalFrames(edit),1440);assert.deepEqual(edit.clips,before.clips);assert.deepEqual(edit.soundtrack,before.soundtrack);assert.deepEqual(edit.markers,before.markers);
 assert.equal(edits.clipAt(edit,335).id,'main0');assert.equal(edits.clipAt(edit,336).id,'angle1');assert.equal(edits.clipAt(edit,407).id,'angle1');
 const resumed=edits.clipAt(edit,408);assert.equal(resumed.id,'main1');assert.equal(resumed.sourceStart,'15');assert.equal(408-resumed.at,48);
 const pieces=edits.pictureClips(edit);
 assert.deepEqual(pieces.map(c=>[c.id,c.at,c.frames,c.sourceStart,c.sampling.offsetFrames]),[
 ['main0',0,336,'0/1',0],['angle1',336,72,'1/1',0],['main1',408,312,'17/1',48],['main2',720,360,'30/1',0],['main3',1080,360,'45/1',0]]);
 assert.deepEqual(edits.applyEdit(edit,{type:'coverage-remove',coverageId:'angle1'},profiles).clips,before.clips);
 assert.deepEqual(original,before);
});

test('coverage rejects overlap, unavailable source handles and picture shortening without changing the draft',()=>{
 const original=scene(),first={id:'one',assetId:'angle',sourceStart:'0',at:300,frames:100,fit:'contain'};
 const edit=edits.applyEdit(original,{type:'coverage-add',coverage:first},profiles),before=structuredClone(edit);
 assert.throws(()=>edits.applyEdit(edit,{type:'coverage-add',coverage:{...first,id:'two',at:399}},profiles),/coverage_overlap/);
 assert.throws(()=>edits.applyEdit(edit,{type:'coverage-add',coverage:{...first,id:'two',at:1400}},profiles),/coverage_range/);
 assert.throws(()=>edits.applyEdit(edit,{type:'coverage-add',coverage:{...first,id:'two',at:600,sourceStart:'14'}},profiles),/media_source_range/);
 const ending=edits.applyEdit(original,{type:'coverage-add',coverage:{...first,at:1300}},profiles);
 assert.throws(()=>edits.applyEdit(ending,{type:'remove',clipId:'main3'},profiles),/coverage_range/);
 assert.deepEqual(edit,before);
});

test('saved coverage exports the resolved pictures, retains cadence and restores the original through history',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-coverage-')),studio=new Studio(path.join(root,'studio'));
 try {
  const main=path.join(root,'main.mp4'),angle=path.join(root,'angle.mp4'),song=path.join(root,'song.wav');
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=30000/1001:d=3','-c:v','libx264','-threads','1',main]);
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=purple:s=160x90:r=24:d=2','-c:v','libx264','-threads','1',angle]);
  await fs.writeFile(song,pcm24(144000,(i,c)=>Math.round(Math.sin(i/17+c)*100000)));
  const a=await importMediaFile(studio,main),b=await importMediaFile(studio,angle),s=await importMediaFile(studio,song);
  const {production,timeline}=createMediaProduction(studio,{title:'Coverage proof',fps:'24',width:160,height:90});
  const base={...timeline.timeline,clips:[{id:'main',assetId:a.id,sourceStart:'0',frames:72,fit:'contain'}],soundtrack:{assetId:s.id,tailPolicy:'pad-silence'}};
  const saved=studio.saveTimeline(production.id,timeline.revision,base);
  const original=await renderMediaEdit(studio,production.id,{baseRevision:saved.revision,acknowledgeUnmanagedColor:true});
  const covered={...base,coverage:[{id:'angle',assetId:b.id,sourceStart:'0',at:20,frames:12,fit:'contain'}]};
  const revision=studio.saveTimeline(production.id,saved.revision,covered);
  assert.ok(mediaHealthScope(studio,production.id,revision.revision).items.some(x=>x.assetId===b.id&&x.roles.includes('coverage 1')));
  assert.deepEqual(revision.plan.pictureClips.map(c=>[c.assetId,c.at,c.frames]),[[a.id,0,20],[b.id,20,12],[a.id,32,40]]);
  const resumed=revision.plan.pictureClips[2],filter=mediaPictureFilters(revision.plan,resumed,getMediaProfile(studio,a.id));
  const hashes=text=>text.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
  const decode=filter=>runMedia('ffmpeg',['-v','error','-i',studio.assetPath(a.id),'-vf',filter,'-an','-threads','1','-filter_threads','1','-f','framemd5','-']);
  const whole=hashes(await decode('setpts=PTS-STARTPTS,fps=24:start_time=0:round=near,trim=end_frame=72,format=yuv420p'));
  assert.deepEqual(hashes(await decode(filter)),whole.slice(32));
  const result=await renderMediaEdit(studio,production.id,{baseRevision:revision.revision,acknowledgeUnmanagedColor:true});
  const probe=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',studio.assetPath(result.output)]));
  assert.equal(Number(probe.streams.find(s=>s.codec_type==='video').nb_read_frames),72);
  const pixel=async frame=>{const file=path.join(root,'pixel-'+frame+'.rgb');await runMedia('ffmpeg',['-v','error','-i',studio.assetPath(result.output),'-vf',`select=eq(n\\,${frame}),crop=2:2:80:44,format=rgb24`,'-frames:v','1','-f','rawvideo',file]);return [...(await fs.readFile(file)).subarray(0,3)];};
  const middle=await pixel(25);assert.ok(middle[0]>100&&middle[1]<15&&middle[2]>100,'actual exported cutaway is purple');
  const wave=cut=>fs.readFile(path.join(studio.root,'media-renders',cut.bridgeFolder,'master-48k.wav'));
  assert.deepEqual(await wave(result),await wave(original));
  const otio=JSON.parse(await fs.readFile(path.join(studio.root,'media-renders',result.bridgeFolder,'timeline.otio'),'utf8'));
  assert.deepEqual(otio.tracks.children[0].children.map(c=>c.source_range.duration.value),[20,12,40]);
  const restored=studio.undoTimeline(production.id,revision.revision);assert.deepEqual(restored.timeline,base);
  const edgeCut=studio.saveTimeline(production.id,restored.revision,{...base,coverage:[{id:'ending',assetId:b.id,sourceStart:'0',at:60,frames:12,fit:'contain'}]});
  const request={requestKey:'covered-end',baseRevision:edgeCut.revision,clipId:'main',kind:'continue',prompt:'Continue the accepted ending view.',duration:5,resolution:'480P',quality:'balanced',maxUsd:.5,acknowledgeUnmanagedColor:true};
  const plan=await planGenerativeInsert(studio,production.id,request);
  assert.equal(plan.references[0].sourceAssetId,b.id,'generation references the visible ending, not hidden main footage');
  assert.equal(plan.references[0].outputFrame,71);
  await assert.rejects(planGenerativeInsert(studio,production.id,{...request,kind:'new-angle',requestKey:'mixed-tail'}),/motion_tail_contains_coverage/);
  const alternate=await planGenerativeInsert(studio,production.id,{...request,kind:'alternate',requestKey:'covered-alternate'});
  assert.deepEqual(alternate.references.map(r=>[r.sourceAssetId,r.outputFrame]),[[a.id,0],[b.id,71]]);
  const bridgeCut=studio.saveTimeline(production.id,edgeCut.revision,{...base,clips:[{...base.clips[0],frames:36},{...base.clips[0],id:'next',sourceStart:'1.5',frames:36}],coverage:[{id:'crossing',assetId:b.id,sourceStart:'0',at:30,frames:12,fit:'contain'}]});
  const bridge=await planGenerativeInsert(studio,production.id,{...request,baseRevision:bridgeCut.revision,kind:'bridge',requestKey:'covered-bridge'});
  assert.deepEqual(bridge.references.map(r=>[r.sourceAssetId,r.outputFrame]),[[b.id,35],[b.id,36]],'both sides of a covered boundary use the visible angle');
  const arrive=await planGenerativeInsert(studio,production.id,{...request,baseRevision:bridgeCut.revision,clipId:'next',kind:'arrive',requestKey:'covered-start'});
  assert.deepEqual(arrive.references.map(r=>[r.sourceAssetId,r.outputFrame]),[[b.id,36]]);
 } finally {studio.close();await fs.rm(root,{recursive:true,force:true});}
});
