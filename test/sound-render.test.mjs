import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Studio} from '../src/store.mjs';
import {runMedia,importMediaFile,fileDigest,getMediaProfile} from '../src/media-io.mjs';
import {emptyMediaEdit,compileMediaEdit,renderMediaEdit,makeBridgeXml,makeBridgeOtio} from '../src/media-edit.mjs';
import {renderSoundStage,renderListeningMix,checkSoundBudget} from '../src/media-sound.mjs';
import {emptySoundStage,SOUND_POLICY,soundIdentity} from '../public/sound-edit.mjs';
import {pcm24,fixturePng} from './helpers/sound-fixtures.mjs';
let root,studio,image,master,effect,mono,camera,rate441,hashes,serial=0;
const masterCode=(i,c)=>(c?-1:1)*(800000+(i%257)*100);
const effectCode=(i,c)=>(c?-1:1)*(200000+(i%97)*150);
const clip=(patch={})=>({id:'fx',assetId:effect.id,streamIndex:0,atSample:111,sourceInSample:100,samples:8000,gainDb:-3,fadeInSamples:1000,fadeOutSamples:800,...patch});
const track=(patch={})=>({id:'effects',name:'Rain & texture',role:'effects',gainDb:-6,mute:false,solo:false,clips:[clip(),clip({id:'hit',atSample:5001,sourceInSample:17,samples:2200,gainDb:-12,fadeInSamples:0,fadeOutSamples:100})],...patch});
function edit(patch={}){return {...emptyMediaEdit(),width:160,height:90,clips:[{id:'photo',assetId:image.id,sourceStart:'0',frames:12,fit:'contain'}],soundtrack:{assetId:master.id,tailPolicy:'pad-silence'},audioPolicy:SOUND_POLICY,soundStage:{...emptySoundStage(),outputGainDb:-2.3,tracks:[track()]},...patch};}
function saved(e=edit()){const p=studio.createProduction({title:'Sound verification '+serial++,cast:[],shots:[]});studio.write('timeline',{id:'timeline_'+p.id,projectId:p.id,revision:1,timeline:emptyMediaEdit(),past:[],future:[]});return {p,record:studio.saveTimeline(p.id,1,e)};}
async function decoded(file){const dest=path.join(root,'decoded-'+serial++);await runMedia('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-c:a','pcm_f32le','-f','f32le',dest]);const b=await fs.readFile(dest);return Array.from({length:b.length/4},(_,i)=>b.readFloatLE(i*4));}
async function sound(e=edit(),options){const {p,record}=saved(e),folder=await fs.mkdtemp(path.join(root,'mix-'));return {p,record,folder,result:await renderSoundStage(studio,record.plan,folder,options)};}
before(async()=>{
 root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-sound-test-'));studio=new Studio(path.join(root,'studio'));
 async function asset(name,bytes){const file=path.join(root,name);await fs.writeFile(file,bytes);return importMediaFile(studio,file,{name});}
 image=await asset('photo.png',fixturePng);master=await asset('master.wav',pcm24(16000,masterCode));effect=await asset('effect.wav',pcm24(10000,effectCode));mono=await asset('mono.wav',pcm24(4800,()=>524288,{channels:1}));rate441=await asset('44k.wav',pcm24(4410,()=>524288,{rate:44100,channels:1}));
 const cam=path.join(root,'camera.mkv');await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=s=160x90:r=24:d=1','-i',studio.assetPath(mono.id),'-map','0:v','-map','1:a','-c:v','ffv1','-c:a','pcm_s24le','-threads','1',cam]);camera=await importMediaFile(studio,cam,{name:'synthetic camera with audio.mkv'});
 hashes=new Map();for(const a of [image,master,effect,mono,rate441,camera])hashes.set(a.id,await fileDigest(studio.assetPath(a.id)));
});
after(async()=>{studio?.close();if(root)await fs.rm(root,{recursive:true,force:true});});
test('compiler has explicit opt-in and adds audio sources without generation jobs',()=>{const {p,record}=saved();assert.equal(record.plan.version,6);assert.equal(record.plan.audioSamples,24024);assert.ok(record.plan.sources.some(s=>s.assetId===effect.id));assert.equal(record.plan.takes.length,0);assert.throws(()=>compileMediaEdit(studio,p.id,{...edit(),audioPolicy:'soundtrack-or-silence'}),/sound_policy_required/);assert.throws(()=>compileMediaEdit(studio,p.id,{...edit(),soundStage:null}),/media_edit_policy/);});
test('invalid stream and source ranges fail before timeline revision changes',()=>{const {p,record}=saved();for(const patch of [{streamIndex:42},{sourceInSample:5000}]){const e=edit();Object.assign(e.soundStage.tracks[0].clips[0],patch);assert.throws(()=>studio.saveTimeline(p.id,record.revision,e),/sound_stream_required|sound_source_range/);}assert.equal(studio.getTimeline(p.id).revision,record.revision);});
test('decoded mix matches an independent per-sample arithmetic oracle across 24024 frames',async()=>{
 const e=edit(),{folder,result}=await sound(e),actual=await decoded(path.join(folder,'mix-48k.wav'));
 assert.equal(actual.length,24024*2);assert.equal(result.report.overloadSamples,0);let maximum=0;
 for(let n=0;n<24024;n++)for(let channel=0;channel<2;channel++){
   let lane=0;for(const c of e.soundStage.tracks[0].clips){const j=n-c.atSample;if(j<0||j>=c.samples)continue;
     let fade=1;if(c.fadeInSamples&&j<c.fadeInSamples)fade=c.fadeInSamples===1?0:j/(c.fadeInSamples-1);
     const left=c.samples-1-j;if(c.fadeOutSamples&&left<c.fadeOutSamples)fade*=c.fadeOutSamples===1?0:left/(c.fadeOutSamples-1);
     lane+=effectCode(c.sourceInSample+j,channel)/8388608*10**((-6+c.gainDb)/20)*fade;
   }
   const expected=Math.fround(((n<16000?masterCode(n,channel)/8388608:0)+Math.fround(lane))*10**(-2.3/20));
   maximum=Math.max(maximum,Math.abs(actual[n*2+channel]-expected));
 }
 assert.ok(maximum<=2/8388608,'PCM quantization error '+maximum);
 assert.ok(actual.slice(16000*2).every(v=>v===0));assert.equal(result.report.normalization,false);assert.equal(result.report.limiter,false);
});
test('stems are aligned and master source prefix remains bit-identical',async()=>{
 const {folder,result}=await sound();const original=await decoded(studio.assetPath(master.id)),aligned=await decoded(path.join(folder,'master-48k.wav'));
 assert.deepEqual(aligned.slice(0,original.length),original);assert.ok(aligned.slice(original.length).every(v=>v===0));
 const stem=await decoded(path.join(folder,'stem-01-48k-f32.wav'));assert.equal(stem.length,24024*2);assert.ok(stem.slice(0,111*2).every(v=>v===0));
 const report=JSON.parse(await fs.readFile(path.join(folder,'sound-report.json'),'utf8'));assert.equal(report.tracks[0].label,'Rain & texture');assert.equal(report.report.stemPolicy,result.report.stemPolicy);
 for(const f of result.files)assert.equal(await fileDigest(path.join(folder,f.name)),f.sha256);
});
test('solo excludes the song while stems preserve excluded lanes for remixing',async()=>{
 const e=edit();e.soundStage.outputGainDb=0;e.soundStage.tracks[0].solo=true;
 const {folder,result}=await sound(e),mix=await decoded(path.join(folder,'mix-48k.wav')),stem=await decoded(path.join(folder,'stem-01-48k-f32.wav'));
 assert.equal(result.report.audibility.master,false);assert.ok(mix.every((x,i)=>Math.abs(x-stem[i])<2/8388608));assert.ok(mix.slice(0,111*2).every(v=>v===0));
});
test('muted solo yields explicit silence, not fallback to the master',async()=>{
 const e=edit();e.soundStage.tracks[0].solo=true;e.soundStage.tracks[0].mute=true;
 const {folder}=await sound(e),mix=await decoded(path.join(folder,'mix-48k.wav')),stem=await decoded(path.join(folder,'stem-01-48k-f32.wav'));
 assert.ok(mix.every(v=>v===0));assert.ok(stem.some(v=>v!==0));
});
test('mono camera stream is deliberate, sample-placed and unity dual-mono',async()=>{
 const stream=getMediaProfile(studio,camera.id).audio[0].index;
 const e=edit({soundtrack:null});e.soundStage={...emptySoundStage(),tracks:[track({gainDb:0,clips:[clip({assetId:camera.id,streamIndex:stream,atSample:2002,sourceInSample:11,samples:1200,gainDb:0,fadeInSamples:0,fadeOutSamples:0})]})]};
 const {folder,record}=await sound(e),mix=await decoded(path.join(folder,'mix-48k.wav'));
 assert.ok(record.plan.warnings.some(w=>w.includes('not automatic camera sync')));assert.ok(mix.slice(0,2002*2).every(v=>v===0));assert.equal(mix[2002*2],.0625);assert.equal(mix[2002*2+1],.0625);assert.ok(mix.slice(3202*2).every(v=>v===0));
});
test('44.1 kHz source resamples before an exact 48 kHz source trim and placement',async()=>{
 const e=edit({soundtrack:null});e.soundStage={...emptySoundStage(),tracks:[track({gainDb:0,clips:[clip({assetId:rate441.id,atSample:37,sourceInSample:17,samples:3000,gainDb:0,fadeInSamples:0,fadeOutSamples:0})]})]};
 const {folder}=await sound(e),mix=await decoded(path.join(folder,'mix-48k.wav'));assert.ok(mix.slice(0,74).every(v=>v===0));assert.ok(Math.abs(mix[37*2]-.0625)<1e-6);assert.ok(mix.slice(3037*2).every(v=>v===0));
});
test('picture-end truncation does not restart or squeeze an authored fade',async()=>{
 const e=edit({soundtrack:null});e.soundStage={...emptySoundStage(),tracks:[track({gainDb:0,clips:[clip({assetId:mono.id,atSample:23024,sourceInSample:0,samples:2000,gainDb:0,fadeInSamples:2000,fadeOutSamples:0})]})]};
 const {folder,record}=await sound(e),mix=await decoded(path.join(folder,'mix-48k.wav'));assert.ok(record.plan.warnings.some(w=>w.includes('beyond picture')));assert.ok(Math.abs(mix.at(-1)-.0625*999/1999)<2/8388608);assert.equal(record.timeline.soundStage.tracks[0].clips[0].samples,2000);
});
test('overload aborts rather than limiting and does not publish a listening mix',async()=>{
 const e=edit();e.soundStage.outputGainDb=0;e.soundStage.tracks[0].gainDb=12;e.soundStage.tracks[0].clips=[clip({assetId:master.id,gainDb:12,fadeInSamples:0,fadeOutSamples:0})];
 const {p,record}=saved(e),before=studio.list('listening-mix').length;
 await assert.rejects(()=>renderListeningMix(studio,p.id,{baseRevision:record.revision}),err=>{assert.equal(err.message,'sound_mix_clipping');assert.ok(err.publicDetails.overloadSamples>0);assert.ok(err.publicDetails.suggestedOutputGainDb<0);return true;});
 assert.equal(studio.list('listening-mix').length,before);assert.equal(studio.getTimeline(p.id).revision,record.revision);assert.deepEqual(await fs.readdir(path.join(studio.root,'media-tmp')),[]);
 const quieter=structuredClone(e);quieter.soundStage.outputGainDb=-12;const rec=studio.saveTimeline(p.id,record.revision,quieter);const accepted=await renderListeningMix(studio,p.id,{baseRevision:rec.revision});assert.equal(accepted.report.overloadSamples,0);
});
test('sample-range shortfall is caught by actual decoder length even with loose metadata',async()=>{
 const profile=getMediaProfile(studio,effect.id),modified={...profile,duration:100,audio:profile.audio.map(s=>({...s,durationTicks:null}))};studio.write('media-profile',modified);
 try{const e=edit();e.soundStage.tracks[0].clips=[clip({sourceInSample:9500,samples:1000,fadeInSamples:0,fadeOutSamples:0})];const {p,record}=saved(e);await assert.rejects(()=>renderListeningMix(studio,p.id,{baseRevision:record.revision}),/sound_decoded_range/);}
 finally{studio.write('media-profile',profile);}
});
test('listening mix is revision-bound, immutable, and carries matching audio identity',async()=>{
 const {p,record}=saved();await assert.rejects(()=>renderListeningMix(studio,p.id,{baseRevision:record.revision-1}),/revision_conflict/);
 const mix=await renderListeningMix(studio,p.id,{baseRevision:record.revision});assert.equal(mix.revision,record.revision);assert.equal(mix.identity,soundIdentity(record.timeline));assert.equal(mix.planHash,record.plan.hash);assert.equal(studio.getTimeline(p.id).revision,record.revision);assert.equal(getMediaProfile(studio,mix.assetId).kind,'audio');
});
test('full picture export uses the mix, includes stems and points XML/OTIO at the correct audio',async()=>{
 const {p,record}=saved(),cut=await renderMediaEdit(studio,p.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});
 const folder=path.join(studio.root,'media-renders',cut.bridgeFolder);assert.ok(cut.bridgeFiles.includes('mix-48k.wav'));assert.ok(cut.bridgeFiles.includes('master-48k.wav'));assert.ok(cut.bridgeFiles.includes('stem-01-48k-f32.wav'));assert.ok(cut.bridgeFiles.includes('sound-report.json'));assert.ok(cut.bridgeFiles.includes('shutter-handoff.zip'));
 const xml=await fs.readFile(path.join(folder,'timeline.xml'),'utf8'),otio=JSON.parse(await fs.readFile(path.join(folder,'timeline.otio'),'utf8'));
 assert.match(xml,/<pathurl>mix-48k.wav<\/pathurl>/);assert.doesNotMatch(xml,/master-48k.wav/);assert.equal(otio.tracks.children[1].children[0].media_references.DEFAULT_MEDIA.target_url,'mix-48k.wav');
 const pinfo=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',studio.assetPath(cut.output)]));assert.equal(pinfo.streams.find(s=>s.codec_type==='video').nb_read_frames,'12');assert.equal(pinfo.streams.find(s=>s.codec_type==='audio').sample_rate,'48000');
});
test('empty stage can deliver explicit silence without a pretend master',async()=>{const e=edit({soundtrack:null,soundStage:emptySoundStage()}),{folder}=await sound(e);assert.ok((await decoded(path.join(folder,'mix-48k.wav'))).every(v=>v===0));});
test('original synthetic master, camera, photo and sound bytes remain unchanged',async()=>{for(const [id,hash]of hashes)assert.equal(await fileDigest(studio.assetPath(id)),hash);});

test('oversized sound work is refused before allocating or decoding large media',()=>{
 const {record}=saved();assert.ok(checkSoundBudget(record.plan)>0);const large={...record.plan,audioSamples:48000*14400,soundStage:{...emptySoundStage(),tracks:Array.from({length:8},(_,i)=>track({id:'lane'+i,clips:[]}))}};
 assert.throws(()=>checkSoundBudget(large),/sound_work_budget/);
});
test('a newer saved cut cannot relabel an in-flight listening mix as that newer revision',async()=>{
 const {p,record}=saved(),pending=renderListeningMix(studio,p.id,{baseRevision:record.revision});
 const next=structuredClone(record.timeline);next.soundStage.outputGainDb=-9;const newer=studio.saveTimeline(p.id,record.revision,next);
 const mix=await pending;assert.equal(mix.revision,record.revision);assert.equal(mix.identity,soundIdentity(record.timeline));assert.notEqual(mix.identity,soundIdentity(newer.timeline));assert.equal(studio.getTimeline(p.id).revision,newer.revision);
});
test('nonfinite decoded samples never become a ready output',async()=>{
 const raw=path.join(root,'nonfinite.raw'),wav=path.join(root,'nonfinite.wav'),b=Buffer.alloc(4800*8);for(let i=0;i<4800*2;i++)b.writeFloatLE(i===200?NaN:0,i*4);
 await fs.writeFile(raw,b);await runMedia('ffmpeg',['-v','error','-f','f32le','-ar','48000','-ac','2','-i',raw,'-c:a','pcm_f32le',wav]);const a=await importMediaFile(studio,wav,{name:'synthetic invalid float.wav'});
 const e=edit({soundtrack:null});e.soundStage.tracks[0].clips=[clip({assetId:a.id,sourceInSample:0,samples:4800,fadeInSamples:0,fadeOutSamples:0})];const {p,record}=saved(e);
 await assert.rejects(()=>renderListeningMix(studio,p.id,{baseRevision:record.revision}),/sound_nonfinite|media_decode_failed/);assert.equal(studio.list('listening-mix').filter(m=>m.projectId===p.id).length,0);
});
