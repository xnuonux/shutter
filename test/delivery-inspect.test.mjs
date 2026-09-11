import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectProcess,probeDelivery,measureDeliveryAudio,inspectPictureEvents} from '../src/media-inspect.mjs';
import {runMedia,fileDigest} from '../src/media-io.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
let root;
before(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-delivery-inspect-'));});
after(async()=>{await fs.rm(root,{recursive:true,force:true});});
async function wave(name,samples,value,opts){const file=path.join(root,name+'.wav');await fs.writeFile(file,pcm24(samples,value,opts));return file;}
test('real stereo loudness scanner measures a synthetic tone without modifying its WAV',async()=>{
  const file=await wave('tone',48000*4,i=>Math.round(0.1*8388607*Math.sin(2*Math.PI*997*i/48000)));
  const before=await fileDigest(file),a=await measureDeliveryAudio(file,0,4);
  assert.equal(a.status,'measured');assert.ok(a.integratedLufs>-21&&a.integratedLufs<-19);assert.ok(Math.abs(a.samplePeakDbfs+20)<0.11);
  assert.ok(a.curve.points.length>30);assert.equal(await fileDigest(file),before);
});
test('analytic intersample fixture demonstrates why sample-peak-only checking is insufficient',async()=>{
  const file=await wave('intersample',96000,i=>Math.round(0.99*8388607*Math.sin(2*Math.PI*12000*i/48000+Math.PI/4)));
  const a=await measureDeliveryAudio(file,0,2);assert.ok(a.samplePeakDbfs<-3);assert.ok(a.truePeakDbtp-a.samplePeakDbfs>2);
});
test('digital silence is nullable loudness with a real silent interval, never 0 LUFS',async()=>{
  const file=await wave('silence',96000,()=>0),a=await measureDeliveryAudio(file,0,2);
  assert.equal(a.integratedLufs,null);assert.equal(a.truePeakDbtp,null);assert.equal(a.loudnessState,'below-gate-or-short');
  assert.deepEqual(a.events,[{kind:'near-silence',startSeconds:0,endSeconds:2,endedAtEof:true}]);
});
test('an intentionally quiet tail is localized and source bytes remain unchanged',async()=>{
  const file=await wave('tail',96000,i=>i>=48000?0:Math.round(0.1*8388607*Math.sin(2*Math.PI*997*i/48000))),before=await fileDigest(file);
  const a=await measureDeliveryAudio(file,0,2);assert.equal(a.events[0].startSeconds,1);assert.equal(a.events[0].endSeconds,2);assert.equal(await fileDigest(file),before);
});
test('encoded audio and PCM are measured separately, including rounding gaps near silence',async()=>{
  const wav=await wave('encoded-source',192000,i=>i>=144000?0:Math.round(0.1*8388607*Math.sin(2*Math.PI*997*i/48000)));
  const aac=path.join(root,'encoded.m4a');await runMedia('ffmpeg',['-v','error','-i',wav,'-c:a','aac','-b:a','320k',aac]);
  const a=await measureDeliveryAudio(aac,0,4);assert.equal(a.status,'measured');assert.ok(Number.isFinite(a.integratedLufs));assert.ok(Number.isFinite(a.truePeakDbtp));
  assert.ok(a.events.some(e=>e.kind==='near-silence'&&e.startSeconds>=2.99));assert.ok(a.curve.points.every(p=>Number.isFinite(p.lufs)));
});
test('black and held-picture EOF intervals extend to exact probed duration',async()=>{
  const file=path.join(root,'black.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=160x90:r=24:d=2','-c:v','libx264','-threads','1',file]);
  const before=await fileDigest(file),p=await probeDelivery(file,{countFrames:true}),events=await inspectPictureEvents(file,0,Number(p.streams[0].duration));
  assert.equal(p.streams[0].nb_read_frames,'48');assert.ok(events.events.some(e=>e.kind==='near-black'&&e.startSeconds===0&&e.endSeconds===2));
  assert.ok(events.events.some(e=>e.kind==='static-picture'&&e.endSeconds===2));assert.equal(await fileDigest(file),before);
});
test('moving test-pattern footage is not mislabeled as a freeze or full-black frame',async()=>{
  const file=path.join(root,'moving.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=160x90:r=24:d=2','-c:v','libx264','-threads','1',file]);
  const p=await inspectPictureEvents(file,0,2);assert.deepEqual(p.events,[]);
});
test('corrupt media fails decoding instead of manufacturing measurements',async()=>{
  const file=path.join(root,'invalid.wav');await fs.writeFile(file,'not media');
  await assert.rejects(measureDeliveryAudio(file,0,1),/delivery_decode_failed/);
});
test('process wrapper enforces byte limits, callback errors and finite deadlines',async()=>{
  await assert.rejects(inspectProcess('ffmpeg',['-version'],{maxCapture:1}),/delivery_output_limit/);
  await assert.rejects(inspectProcess('ffmpeg',['-version'],{onLine:()=>{throw Error('fixture_callback');}}),/fixture_callback/);
  await assert.rejects(inspectProcess('ffmpeg',['-f','lavfi','-i','anullsrc','-f','null','-'],{timeoutMs:30}),/delivery_timeout/);
});
test('process wrapper cancels before launch and terminates an active decoder',async()=>{
  const before=new AbortController();before.abort();await assert.rejects(inspectProcess('ffmpeg',['-version'],{signal:before.signal}),/delivery_cancelled/);
  const active=new AbortController(),promise=inspectProcess('ffmpeg',['-f','lavfi','-i','anullsrc','-f','null','-'],{signal:active.signal});
  const timer=setTimeout(()=>active.abort(),50);try{await assert.rejects(promise,/delivery_cancelled/);}finally{clearTimeout(timer);}
});
test('unavailable executables and unrecognized tool names fail explicitly',async()=>{
  assert.throws(()=>inspectProcess('sh',['-c','echo bad']),/media_tool/);
  const old=process.env.SHUTTER_FFMPEG;process.env.SHUTTER_FFMPEG=path.join(root,'missing-executable');
  try{await assert.rejects(inspectProcess('ffmpeg',['-version']),/ffmpeg_unavailable/);}finally{if(old===undefined)delete process.env.SHUTTER_FFMPEG;else process.env.SHUTTER_FFMPEG=old;}
});
