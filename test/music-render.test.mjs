/** Decoded-picture regressions: fractional sources must not jump when a shot is split. */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Studio} from '../src/store.mjs';
import {runMedia,importMediaFile,getMediaProfile,fileDigest} from '../src/media-io.mjs';
import {emptyMediaEdit,compileMediaEdit,mediaPictureFilters,renderMediaEdit,makeCueCsv,makeBridgeXml,makeBridgeOtio} from '../src/media-edit.mjs';
import {applyEdit} from '../public/music-edit.mjs';
let root,studio,asset,profiles,production,originalHash;
const hashes=text=>text.split('\n').filter(s=>s&&!s.startsWith('#')).map(s=>s.split(',').at(-1).trim());
function edit(){return {...emptyMediaEdit(),width:160,height:90,clips:[{id:'take',assetId:asset.id,sourceStart:'1/3',frames:72,fit:'contain'}],markers:[{id:'chorus',label:'Chorus <one>',kind:'chorus',frame:37},{id:'later',label:'=Do not execute',kind:'note',frame:120}],music:{schema:'shutter-music-map-v1',bpm:'123.456',beatsPerBar:4,beatUnit:4,offsetFrames:7}};}
function cutMany(e){e=applyEdit(e,{type:'split',clipId:'take',frame:17,newId:'b'},profiles);e=applyEdit(e,{type:'split',clipId:'b',frame:38,newId:'c'},profiles);return e;}
async function decoded(filter,frames){return hashes(await runMedia('ffmpeg',['-v','error','-i',studio.assetPath(asset.id),'-vf',filter,'-r','24000/1001','-fps_mode','cfr','-frames:v',String(frames),'-an','-threads','1','-filter_threads','1','-f','framemd5','-']));}
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-music-render-'));studio=new Studio(path.join(root,'studio'));
 const source=path.join(root,'source.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=30000/1001','-t','5','-c:v','libx264','-crf','12','-threads','1',source]);
 asset=await importMediaFile(studio,source,{name:'synthetic fractional-rate camera.mp4'});originalHash=await fileDigest(studio.assetPath(asset.id));profiles=new Map([[asset.id,getMediaProfile(studio,asset.id)]]);
 production=studio.createProduction({title:'Music clock regression',shots:[],cast:[]});studio.write('timeline',{id:'timeline_'+production.id,projectId:production.id,revision:1,timeline:emptyMediaEdit(),past:[],future:[]});
});
after(async()=>{studio?.close();if(root)await fs.rm(root,{recursive:true,force:true});});
test('compiler retains source sampling origin and offsets through multiple splits',()=>{
 const plan=compileMediaEdit(studio,production.id,cutMany(edit()));assert.deepEqual(plan.clips.map(c=>c.sampling),[{origin:'1/3',offsetFrames:0},{origin:'1/3',offsetFrames:17},{origin:'1/3',offsetFrames:38}]);assert.equal(plan.frames,72);assert.equal(plan.version,5);
});
test('actual decoded pictures before and after multiple mixed-rate splits are identical',async()=>{
 const original=compileMediaEdit(studio,production.id,edit()),split=compileMediaEdit(studio,production.id,cutMany(edit())),profile=getMediaProfile(studio,asset.id);
 const whole=await decoded(mediaPictureFilters(original,original.clips[0],profile),72),pieces=[];
 for(const c of split.clips)pieces.push(...await decoded(mediaPictureFilters(split,c,profile),c.frames));
 assert.equal(whole.length,72);assert.deepEqual(pieces,whole);
 // Independently conform once without the planner/filter-builder or a split, then slice by hand.
 const reference=await decoded('setpts=PTS-STARTPTS,trim=start=0.3333333333333333,setpts=PTS-STARTPTS,fps=24000/1001:start_time=0:round=near,format=yuv420p',72);
 assert.deepEqual(whole,reference);assert.deepEqual(pieces.slice(17,38),reference.slice(17,38));
});
test('saved mixed-rate split cut renders exactly 72 pictures and preserves the immutable source',async()=>{
 const record=studio.saveTimeline(production.id,1,cutMany(edit()));const cut=await renderMediaEdit(studio,production.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});
 const probe=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_streams','-of','json',studio.assetPath(cut.output)]));
 assert.equal(probe.streams[0].avg_frame_rate,'24000/1001');assert.equal(Number(probe.streams[0].nb_read_frames),72);assert.equal(await fileDigest(studio.assetPath(asset.id)),originalHash);
 const csv=await fs.readFile(path.join(studio.root,'media-renders',cut.bridgeFolder,'cues.csv'),'utf8');assert.match(csv,/"37"/);assert.match(csv,/outside-picture/);assert.ok(cut.bridgeFiles.includes('cues.csv'));
});
test('cue interchange keeps frames, escapes XML, neutralizes CSV formulas and omits out-of-picture markers in timeline tracks',()=>{
 const plan=compileMediaEdit(studio,production.id,edit()),csv=makeCueCsv(plan),xml=makeBridgeXml(plan,['one.mp4']),otio=makeBridgeOtio(plan,['one.mp4']);
 assert.match(csv,/"'=Do not execute"/);assert.match(csv,/"120"/);assert.match(xml,/Chorus &lt;one&gt;/);assert.match(xml,/<in>37<\/in><out>-1<\/out>/);assert.doesNotMatch(xml,/Do not execute/);
 assert.equal(otio.tracks.markers.length,1);assert.equal(otio.tracks.markers[0].marked_range.start_time.value,37);assert.equal(otio.tracks.markers[0].marked_range.start_time.rate,24000/1001);
});
test('contradictory persisted sampling metadata fails before a saved revision can change',()=>{
 const record=studio.getTimeline(production.id),broken=structuredClone(record.timeline);broken.clips[1].sampling.offsetFrames++;
 assert.throws(()=>studio.saveTimeline(production.id,record.revision,broken),/sampling/);assert.equal(studio.getTimeline(production.id).revision,record.revision);
});
