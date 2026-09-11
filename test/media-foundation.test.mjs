import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Studio } from '../src/store.mjs';
import { rational, rateText, frameSamples, runMedia, importMedia, importMediaFile, deriveVideoProxy, getMediaProfile, verifyMediaAsset, deriveImage, mediaExclusive, fileDigest } from '../src/media-io.mjs';
import { MEDIA_EDIT_FORMAT, emptyMediaEdit, compileMediaEdit, renderMediaEdit, makeBridgeXml, makeBridgeOtio } from '../src/media-edit.mjs';

let root, studio, fixtures, video, videoB, image, audio, audio441;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP4z8Dwn4GBgYGJAQoAHgQCAf2H6y0AAAAASUVORK5CYII=','base64');
function wave24(samples=48000,rate=48000) {
  const data=Buffer.alloc(samples*6);
  for(let i=0;i<samples;i++) {
    const value=i<24000?Math.round(0.2*8388607*Math.sin(2*Math.PI*440*i/rate)):0;
    data.writeIntLE(value,i*6,3);data.writeIntLE(value,i*6+3,3);
  }
  const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(data.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*6,28);h.writeUInt16LE(6,32);h.writeUInt16LE(24,34);h.write('data',36);h.writeUInt32LE(data.length,40);return Buffer.concat([h,data]);
}
function createEdit(title='Camera & music <test>') {
  const p=studio.createProduction({title,shots:[],cast:[]});
  const e=emptyMediaEdit();
  studio.write('timeline',{id:'timeline_'+p.id,projectId:p.id,revision:1,timeline:e,past:[],future:[]});
  return p;
}
function timeline(p) {
  return {...emptyMediaEdit(),width:640,height:360,fps:'24000/1001',clips:[
    {id:'camera',assetId:video.id,sourceStart:'0',frames:24,fit:'contain'},
    {id:'generated_fixture',assetId:videoB.id,sourceStart:'0',frames:24,fit:'cover'},
    {id:'photo',assetId:image.id,sourceStart:'0',frames:12,fit:'contain'}
  ],soundtrack:{assetId:audio.id,tailPolicy:'pad-silence'}};
}
before(async()=>{
  root=await fsp.mkdtemp(path.join(os.tmpdir(),'shutter-media-test-'));fixtures=path.join(root,'fixtures');await fsp.mkdir(fixtures);studio=new Studio(path.join(root,'studio'));
  const make=async(name,w,h,rate,format)=>{
    const target=path.join(fixtures,name);
    await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc2=size=${w}x${h}:rate=${rate}`,'-t','2','-an','-c:v','libx264','-pix_fmt',format,'-threads','2','-filter_threads','1',target]);return target;
  };
  video=await importMediaFile(studio,await make('camera-10bit.mp4',1280,720,'30000/1001','yuv422p10le'),{name:'FX30-style synthetic codec test.mp4'});
  videoB=await importMediaFile(studio,await make('smaller.mp4',320,180,'24','yuv420p'),{name:'Lower-resolution generated-shot stand-in.mp4'});
  const still=path.join(fixtures,'photo.png');
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=800x600','-frames:v','1','-threads','1',still]);
  image=await importMediaFile(studio,still,{name:'photo.png'});
  const wav=path.join(fixtures,'master.wav');await fsp.writeFile(wav,wave24());audio=await importMediaFile(studio,wav,{name:'master.wav'});
  const wav441=path.join(fixtures,'441.wav');await fsp.writeFile(wav441,wave24(44100,44100));audio441=await importMediaFile(studio,wav441,{name:'441.wav'});
});
after(async()=>{studio?.close();if(root)await fsp.rm(root,{recursive:true,force:true});});
test('fractional frame rates remain exact',()=>{assert.deepEqual(rational('24000/1001'),{n:24000,d:1001});assert.equal(rateText(rational('48000/2002')),'24000/1001');assert.deepEqual(rational('0',{zero:true}),{n:0,d:1});});
test('invalid and unsafe rates are rejected',()=>{for(const value of ['0','NaN','24;rm -rf','1/0','-24','1e3','Infinity','1/10000000000'])assert.throws(()=>rational(value));});
test('frame-to-sample accounting uses exact integer arithmetic',()=>{assert.equal(frameSamples(60,rational('24000/1001')),120120);assert.equal(frameSamples(864000,rational('30000/1001')),1383782400);});
test('ingest measures 10-bit 4:2:2 and fractional source rate',()=>{const p=getMediaProfile(studio,video.id);assert.equal(p.pixelFormat,'yuv422p10le');assert.equal(rateText(p.fps),'30000/1001');assert.equal(p.width,1280);assert.equal(p.cadence,'unassessed');});
test('master WAV keeps sample rate, depth and original bytes',async()=>{const p=getMediaProfile(studio,audio.id);assert.equal(p.audio[0].sampleRate,48000);assert.equal(p.audio[0].bits,24);assert.deepEqual(await fsp.readFile(studio.assetPath(audio.id)),wave24());});
test('44.1 kHz is retained at ingest',()=>assert.equal(getMediaProfile(studio,audio441.id).audio[0].sampleRate,44100));
test('duplicate content retains the original asset record',async()=>{const second=await importMediaFile(studio,studio.assetPath(audio.id),{name:'different.wav'});assert.equal(second.id,audio.id);assert.equal(second.name,'master.wav');});
test('oversized imports clean staging and create no asset',async()=>{const count=studio.list('asset').length;await assert.rejects(importMedia(studio,Readable.from([Buffer.alloc(20)]),{name:'x.wav'},{maxBytes:10}),/asset_size/);assert.equal(studio.list('asset').length,count);assert.deepEqual(await fsp.readdir(path.join(studio.root,'media-tmp')),[]);});
test('empty and malformed input are rejected before registration',async()=>{const count=studio.list('asset').length;await assert.rejects(importMedia(studio,Readable.from([])),/asset_size/);await assert.rejects(importMedia(studio,Readable.from([Buffer.from('not media')])));assert.equal(studio.list('asset').length,count);});
test('aborted input does not leave a ready asset',async()=>{const count=studio.list('asset').length;async function* failed(){yield Buffer.alloc(32);throw Error('disconnected');}await assert.rejects(importMedia(studio,failed()),/disconnected/);assert.equal(studio.list('asset').length,count);assert.deepEqual(await fsp.readdir(path.join(studio.root,'media-tmp')),[]);});
test('RAW does not masquerade as a supported TIFF/JPEG',async()=>{await assert.rejects(importMedia(studio,Readable.from([png]),{name:'photo.ARW'}),/decoder_not_implemented/);});
test('decoding jobs are bounded to one per store root',async()=>{await mediaExclusive(studio,async()=>{await assert.rejects(mediaExclusive(studio,async()=>{}),/media_busy/);});await mediaExclusive(studio,async()=>{});});
test('asset-backed compilation requires no fake generation job',()=>{const p=createEdit(),plan=compileMediaEdit(studio,p.id,timeline(p));assert.equal(plan.frames,60);assert.equal(plan.audioSamples,120120);assert.equal(studio.listJobs().length,0);assert.equal(plan.sources.length,4);});
test('mixed resolution and frame rates do not imply neural upscale',()=>{const p=createEdit(),plan=compileMediaEdit(studio,p.id,timeline(p));assert.equal(plan.clips[0].scale,0.5);assert.equal(plan.clips[1].scale,2);assert.ok(plan.warnings.some(s=>s.includes('no AI')));});
test('unsupported scaling policy and source handles are rejected',()=>{const p=createEdit(),e=timeline(p);e.clips[0].fit='magic';assert.throws(()=>compileMediaEdit(studio,p.id,e),/media_fit/);e.clips[0].fit='contain';e.clips[0].sourceStart='9';assert.throws(()=>compileMediaEdit(studio,p.id,e),/media_source_range/);});
test('duplicate clip identity and fractional frame counts are rejected',()=>{const p=createEdit(),e=timeline(p);e.clips[1].id=e.clips[0].id;assert.throws(()=>compileMediaEdit(studio,p.id,e),/clip_identity/);e.clips[1].id='other';e.clips[0].frames=12.5;assert.throws(()=>compileMediaEdit(studio,p.id,e),/clip_frames/);});
test('timeline save, conflict, undo and redo use the existing record',()=>{const p=createEdit(),e=timeline(p),r=studio.saveTimeline(p.id,1,e);assert.equal(r.plan.version,5);assert.equal(r.revision,2);assert.throws(()=>studio.saveTimeline(p.id,1,e),/revision_conflict/);const u=studio.undoTimeline(p.id,2);assert.equal(u.timeline.clips.length,0);const back=studio.redoTimeline(p.id,3);assert.equal(back.plan.frames,60);});
test('end frame is the last decoded picture, not estimated duration minus epsilon',async()=>{const end=await deriveImage(studio,video.id,{frame:'last',acknowledgeUnmanagedColor:true});assert.equal(end.recipe.decodedFrameIndex,59);assert.equal(end.kind,'image');assert.equal(getMediaProfile(studio,end.id).width,1280);});
test('camera reference extraction requires a color-review acknowledgement',async()=>{await assert.rejects(deriveImage(studio,video.id,{frame:0}),/color_review_required/);});
test('photo adjustments create a new asset and leave original untouched',async()=>{const before=await fileDigest(studio.assetPath(image.id));const edit=await deriveImage(studio,image.id,{adjustments:{crop:{x:10,y:10,width:400,height:200},rotate:90,brightness:0.1,saturation:0.5}});assert.notEqual(edit.id,image.id);assert.equal(edit.media.width,200);assert.equal(edit.media.height,400);assert.equal(await fileDigest(studio.assetPath(image.id)),before);});
test('unknown photo controls and out-of-image crops fail explicitly',async()=>{await assert.rejects(deriveImage(studio,image.id,{adjustments:{fakeAI:true}}),/unsupported/);await assert.rejects(deriveImage(studio,image.id,{adjustments:{crop:{x:790,y:0,width:50,height:20}}}),/photo_crop/);});
test('asset tampering is detected with bounded-memory verification',async()=>{const filename=studio.assetPath(audio441.id),b=await fsp.readFile(filename);try{await fsp.writeFile(filename,Buffer.from('tampered'));await assert.rejects(verifyMediaAsset(studio,audio441.id),/asset_integrity/);}finally{await fsp.writeFile(filename,b);}});
test('interchange names are XML-escaped and frame rate is NTSC rational',()=>{const p=createEdit(),plan=compileMediaEdit(studio,p.id,timeline(p));const xml=makeBridgeXml(plan,['a.mp4','b.mp4','c.mp4']);assert.ok(xml.includes('Camera &amp; music &lt;test&gt;'));assert.ok(xml.includes('<timebase>24</timebase><ntsc>TRUE</ntsc>'));const otio=makeBridgeOtio(plan,['a.mp4','b.mp4','c.mp4']);assert.equal(otio.metadata.shutter.fpsExact,'24000/1001');assert.equal(otio.tracks.children[1].children[0].source_range.duration.value,120120);});
test('real mixed-media render has exact pictures and aligned lossless WAV',async()=>{
  const p=createEdit(),r=studio.saveTimeline(p.id,1,timeline(p));
  const cut=await renderMediaEdit(studio,p.id,{baseRevision:r.revision,acknowledgeUnmanagedColor:true});
  assert.equal(cut.plan.frames,60);assert.equal(cut.revision,2);
  const folder=path.join(studio.root,'media-renders',cut.bridgeFolder);
  const meta=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',studio.assetPath(cut.output)]));
  assert.equal(Number(meta.streams.find(s=>s.codec_type==='video').nb_read_frames),60);
  // Independent RIFF chunk parser compares the PCM prefix and exact zero padding.
  const wave=await fsp.readFile(path.join(folder,'master-48k.wav'));let i=12,pcm;
  while(i+8<=wave.length){const n=wave.readUInt32LE(i+4);if(wave.toString('ascii',i,i+4)==='data'){pcm=wave.subarray(i+8,i+8+n);break;}i+=8+n+(n%2);}
  assert.equal(pcm.length,120120*6);assert.deepEqual(pcm.subarray(0,48000*6),wave24().subarray(44));assert.ok(pcm.subarray(48000*6).every(b=>b===0));
  assert.equal(await fileDigest(studio.assetPath(audio.id)),audio.sha256);
  // Preserve a small audited demonstration outside the disposable fixture directory.
  if(process.env.SHUTTER_TEST_ARTIFACTS){await fsp.mkdir(process.env.SHUTTER_TEST_ARTIFACTS,{recursive:true});await fsp.copyFile(studio.assetPath(cut.output),path.join(process.env.SHUTTER_TEST_ARTIFACTS,'mixed-media-preview.mp4'));for(const name of ['timeline.xml','timeline.otio','manifest.json','shutter-handoff.zip'])await fsp.copyFile(path.join(folder,name),path.join(process.env.SHUTTER_TEST_ARTIFACTS,name));}
});
test('render rejects stale revision, empty edits and missing color consent',async()=>{const p=createEdit();await assert.rejects(renderMediaEdit(studio,p.id,{baseRevision:0,acknowledgeUnmanagedColor:true}),/revision_conflict/);await assert.rejects(renderMediaEdit(studio,p.id,{baseRevision:1}),/color_review_required/);await assert.rejects(renderMediaEdit(studio,p.id,{baseRevision:1,acknowledgeUnmanagedColor:true}),/edit_empty/);});

test('10-bit source gets a browser proxy without replacing original',async()=>{
 const before=await fileDigest(studio.assetPath(video.id));
 const out=await deriveVideoProxy(studio,video.id,{acknowledgeUnmanagedColor:true});
 assert.equal(out.media.pixelFormat,'yuv420p');assert.ok(out.media.width<=1280);assert.ok(out.media.height<=720);assert.equal(out.recipe.sourceAssetId,video.id);
 assert.notEqual(out.id,video.id);assert.equal(await fileDigest(studio.assetPath(video.id)),before);
});
test('export carries transitive original lineage and persisted edits reopen',async()=>{
 const one=await deriveImage(studio,image.id,{adjustments:{brightness:0.05}});
 const two=await deriveImage(studio,one.id,{adjustments:{brightness:0.1}});
 const p=createEdit(),e={...emptyMediaEdit(),width:640,height:360,clips:[{id:'photo_edit',assetId:two.id,sourceStart:'0',frames:24,fit:'contain'}]};
 studio.saveTimeline(p.id,1,e);const exported=studio.exportProduction(p.id);
 for(const id of [image.id,one.id,two.id])assert.ok(exported.assets.some(a=>a.id===id));
 assert.ok(exported.mediaDerivations.length>=2);
 const reopened=new Studio(studio.root);try{assert.equal(reopened.getTimeline(p.id).revision,2);assert.equal(reopened.getTimeline(p.id).plan.frames,24);}finally{reopened.close();}
});
test('synthetic 4K 10-bit 4:2:2 input decodes into an exact 1080p rough cut',async()=>{
 const target=path.join(fixtures,'4k-10bit.mp4');
 await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=3840x2160:rate=24','-frames:v','6','-an','-c:v','libx264','-pix_fmt','yuv422p10le','-preset','ultrafast','-threads','2',target]);
 const source=await importMediaFile(studio,target,{name:'synthetic-4k-10bit.mp4'});
 assert.equal(source.media.width,3840);assert.equal(source.media.pixelFormat,'yuv422p10le');
 const p=createEdit(),e={...emptyMediaEdit(),fps:'24',width:1920,height:1080,clips:[{id:'four_k',assetId:source.id,sourceStart:'0',frames:6,fit:'contain'}]};
 const r=studio.saveTimeline(p.id,1,e),cut=await renderMediaEdit(studio,p.id,{baseRevision:r.revision,acknowledgeUnmanagedColor:true});
 const profile=getMediaProfile(studio,cut.output);assert.equal(profile.width,1920);assert.equal(profile.height,1080);assert.equal(profile.declaredFrames,6);
});
test('known HDR and invalid photo settings fail before making false SDR outputs',async()=>{
 const profile=getMediaProfile(studio,video.id);
 try{studio.write('media-profile',{...profile,color:{...profile.color,transfer:'smpte2084'}});const p=createEdit();assert.throws(()=>compileMediaEdit(studio,p.id,timeline(p)),/hdr_transform_required/);await assert.rejects(deriveVideoProxy(studio,video.id,{acknowledgeUnmanagedColor:true}),/hdr_transform_required/);}
 finally{studio.write('media-profile',profile);}
});
