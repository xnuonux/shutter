import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Studio} from '../src/store.mjs';
import {runMedia,importMediaFile,fileDigest} from '../src/media-io.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {renderMediaEdit,renderMediaTextFrame} from '../src/media-edit.mjs';
import {burnTextPicture,preflightText,makeFrameClockAss} from '../src/media-text.mjs';
import {emptyTextLayer,parseCaptions} from '../public/text-edit.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
let root,studio,asset,master,sourceHash;
const cue=(id,startFrame,endFrame,kind='caption',text='Visible on these frames')=>({id,kind,startFrame,endFrame,text});
const layer=cues=>({...emptyTextLayer(),captionDelivery:'burn-and-sidecar',cues});
async function gray(filename,out,w,h){await runMedia('ffmpeg',['-v','error','-i',filename,'-map','0:v:0','-vf','format=gray','-f','rawvideo','-pix_fmt','gray','-threads','1',out]);const b=await fs.readFile(out),area=w*h;assert.equal(b.length%area,0);return Array.from({length:b.length/area},(_,i)=>{let white=0;for(const v of b.subarray(i*area,(i+1)*area))if(v>170)white++;return white;});}
async function production(cues,{delivery='burn-and-sidecar'}={}) {const p=createMediaProduction(studio,{title:'Synthetic / finishing fixture',fps:'24',width:320,height:180}).production;
 const t=studio.getTimeline(p.id).timeline;t.clips=[{id:'left',assetId:asset.id,sourceStart:'0',frames:8,fit:'contain'},{id:'right',assetId:asset.id,sourceStart:'0',frames:9,fit:'contain'}];t.soundtrack={assetId:master.id,tailPolicy:'pad-silence'};t.textLayer={...layer(cues),captionDelivery:delivery};return {p,record:studio.saveTimeline(p.id,1,t)};
}
before(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-text-'));studio=new Studio(path.join(root,'studio'));
 const input=path.join(root,'source.mp4');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=320x180:r=24','-frames:v','24','-c:v','libx264','-threads','1',input]);asset=await importMediaFile(studio,input,{name:'Synthetic black picture.mp4'});sourceHash=await fileDigest(studio.assetPath(asset.id));
 const wav=path.join(root,'master.wav');await fs.writeFile(wav,pcm24(48000,(i,c)=>((i*(c?5:3))%1000)-500));master=await importMediaFile(studio,wav,{name:'Synthetic unchanged master.wav'});
});
after(async()=>{studio.close();await fs.rm(root,{recursive:true,force:true});});
for(const fps of ['24000/1001','120'])test(`actual compositor activates one-frame cues exactly at ${fps}`,async()=>{
 const folder=await fs.mkdtemp(path.join(root,'timing-')),input=path.join(folder,'input.mp4'),output=path.join(folder,'output.mp4');
 await runMedia('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=black:s=320x180:r=${fps}`,'-frames:v','12','-c:v','libx264','-threads','1',input]);
 const plan={frames:12,width:320,height:180,fps,textLayer:layer([cue('a',1,2),cue('b',3,4),cue('c',6,9,'title','FRAME CLOCK')])};
 const evidence=await burnTextPicture(plan,folder,input,output);assert.ok(evidence.fontEvidence.some(l=>l.includes('fontselect:')));
 const counts=await gray(output,path.join(folder,'pixels.gray'),320,180);assert.deepEqual(counts.map(n=>n>10),Array.from({length:12},(_,i)=>i===1||i===3||(i>=6&&i<9)));
 const v=JSON.parse(await runMedia('ffprobe',['-v','error','-show_streams','-of','json',output])).streams[0];assert.equal(v.avg_frame_rate,fps==='120'?'120/1':fps);assert.equal(counts.length,12);assert.equal((await fs.readdir(folder)).includes('shutter-text.ass'),false);
});
test('burned title and caption cross a shot boundary without restarting or disappearing',async()=>{
 const {p,record}=await production([cue('opening',1,4,'title','SHUTTER'),cue('lyric',6,10,'caption','One cut. One song.')]);
 const before=await fileDigest(studio.assetPath(master.id));const cut=await renderMediaEdit(studio,p.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});
 const folder=path.join(studio.root,'media-renders',cut.bridgeFolder),counts=await gray(studio.assetPath(cut.output),path.join(root,'cut.gray'),320,180);
 assert.deepEqual(counts.map(n=>n>10),Array.from({length:17},(_,i)=>(i>=1&&i<4)||(i>=6&&i<10)));
 assert.equal(await fileDigest(studio.assetPath(master.id)),before);assert.equal(await fileDigest(studio.assetPath(asset.id)),sourceHash);
 const caption=await fs.readFile(path.join(folder,'captions.srt'),'utf8');assert.equal(parseCaptions(caption,'srt','24','read')[0].startFrame,6);
 const raw=JSON.parse(await fs.readFile(path.join(folder,'text-layer.json'),'utf8'));assert.equal(raw.planHash,cut.plan.hash);assert.equal(raw.textLayer.cues.length,2);assert.ok(raw.renderEvidence.fontEvidence.length);
 for(const name of ['captions.srt','captions.vtt','text-layer.json','shutter-handoff.zip'])assert.ok(cut.bridgeFiles.includes(name));
 const clean=await gray(path.join(folder,'shot-0001.mp4'),path.join(root,'clean.gray'),320,180);assert.ok(clean.every(n=>n===0),'editorial handoff media stays clean');
 // The aligned WAV must retain the source's actual integer samples, not just its filename or hash.
 const sourceBytes=await fs.readFile(studio.assetPath(master.id)),wave=await fs.readFile(path.join(folder,'master-48k.wav'));const at=wave.indexOf(Buffer.from('data'))+8;assert.deepEqual(wave.subarray(at,at+17*2000*6),sourceBytes.subarray(44,44+17*2000*6));
 const manifest=JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8'));for(const name of ['captions.srt','captions.vtt','text-layer.json'])assert.equal(manifest.files.find(f=>f.name===name).sha256,await fileDigest(path.join(folder,name)));
});
test('sidecar-only captions never become burned pixels',async()=>{const {p,record}=await production([cue('caption',1,6)],{delivery:'sidecar'});const cut=await renderMediaEdit(studio,p.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});const counts=await gray(studio.assetPath(cut.output),path.join(root,'sidecar.gray'),320,180);assert.ok(counts.every(n=>n===0));assert.equal(cut.textRenderEvidence,undefined);assert.ok(cut.bridgeFiles.includes('captions.vtt'));});
test('saved compositor frame uses the selected global frame in the second shot',async()=>{const {p,record}=await production([cue('caption',8,10)]);const shown=await renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:8,acknowledgeUnmanagedColor:true}),hidden=await renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:10,acknowledgeUnmanagedColor:true});assert.ok((await gray(studio.assetPath(shown.imageAssetId),path.join(root,'shown.gray'),320,180))[0]>10);assert.equal((await gray(studio.assetPath(hidden.imageAssetId),path.join(root,'hidden.gray'),320,180))[0],0);assert.equal(shown.revision,record.revision);assert.equal(shown.planHash,record.plan.hash);assert.deepEqual(await fs.readdir(path.join(studio.root,'text-previews')),[]);});
test('outside-picture text blocks export without publishing a partial cut',async()=>{const {p,record}=await production([cue('late',16,24)]),before=studio.list('cut').length;assert.equal(record.plan.textIssues[0].blocking,true);await assert.rejects(renderMediaEdit(studio,p.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true}),/text_outside_picture/);assert.equal(studio.list('cut').length,before);});
test('saved frame rejects stale revisions and missing color review',async()=>{const {p,record}=await production([cue('title',0,4,'title')]);await assert.rejects(renderMediaTextFrame(studio,p.id,{baseRevision:record.revision-1,frame:0,acknowledgeUnmanagedColor:true}),/revision_conflict/);await assert.rejects(renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:0}),/color_review/);await assert.rejects(renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:17,acknowledgeUnmanagedColor:true}),/text_preview_frame/);});
test('an edit made during a compositor-frame request cannot relabel its historical evidence',async()=>{const {p,record}=await production([cue('old',0,5,'title','OLD REVISION')]);const pending=renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:0,acknowledgeUnmanagedColor:true});const next=structuredClone(record.timeline);next.textLayer.cues[0].text='NEW REVISION';studio.saveTimeline(p.id,record.revision,next);const result=await pending;assert.equal(result.revision,record.revision);assert.equal(result.textLayer.cues[0].text,'OLD REVISION');assert.notEqual(studio.getTimeline(p.id).plan.hash,result.planHash);});
test('invalid font configuration is rejected before processing picture',async()=>{const prior=process.env.SHUTTER_TEXT_FONT;process.env.SHUTTER_TEXT_FONT='Unsafe,Style\nInjection';try{await assert.rejects(preflightText({frames:4,fps:'24',textLayer:layer([cue('t',0,4,'title')])}),/font_family_invalid/);}finally{if(prior===undefined)delete process.env.SHUTTER_TEXT_FONT;else process.env.SHUTTER_TEXT_FONT=prior;}});
test('an unavailable glyph does not silently become an approved compositor frame',async()=>{const {p,record}=await production([cue('unknown',0,4,'title','\u0378')]);await assert.rejects(renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:0,acknowledgeUnmanagedColor:true}),/text_font_or_glyph_unavailable/);});
test('plain title punctuation cannot introduce an ASS event or override',()=>{const plan={frames:5,width:320,height:180,fps:'24',textLayer:layer([cue('x',0,5,'title','Dialogue: 0, evil\n100% <artist>')])};const ass=makeFrameClockAss(plan);assert.equal(ass.split('\n').filter(l=>l.startsWith('Dialogue:')).length,1);assert.match(ass,/100% <artist>/);});

test('an already-cancelled frame request does not create review records',async()=>{const {p,record}=await production([cue('t',0,4,'title')]),before=studio.list('text-preview').length;const abort=new AbortController();abort.abort();await assert.rejects(renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:0,acknowledgeUnmanagedColor:true},{signal:abort.signal}),/text_preview_cancelled/);assert.equal(studio.list('text-preview').length,before);});
