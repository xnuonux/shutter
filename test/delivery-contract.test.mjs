import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliveryOptions,deliveryScope,loudnessFindings,deliveryStatus} from '../public/delivery-contract.mjs';
import {eventCollector,audioCollector,videoContract} from '../src/media-inspect.mjs';
import {pcmContract} from '../src/media-delivery.mjs';

const summary=`Summary:\n  Integrated loudness:\n I: -20.0 LUFS\n Loudness range:\n LRA: 1.0 LU\n Sample peak:\n Peak: -12.1 dBFS\n True peak:\n Peak: -11.2 dBFS\n`;
test('delivery defaults are observational with no loudness or peak prescription',()=>{
  assert.deepEqual(deliveryOptions(),{targetLufs:null,toleranceLu:1,truePeakCeilingDbtp:null,scanPicture:true});
  assert.deepEqual(loudnessFindings({status:'measured',integratedLufs:-8,truePeakDbtp:-0.2},deliveryOptions(),'pcm'),[]);
});
test('delivery options reject paths, URLs, unknown fields, coercions and nonfinite input',()=>{
  for(const bad of [null,[],{file:'/tmp/file'},{url:'https://example.invalid'}, {targetLufs:'-14'},
    {targetLufs:NaN},{targetLufs:-61},{truePeakCeilingDbtp:1},{toleranceLu:0},{scanPicture:'true'},
    JSON.parse('{"__proto__":{"polluted":true}}')])assert.throws(()=>deliveryOptions(bad),/delivery_/);
  assert.equal({}.polluted,undefined);
});
test('explicit custom targets yield review flags, not processing commands',()=>{
  const options=deliveryOptions({targetLufs:-23,toleranceLu:0.5,truePeakCeilingDbtp:-1});
  const audio={status:'measured',integratedLufs:-10,truePeakDbtp:0.5},before=structuredClone(audio);
  assert.deepEqual(loudnessFindings(audio,options,'encoded').map(f=>f.code),['true-peak-full-scale','loudness-outside-target','true-peak-above-ceiling']);
  assert.deepEqual(audio,before);assert.equal(loudnessFindings({status:'unassessed'},options,'pcm').length,0);
});
test('silent and short material never becomes a numeric loudness target success',()=>{
  const r=loudnessFindings({status:'measured',integratedLufs:null,truePeakDbtp:null},deliveryOptions(),'pcm');
  assert.equal(r[0].code,'loudness-unassessed');
});
test('scope binds report to output, revision and cut; unsaved edits are historical',()=>{
  const cut={id:'cut_one',output:'asset_one',revision:3},report={cutId:'cut_one',outputAssetId:'asset_one',revision:3};
  assert.equal(deliveryScope(report,cut,3),'saved-render');assert.equal(deliveryScope(report,cut,4),'older-saved-render');
  assert.equal(deliveryScope(report,cut,3,true),'older-saved-render');
  for(const bad of [{...report,cutId:'other'},{...report,outputAssetId:'other'},{...report,revision:2},null])assert.equal(deliveryScope(bad,cut,3),'wrong-cut');
});
test('incomplete checks and technical failures cannot be flattened into complete',()=>{
  assert.equal(deliveryStatus([{status:'unassessed'}],[]),'incomplete');
  assert.equal(deliveryStatus([{status:'fail'},{status:'unassessed'}],[]),'technical-issues');
  assert.equal(deliveryStatus([{status:'pass'}],[{severity:'review'}]),'review-needed');
  assert.equal(deliveryStatus([{status:'pass'},{status:'not-requested'}],[]),'checks-complete');
});
test('event metadata closes EOF intervals at duration, not at the last frame timestamp',()=>{
  const c=eventCollector(4);c.line('lavfi.black_start=0');c.line('lavfi.freezedetect.freeze_start=1');c.line('lavfi.silence_start=3');
  assert.deepEqual(c.finish(),[
    {kind:'near-black',startSeconds:0,endSeconds:4,endedAtEof:true},
    {kind:'static-picture',startSeconds:1,endSeconds:4,endedAtEof:true},
    {kind:'near-silence',startSeconds:3,endSeconds:4,endedAtEof:true}]);
});
test('event metadata ignores unrelated fields, preserves real boundaries and applies duration thresholds',()=>{
  const c=eventCollector(5);for(const line of ['some.user.text=oops','lavfi.black_start=0','lavfi.black_end=0.2',
    'lavfi.black_start=1.5','lavfi.black_end=2.25','lavfi.silence_start=3','lavfi.silence_end=4'])c.line(line);
  assert.deepEqual(c.finish().map(e=>[e.kind,e.startSeconds,e.endSeconds,e.endedAtEof]),[['near-black',1.5,2.25,false],['near-silence',3,4,false]]);
});
test('malformed, reversed, duplicate and excessive event evidence fails explicitly',()=>{
  for(const lines of [['lavfi.black_start=nan'],['lavfi.black_end=1'],['lavfi.black_start=1','lavfi.black_end=0'],['lavfi.black_start=0','lavfi.black_start=1']]){
    const c=eventCollector(4);assert.throws(()=>lines.forEach(l=>c.line(l)),/delivery_metadata/);
  }
  const c=eventCollector(4,{maxEvents:1});c.line('lavfi.black_start=0');c.line('lavfi.black_end=1');c.line('lavfi.black_start=2');assert.throws(()=>c.finish(),/delivery_event_limit/);
});
test('audio parser preserves finite readings but omits nonfinite meter windows',()=>{
  const c=audioCollector(4);for(const line of ['frame:3    pts:14400   pts_time:0.3','lavfi.r128.M=-20','lavfi.r128.I=-20','lavfi.r128.LRA=1',
    'frame:4    pts:19200   pts_time:0.4','lavfi.r128.M=nan'])c.line(line);
  const r=c.finish(summary);assert.equal(r.integratedLufs,-20);assert.equal(r.truePeakDbtp,-11.2);assert.equal(r.curve.nonfiniteWindows,1);
  assert.deepEqual(r.curve.points,[{seconds:0.3,lufs:-20}]);assert.equal(r.curve.status,'partial');assert.ok(!JSON.stringify(r).includes('NaN'));
});
test('audio parser distinguishes below-gate/short material and rejects missing summaries',()=>{
  const c=audioCollector(0.2);c.line('lavfi.r128.I=-70');const r=c.finish(summary.replace('-12.1','-inf').replace('-11.2','-inf'));
  assert.equal(r.integratedLufs,null);assert.equal(r.loudnessRangeLu,null);assert.equal(r.truePeakDbtp,null);
  assert.throws(()=>audioCollector(1).finish('exit 0 but no metrics'),/delivery_summary_missing/);
  assert.throws(()=>audioCollector(1).line('lavfi.r128.I=not-a-number'),/delivery_metadata_invalid/);
});
test('video contracts distinguish fractional rates, wrong counts, dimensions and absent picture',()=>{
  const plan={fps:'24000/1001',frames:24,width:160,height:90,duration:1.001};
  const v={codec_type:'video',width:160,height:90,avg_frame_rate:'24000/1001',nb_read_frames:'24',sample_aspect_ratio:'1:1',duration:'1.001'};
  assert.ok(videoContract({streams:[v]},plan).every(c=>c.status==='pass'));
  assert.equal(videoContract({streams:[{...v,avg_frame_rate:'24/1'}]},plan).find(c=>c.code==='average-frame-rate').status,'fail');
  assert.equal(videoContract({streams:[{...v,nb_read_frames:'23'}]},plan).find(c=>c.code==='decoded-picture-count').status,'fail');
  assert.equal(videoContract({streams:[{...v,width:320}]},plan).find(c=>c.code==='picture-size').status,'fail');
  assert.equal(videoContract({streams:[]},plan)[0].status,'fail');
});
test('PCM contract requires exact sample count, sample rate, layout and PCM encoding',()=>{
  const a={codec_type:'audio',sample_rate:'48000',channels:2,codec_name:'pcm_s24le',time_base:'1/48000',duration_ts:48048};
  assert.equal(pcmContract({streams:[a]},{audioSamples:48048}).status,'pass');
  for(const p of [{duration_ts:48000},{sample_rate:'44100'},{channels:1},{codec_name:'pcm_f32le'}])assert.equal(pcmContract({streams:[{...a,...p}]},{audioSamples:48048}).status,'fail');
});
