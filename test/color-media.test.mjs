import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {Studio} from '../src/store.mjs';
import {importColorLut,previewColor,prepareColor,colorFilter,inspectColorCadence} from '../src/media-color.mjs';
import {runMedia,importMediaFile,deriveImage,deriveVideoProxy,fileDigest,getMediaProfile} from '../src/media-io.mjs';
import {emptyMediaEdit,renderMediaEdit} from '../src/media-edit.mjs';
import {inspectProcess,probeDelivery} from '../src/media-inspect.mjs';
const settings={inputEncoding:'rec709',inputRange:'limited',reviewed:true,description:'Synthetic Rec.709 fixture'};
let root,studio,source,identity,swap,preview,prepared;
const cube=fn=>'LUT_3D_SIZE 2\n'+Array.from({length:8},(_,i)=>fn(i%2,Math.floor(i/2)%2,Math.floor(i/4)).join(' ')).join('\n')+'\n';
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),"shutter-color 'space-"));studio=new Studio(path.join(root,'studio'));
 const filename=path.join(root,'source.mp4');
 await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=192x108:r=24000/1001','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','1.001','-c:v','libx264','-pix_fmt','yuv422p10le','-threads','2','-filter_threads','1','-c:a','aac','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',filename]);
 source=await importMediaFile(studio,filename,{name:'synthetic camera.mp4'});
 identity=await importColorLut(studio,Readable.from([cube((r,g,b)=>[r,g,b])]),{name:'Identity.cube',inputEncoding:'rec709'});
 swap=await importColorLut(studio,Readable.from([cube((r,g,b)=>[b,g,r])]),{name:'Channel swap.cube',inputEncoding:'rec709'});
});
after(async()=>{studio?.close();await fs.rm(root,{recursive:true,force:true});});
test('LUT storage verifies content and deduplicates exact declarations',async()=>{
 const again=await importColorLut(studio,Readable.from([cube((r,g,b)=>[r,g,b])]),{name:'alternate name',inputEncoding:'rec709'});
 assert.equal(again.id,identity.id);assert.equal(again.name,'Identity.cube');
});
test('preparation requires a matching saved preview',async()=>assert.rejects(prepareColor(studio,source.id,{settings}),/matching_preview/));
test('preview produces separate sRGB assets without changing source or timeline',async()=>{
 const before=await fileDigest(studio.assetPath(source.id));
 preview=await previewColor(studio,source.id,{settings,frame:3});
 assert.equal(preview.frame,3);assert.ok(preview.beforeAssetId.startsWith('asset_'));assert.equal(preview.sourceSha256,source.sha256);
 assert.equal(await fileDigest(studio.assetPath(source.id)),before);assert.equal(studio.list('timeline').length,0);
});
test('changed interpretation invalidates earlier preview on the server',async()=>assert.rejects(prepareColor(studio,source.id,{settings:{...settings,inputRange:'full'},previewId:preview.id}),/preview_stale/));
test('10-bit editing copy preserves all tested frames, cadence and originals; no audio silently copied',async()=>{
 prepared=await prepareColor(studio,source.id,{settings,previewId:preview.id});
 assert.equal(prepared.asset.media.videoCodec,'prores');assert.equal(prepared.asset.media.ext,'mov');assert.equal(prepared.asset.mime,'video/quicktime');
 assert.equal(prepared.asset.media.pixelFormat,'yuv422p10le');assert.equal(prepared.derivation.cadence.frames,24);assert.deepEqual(prepared.asset.media.audio,[]);
 assert.equal(await fileDigest(studio.assetPath(source.id)),source.sha256);assert.equal(prepared.asset.media.colorPreparation.range,'limited');assert.ok([null,'tv'].includes(prepared.asset.media.color.range));
 assert.equal(prepared.derivation.recipe.sourceAssetId,source.id);assert.equal(studio.list('timeline').length,0);
});
test('already prepared material cannot accidentally receive the LUT a second time',async()=>assert.rejects(previewColor(studio,prepared.asset.id,{settings}),/already_prepared/));
test('prepared viewing copy retains explicit Rec.709 tags and source mapping',async()=>{
 const out=await deriveVideoProxy(studio,prepared.asset.id,{acknowledgeUnmanagedColor:true});
 assert.equal(out.recipe.colorPolicy,'prepared-rec709-viewing');assert.equal(out.recipe.sourceAssetId,prepared.asset.id);
 assert.deepEqual(out.media.color,{transfer:'bt709',primaries:'bt709',space:'bt709',range:'tv'});
});
test('prepared last frame becomes a tagged sRGB reference with correct decoded index',async()=>{
 const out=await deriveImage(studio,prepared.asset.id,{frame:'last',acknowledgeUnmanagedColor:true});
 assert.equal(out.recipe.decodedFrameIndex,23);assert.equal(out.recipe.colorPolicy,'prepared-rec709-to-srgb-reference');
 const raw=await probeDelivery(studio.assetPath(out.id));assert.equal(raw.streams[0].color_transfer,'iec61966-2-1');
});
test('prepared asset exports through the existing assembly with color tags and exact frame count',async()=>{
 const p=studio.createProduction({title:'Prepared fixture',shots:[],cast:[]});
 const edit={...emptyMediaEdit(),width:192,height:108,clips:[{id:'prepared',assetId:prepared.asset.id,sourceStart:'0',frames:24,fit:'contain'}]};
 studio.write('timeline',{id:'timeline_'+p.id,projectId:p.id,revision:1,timeline:edit,past:[],future:[]});
 const cut=await renderMediaEdit(studio,p.id,{baseRevision:1,acknowledgeUnmanagedColor:true});
 const raw=await probeDelivery(studio.assetPath(cut.output),{countFrames:true});
 assert.equal(Number(raw.streams[0].nb_read_frames),24);assert.equal(raw.streams[0].color_space,'bt709');assert.equal(raw.streams[0].color_transfer,'bt709');
});
test('custom-log requires a LUT with the matching declared input encoding',async()=>assert.rejects(previewColor(studio,source.id,{settings:{...settings,inputEncoding:'custom-log',lutId:identity.id,description:'S-Log3 / S-Gamut3.Cine (user declaration)'}}),/encoding_mismatch/));
test('out-of-range preview frame is rejected and scratch is cleaned',async()=>{
 await assert.rejects(previewColor(studio,source.id,{settings,frame:200}),/outside_media/);
 assert.deepEqual(await fs.readdir(path.join(studio.root,'media-tmp')),[]);
});
test('cancelled preparation publishes no new derivation',async()=>{
 const count=studio.list('media-derivation').length,c=new AbortController();c.abort();
 await assert.rejects(prepareColor(studio,source.id,{settings,previewId:preview.id},{signal:c.signal}),/cancelled/);
 assert.equal(studio.list('media-derivation').length,count);
});
test('LUT tampering cannot produce a ready preview',async()=>{
 const filename=path.join(studio.root,'color-luts',swap.canonicalSha256+'.cube'),original=await fs.readFile(filename);
 await fs.writeFile(filename,'changed');
 await assert.rejects(previewColor(studio,source.id,{settings:{...settings,lutId:swap.id}}),/integrity/);
 await fs.writeFile(filename,original);
});
test('variable frame timing is rejected using decoded timestamps rather than the average-rate label',async()=>{
 const name=path.join(root,'variable.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=24:d=1','-vf','select=not(eq(n\\,4))','-fps_mode','vfr','-c:v','libx264','-threads','1','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',name]);
 const a=await importMediaFile(studio,name,{name:'variable.mp4'});
 await assert.rejects(inspectColorCadence(studio.assetPath(a.id),a.media),/variable_cadence/);
});
test('PQ HDR is not converted by pretending it is SDR',async()=>{
 const name=path.join(root,'hdr.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=24:d=0.5','-c:v','libx264','-threads','1','-color_primaries','bt2020','-color_trc','smpte2084','-colorspace','bt2020nc',name]);
 const a=await importMediaFile(studio,name,{name:'hdr.mp4'});await assert.rejects(previewColor(studio,a.id,{settings}),/hdr_not_supported/);
});
test('a reviewed creative LUT actually produces a distinct prepared asset and records its hashes',async()=>{
 const s={...settings,lutId:swap.id},p=await previewColor(studio,source.id,{settings:s,frame:'last'});
 assert.equal(p.frame,23);assert.notEqual(p.beforeAssetId,p.afterAssetId);
 const out=await prepareColor(studio,source.id,{settings:s,previewId:p.id});assert.notEqual(out.asset.id,prepared.asset.id);
 assert.equal(out.derivation.recipe.lut.canonicalSha256,swap.canonicalSha256);assert.equal(out.derivation.previewId,p.id);
});
test('prepared interpretation and lineage survive SQLite close/reopen',async()=>{
 const id=prepared.asset.id;studio.close();studio=new Studio(path.join(root,'studio'));
 assert.equal(getMediaProfile(studio,id).colorPreparation.schema,'shutter-color-prep-v1');
 assert.ok(studio.list('media-derivation').some(d=>d.outputAssetId===id&&d.recipe.sourceSha256===source.sha256));
});
