import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Studio,fingerprint} from '../src/store.mjs';
import {importMediaFile,fileDigest} from '../src/media-io.mjs';
import {emptyMediaEdit,renderMediaEdit} from '../src/media-edit.mjs';
import {checkDelivery} from '../src/media-delivery.mjs';
import {pcm24,fixturePng} from './helpers/sound-fixtures.mjs';
let root,studio,image,master,cut,production,firstReport,originals;
before(async()=>{
  root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-delivery-integration-'));studio=new Studio(path.join(root,'studio'));
  async function asset(name,bytes){const file=path.join(root,name);await fs.writeFile(file,bytes);return importMediaFile(studio,file,{name});}
  image=await asset('Intentionally black still.png',fixturePng);
  master=await asset('Three seconds of mastered tone.wav',pcm24(144000,i=>Math.round(0.1*8388607*Math.sin(2*Math.PI*997*i/48000))));
  production=studio.createProduction({title:'Saved cut inspection',shots:[],cast:[]});
  studio.write('timeline',{id:'timeline_'+production.id,projectId:production.id,revision:1,past:[],future:[],
    timeline:{...emptyMediaEdit(),fps:'24',width:160,height:90,clips:[{id:'still',assetId:image.id,sourceStart:'0',frames:96,fit:'contain'}],soundtrack:{assetId:master.id,tailPolicy:'pad-silence'}}});
  cut=await renderMediaEdit(studio,production.id,{baseRevision:1,acknowledgeUnmanagedColor:true});
  originals=new Map();for(const asset of studio.list('asset'))originals.set(asset.id,await fileDigest(studio.assetPath(asset.id)));
});
after(async()=>{studio?.close();if(root)await fs.rm(root,{recursive:true,force:true});});
test('real export inspection binds exact output bytes, saved revision, frame and PCM contracts',async()=>{
  const before=studio.getTimeline(production.id),assets=studio.list('asset');
  firstReport=await checkDelivery(studio,cut.id,{});assert.equal(firstReport.cutId,cut.id);assert.equal(firstReport.revision,1);assert.equal(firstReport.readOnly,true);
  assert.equal(firstReport.outputSha256,originals.get(cut.output));assert.equal(firstReport.audio.encoded.status,'measured');assert.equal(firstReport.audio.pcm.status,'measured');
  for(const code of ['decoded-picture-count','average-frame-rate','aligned-pcm-contract','aligned-pcm-integrity','original-source-integrity'])assert.equal(firstReport.checks.find(c=>c.code===code).status,'pass',code);
  assert.deepEqual(studio.getTimeline(production.id),before);assert.deepEqual(studio.list('asset'),assets);
  for(const [id,hash]of originals)assert.equal(await fileDigest(studio.assetPath(id)),hash);
  assert.deepEqual(studio.read(firstReport.id,'delivery-check'),firstReport);
});
test('intentional dark picture, authored still and padded audio are reviewable events, not automatic corrections',()=>{
  const black=firstReport.findings.find(f=>f.code==='near-black'),held=firstReport.findings.find(f=>f.code==='static-picture'),quiet=firstReport.findings.find(f=>f.code==='near-silence');
  assert.equal(black.endSeconds,4);assert.deepEqual(held.authoredStillClipIds,['still']);assert.equal(quiet.startSeconds,3);assert.equal(quiet.endSeconds,4);
  assert.ok(firstReport.findings.every(f=>f.severity!=='error'));assert.ok(!Object.hasOwn(firstReport,'correctedAssetId'));
});
test('custom targets are snapshotted; repeated checks create separate historical reports',async()=>{
  const report=await checkDelivery(studio,cut.id,{targetLufs:-23,toleranceLu:0.5,truePeakCeilingDbtp:-12,scanPicture:false});
  assert.notEqual(report.id,firstReport.id);assert.equal(report.options.targetLufs,-23);assert.equal(report.picture.status,'not-requested');
  assert.ok(report.findings.some(f=>f.code==='loudness-outside-target'));assert.deepEqual(studio.read(firstReport.id,'delivery-check'),firstReport);
});
test('a save during inspection never rebinds an old render to the new edit revision',async()=>{
  const promise=checkDelivery(studio,cut.id,{scanPicture:false});const old=studio.getTimeline(production.id);
  const next=structuredClone(old.timeline);next.clips[0].frames=120;studio.saveTimeline(production.id,old.revision,next);
  const report=await promise;assert.equal(report.revision,cut.revision);assert.equal(studio.getTimeline(production.id).revision,old.revision+1);
  assert.equal(report.outputAssetId,cut.output);
});
test('changed source media produces a recorded technical failure without changing the valid export',async()=>{
  const file=studio.assetPath(image.id),backup=file+'.backup';await fs.rename(file,backup);
  try {const report=await checkDelivery(studio,cut.id,{scanPicture:false});assert.equal(report.status,'technical-issues');assert.ok(report.checks.some(c=>c.code==='original-source-integrity'&&c.status==='fail'));assert.equal(report.outputSha256,originals.get(cut.output));}
  finally{await fs.rename(backup,file);}
});
test('corrupted aligned PCM never passes checksum verification or loudness assessment',async()=>{
  const file=path.join(studio.root,'media-renders',cut.bridgeFolder,'master-48k.wav'),bytes=await fs.readFile(file),bad=Buffer.from(bytes);bad[bad.length-1]^=1;await fs.writeFile(file,bad);
  try {const report=await checkDelivery(studio,cut.id,{scanPicture:false});assert.equal(report.status,'technical-issues');assert.ok(report.checks.some(c=>c.code==='aligned-pcm-integrity'&&c.status==='fail'));assert.equal(report.audio.pcm,undefined);assert.equal(report.audio.encoded.status,'measured');assert.deepEqual(await fs.readFile(file),bad);}
  finally{await fs.writeFile(file,bytes);}
});
test('wrong manifest revision is rejected instead of certifying an unrelated handoff',async()=>{
  const file=path.join(studio.root,'media-renders',cut.bridgeFolder,'manifest.json'),bytes=await fs.readFile(file),m=JSON.parse(bytes);m.revision=999;await fs.writeFile(file,JSON.stringify(m));
  try{const report=await checkDelivery(studio,cut.id,{scanPicture:false});assert.ok(report.checks.some(c=>c.code==='aligned-pcm-integrity'&&c.reason==='delivery_manifest_integrity'));}
  finally{await fs.writeFile(file,bytes);}
});
test('wrong recorded picture count and rate are detected in the actual encoded file',async()=>{
  const wrong=structuredClone(cut);wrong.plan.frames=95;wrong.plan.duration=95/24;const {hash,...p}=wrong.plan;wrong.plan.hash=fingerprint(p);studio.write('cut',wrong);
  try{const report=await checkDelivery(studio,cut.id,{scanPicture:false});assert.equal(report.checks.find(c=>c.code==='decoded-picture-count').status,'fail');assert.equal(report.status,'technical-issues');}
  finally{studio.write('cut',cut);}
});
test('tampered compiled plans fail before any inspection report is created',async()=>{
  const before=studio.list('delivery-check').length,wrong=structuredClone(cut);wrong.plan.width=320;studio.write('cut',wrong);
  try{await assert.rejects(checkDelivery(studio,cut.id,{}),/delivery_plan_integrity/);assert.equal(studio.list('delivery-check').length,before);}
  finally{studio.write('cut',cut);}
});
test('tampered output content cannot receive a report for its old hash',async()=>{
  const file=studio.assetPath(cut.output),bytes=await fs.readFile(file),bad=Buffer.from(bytes);bad[bad.length-1]^=1;await fs.writeFile(file,bad);const before=studio.list('delivery-check').length;
  try{await assert.rejects(checkDelivery(studio,cut.id,{}),/asset_integrity/);assert.equal(studio.list('delivery-check').length,before);}
  finally{await fs.writeFile(file,bytes);}
});
test('changed cut identity during inspection rejects the result and cancellation leaves no record',async()=>{
  const before=studio.list('delivery-check').length,promise=checkDelivery(studio,cut.id,{scanPicture:false});studio.write('cut',{...cut,revision:100});
  try{await assert.rejects(promise,/delivery_cut_changed/);assert.equal(studio.list('delivery-check').length,before);}finally{studio.write('cut',cut);}
  const controller=new AbortController();controller.abort();await assert.rejects(checkDelivery(studio,cut.id,{}, {signal:controller.signal}),/delivery_cancelled/);assert.equal(studio.list('delivery-check').length,before);
});
