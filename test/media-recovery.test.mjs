import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {Studio} from '../src/store.mjs';
import {checkMediaHealth,inspectStoredAsset,restoreMissingAsset,assetRecordKey,savedEditKey,mediaHealthScope} from '../src/media-recovery.mjs';
import {importMediaFile,fileDigest,mediaExclusive,runMedia} from '../src/media-io.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {renderMediaEdit} from '../src/media-edit.mjs';
import {emptySoundStage} from '../public/sound-edit.mjs';
import {emptyTextLayer} from '../public/text-edit.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
let root,sequence=0;
before(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-recovery-'));});
after(async()=>{await fs.rm(root,{recursive:true,force:true});});
async function fixture(){
 const studio=new Studio(path.join(root,'studio-'+(++sequence))),bytes=pcm24(4800,(i,c)=>i*(c+1));
 const source=path.join(studio.root,'original.wav');await fs.writeFile(source,bytes);
 const asset=await importMediaFile(studio,source,{name:'My mastered song.wav'});
 const p=createMediaProduction(studio,{title:'Media recovery fixture',fps:'24',width:320,height:180}).production;
 const edit=studio.getTimeline(p.id).timeline;edit.soundtrack={assetId:asset.id,tailPolicy:'pad-silence'};
 const record=studio.saveTimeline(p.id,1,edit);
 return {studio,asset,bytes,p,record,close:()=>studio.close(),file:studio.assetPath(asset.id)};
}
const stream=b=>Readable.from([b]);
async function use(fn){const f=await fixture();try{await fn(f);}finally{f.close();}}
test('scan verifies real original bytes without changing asset, profile or timeline records',()=>use(async f=>{
 const {studio,asset,p,record}=f;const before=JSON.stringify(studio.list('asset'))+JSON.stringify(studio.list('media-profile'))+JSON.stringify(studio.list('timeline'));
 const result=await checkMediaHealth(studio,p.id,{baseRevision:record.revision});
 assert.equal(result.allVerified,true);assert.equal(result.complete,true);assert.equal(result.assets[0].observedSha256,asset.sha256);assert.equal(result.bytesHashed,asset.bytes);
 assert.equal(before,JSON.stringify(studio.list('asset'))+JSON.stringify(studio.list('media-profile'))+JSON.stringify(studio.list('timeline')));
}));
test('missing original remains diagnosable even though duplicate import currently fails',()=>use(async f=>{
 await fs.unlink(f.file);await assert.rejects(importMediaFile(f.studio,path.join(f.studio.root,'original.wav')),e=>e.code==='ENOENT');
 const report=await checkMediaHealth(f.studio,f.p.id,{baseRevision:f.record.revision});assert.equal(report.allVerified,false);assert.equal(report.complete,true);assert.equal(report.counts.missing,1);assert.equal(report.assets[0].restoreEligible,true);
}));
test('renamed exact source restores identity and saved revision, survives reopening, and leaves no scratch file',()=>use(async f=>{
 const before=JSON.stringify(f.studio.list('asset'))+JSON.stringify(f.studio.list('media-profile'))+JSON.stringify(f.studio.list('timeline'));
 await fs.unlink(f.file);const result=await restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:assetRecordKey(f.asset)});
 assert.equal(result.status,'restored');assert.equal(await fileDigest(f.file),f.asset.sha256);
 assert.equal(before,JSON.stringify(f.studio.list('asset'))+JSON.stringify(f.studio.list('media-profile'))+JSON.stringify(f.studio.list('timeline')));
 assert.ok((await fs.readdir(path.dirname(f.file))).every(n=>!n.startsWith('.restore-')));
 const reopened=new Studio(f.studio.root);try{assert.equal(reopened.getTimeline(f.p.id).revision,f.record.revision);assert.equal((await inspectStoredAsset(reopened,f.asset.id)).status,'verified');}finally{reopened.close();}
}));
test('same-sized different content is rejected without creating a replacement asset',()=>use(async f=>{
 await fs.unlink(f.file);const wrong=Buffer.from(f.bytes);wrong[wrong.length-1]^=1;
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(wrong),{recordKey:assetRecordKey(f.asset)}),/hash_mismatch/);
 await assert.rejects(fs.stat(f.file),{code:'ENOENT'});assert.equal(f.studio.list('asset').length,1);assert.equal(f.studio.list('media-restoration').length,0);
}));
for(const [name,delta] of [['short',-1],['long',1]])test(name+' upload is rejected without publishing partial bytes',()=>use(async f=>{
 await fs.unlink(f.file);const wrong=delta<0?f.bytes.subarray(0,f.bytes.length-1):Buffer.concat([f.bytes,Buffer.from([0])]);
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(wrong),{recordKey:assetRecordKey(f.asset)}),/size_mismatch/);await assert.rejects(fs.stat(f.file),{code:'ENOENT'});
 assert.deepEqual(await fs.readdir(path.dirname(f.file)),[]);
}));
test('a changed existing file is identified and never overwritten by restore',()=>use(async f=>{
 const changed=Buffer.from(f.bytes);changed[changed.length-1]^=4;await fs.writeFile(f.file,changed);
 const health=await inspectStoredAsset(f.studio,f.asset.id);assert.equal(health.status,'changed');assert.equal(health.reason,'hash-mismatch');
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:assetRecordKey(f.asset)}),/existing_file_protected/);assert.deepEqual(await fs.readFile(f.file),changed);
}));
test('truncated source is reported without claiming checksum verification',()=>use(async f=>{
 await fs.truncate(f.file,30);const h=await inspectStoredAsset(f.studio,f.asset.id);assert.equal(h.status,'changed');assert.equal(h.observedSha256,undefined);assert.equal(h.reason,'size-mismatch');
}));
test('idempotent retry checks supplied bytes and cannot overwrite an already restored file',()=>use(async f=>{
 const r=await restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:assetRecordKey(f.asset)});assert.equal(r.status,'already-present');assert.equal(await fileDigest(f.file),f.asset.sha256);
 const wrong=Buffer.from(f.bytes);wrong[50]^=1;await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(wrong),{recordKey:assetRecordKey(f.asset)}),/hash_mismatch/);
}));
test('report binds the scanned saved record even when another edit is saved during hashing',()=>use(async f=>{
 const pending=checkMediaHealth(f.studio,f.p.id,{baseRevision:f.record.revision});
 const next=structuredClone(f.record.timeline);next.markers=[{id:'later',frame:0,kind:'cue',label:'new edit'}];f.studio.saveTimeline(f.p.id,f.record.revision,next);
 const h=await pending;assert.equal(h.revision,f.record.revision);assert.equal(h.editKey,savedEditKey(f.record));assert.notEqual(h.editKey,savedEditKey(f.studio.getTimeline(f.p.id)));
}));
test('stale revision and changed asset record block writes',()=>use(async f=>{
 await assert.rejects(checkMediaHealth(f.studio,f.p.id,{baseRevision:1}),/revision_conflict/);
 await fs.unlink(f.file);await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:'stale'}),/record_conflict/);assert.deepEqual(await fs.readdir(path.dirname(f.file)),[]);
}));
test('cancellation and read failure clean scratch and leave missing source missing',()=>use(async f=>{
 await fs.unlink(f.file);const abort=new AbortController();
 async function* pieces(){yield f.bytes.subarray(0,20);abort.abort();yield f.bytes.subarray(20);}
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,pieces(),{recordKey:assetRecordKey(f.asset),signal:abort.signal}),/cancelled/);
 async function* bad(){yield f.bytes.subarray(0,20);throw Error('fixture_input_error');}
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,bad(),{recordKey:assetRecordKey(f.asset)}),/fixture_input_error/);
 assert.deepEqual(await fs.readdir(path.dirname(f.file)),[]);
}));
test('concurrent file arrival with different bytes is protected at publication',()=>use(async f=>{
 await fs.unlink(f.file);const other=Buffer.from(f.bytes);other[70]^=5;
 async function* collision(){yield f.bytes.subarray(0,30);await fs.writeFile(f.file,other);yield f.bytes.subarray(30);}
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,collision(),{recordKey:assetRecordKey(f.asset)}),/existing_file_protected/);assert.deepEqual(await fs.readFile(f.file),other);
}));
test('concurrent exact-file arrival is a safe idempotent result',()=>use(async f=>{
 await fs.unlink(f.file);async function* collision(){yield f.bytes.subarray(0,30);await fs.writeFile(f.file,f.bytes);yield f.bytes.subarray(30);}
 const r=await restoreMissingAsset(f.studio,f.asset.id,collision(),{recordKey:assetRecordKey(f.asset)});assert.equal(r.status,'already-present');assert.equal(await fileDigest(f.file),f.asset.sha256);
}));
test('record changes while upload streams are detected before installation',()=>use(async f=>{
 await fs.unlink(f.file);async function* collision(){yield f.bytes.subarray(0,30);f.studio.write('asset',{...f.asset,filename:f.asset.sha256+'.different'});yield f.bytes.subarray(30);}
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,collision(),{recordKey:assetRecordKey(f.asset)}),/record_conflict/);assert.deepEqual(await fs.readdir(path.dirname(f.file)),[]);
}));
test('symbolic links are neither read nor replaced, including dangling links',()=>use(async f=>{
 await fs.unlink(f.file);const external=path.join(f.studio.root,'outside.wav');await fs.writeFile(external,f.bytes);await fs.symlink(external,f.file);
 assert.equal((await inspectStoredAsset(f.studio,f.asset.id)).reason,'unsafe-file-type');
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:assetRecordKey(f.asset)}),/existing_file_protected/);
 await fs.unlink(external);assert.equal((await inspectStoredAsset(f.studio,f.asset.id)).reason,'unsafe-file-type');assert.equal((await fs.lstat(f.file)).isSymbolicLink(),true);
}));
test('symbolic-linked asset directories are not traversed',()=>use(async f=>{
 const assets=path.dirname(f.file),elsewhere=path.join(f.studio.root,'outside');await fs.rename(assets,elsewhere);await fs.symlink(elsewhere,assets);
 assert.equal((await inspectStoredAsset(f.studio,f.asset.id)).reason,'unsafe-directory');
 await assert.rejects(restoreMissingAsset(f.studio,f.asset.id,stream(f.bytes),{recordKey:assetRecordKey(f.asset)}),/existing_file_protected/);
}));
test('invalid records and unknown asset identities are unassessed, not missing originals',()=>use(async f=>{
 f.studio.write('asset',{...f.asset,filename:'../original.wav'});const h=await inspectStoredAsset(f.studio,f.asset.id);assert.equal(h.reason,'record-invalid');assert.equal(h.restoreEligible,false);
 const unknown=await inspectStoredAsset(f.studio,'asset_'+'f'.repeat(64));assert.equal(unknown.reason,'record-missing');
}));
test('bounded scan reports incompleteness instead of all-clear',()=>use(async f=>{
 const h=await checkMediaHealth(f.studio,f.p.id,{baseRevision:f.record.revision},{maxHashBytes:2});assert.equal(h.complete,false);assert.equal(h.allVerified,false);assert.equal(h.assets[0].reason,'scan-budget');assert.equal(h.bytesHashed,0);
}));
test('empty cut reports zero scoped files, not an all-verified production',()=>use(async f=>{
 const t=structuredClone(f.record.timeline);t.soundtrack=null;const rec=f.studio.saveTimeline(f.p.id,f.record.revision,t);
 const h=await checkMediaHealth(f.studio,f.p.id,{baseRevision:rec.revision});assert.equal(h.complete,true);assert.equal(h.allVerified,false);assert.equal(h.assets.length,0);
}));
test('muted sound and the last viewing copy are included once with all their usage roles',()=>use(async f=>{
 const t=structuredClone(f.record.timeline);t.audioPolicy='soundstage-mix-v1';t.soundStage={...emptySoundStage(),tracks:[{id:'voice',name:'Camera voice',role:'dialogue',mute:true,solo:false,gainDb:0,clips:[{id:'voice1',assetId:f.asset.id,streamIndex:0,atSample:0,sourceInSample:0,samples:4000,gainDb:0,fadeInSamples:0,fadeOutSamples:0}]}]};
 const rec=f.studio.saveTimeline(f.p.id,f.record.revision,t);const proxy='asset_'+'e'.repeat(64);
 f.studio.write('media-derivation',{id:'old',recipe:{operation:'browser-proxy',sourceAssetId:f.asset.id},outputAssetId:'asset_'+'d'.repeat(64)});
 f.studio.write('media-derivation',{id:'latest',recipe:{operation:'browser-proxy',sourceAssetId:f.asset.id},outputAssetId:proxy});
 const scope=mediaHealthScope(f.studio,f.p.id,rec.revision);assert.equal(scope.items.length,2);assert.ok(scope.items[0].roles.includes('sound: Camera voice (muted)'));assert.equal(scope.items[1].assetId,proxy);
}));
test('media exclusivity prevents simultaneous local media mutations',()=>use(async f=>{
 let release;const first=mediaExclusive(f.studio,()=>new Promise(r=>release=r));await assert.rejects(mediaExclusive(f.studio,async()=>{}),/media_busy/);release();await first;await mediaExclusive(f.studio,async()=>{});
}));
test('restored picture renders the same decoded frames and aligned song as before loss',()=>use(async f=>{
 const file=path.join(f.studio.root,'shot.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24','-frames:v','6','-c:v','libx264','-threads','1',file]);
 const picture=await importMediaFile(f.studio,file,{name:'Camera-like fixture.mp4'});const pictureBytes=await fs.readFile(file);
 const edit=structuredClone(f.record.timeline);edit.clips=[{id:'shot',assetId:picture.id,sourceStart:'0',frames:6,fit:'contain'}];edit.textLayer={...emptyTextLayer(),cues:[{id:'title',kind:'title',startFrame:1,endFrame:3,text:'Still your cut'}]};
 const rec=f.studio.saveTimeline(f.p.id,f.record.revision,edit),opts={baseRevision:rec.revision,acknowledgeUnmanagedColor:true};
 const before=await renderMediaEdit(f.studio,f.p.id,opts);await fs.unlink(f.studio.assetPath(picture.id));
 await restoreMissingAsset(f.studio,picture.id,stream(pictureBytes),{recordKey:assetRecordKey(picture)});
 const after=await renderMediaEdit(f.studio,f.p.id,opts);assert.equal(before.plan.hash,after.plan.hash);assert.equal(before.revision,after.revision);
 for(const [cut,name] of [[before,'a'],[after,'b']])await runMedia('ffmpeg',['-v','error','-i',f.studio.assetPath(cut.output),'-map','0:v:0','-f','framemd5',path.join(f.studio.root,name+'.md5')]);
 const frames=async name=>(await fs.readFile(path.join(f.studio.root,name+'.md5'),'utf8')).split('\n').filter(l=>!l.startsWith('#')).join('\n');assert.equal(await frames('a'),await frames('b'));
 assert.equal(await fileDigest(path.join(f.studio.root,'media-renders',before.bridgeFolder,'master-48k.wav')),await fileDigest(path.join(f.studio.root,'media-renders',after.bridgeFolder,'master-48k.wav')));
}));
