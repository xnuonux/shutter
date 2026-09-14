/** A bounded review of the saved composite, on its original scene clock. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateSchema} from '../public/action-contract.mjs';
import {SCENE_REVIEW_SCHEMA as schema,SCENE_REVIEW_INPUT} from '../public/scene-review-contract.mjs';
import {advanceSource,samplingFor} from '../public/music-edit.mjs';
import {emptySoundStage,samplesAtFrame} from '../public/sound-edit.mjs';
import {isPrepared709,COLOR_TAG_ARGS} from '../public/color-contract.mjs';
import {fingerprint} from './store.mjs';
import {sceneIntent} from './director-actions.mjs';
import {verifyMediaAsset,getMediaProfile,decoderArgs,fileDigest,rational,rateText,rateValue} from './media-io.mjs';
import {inspectProcess} from './media-inspect.mjs';
import {mediaPictureFilters,MEDIA_EDIT_FORMAT} from './media-edit.mjs';
import {burnedCues,burnTextPicture,preflightText,textFont} from './media-text.mjs';
import {renderSoundStageInterval} from './media-sound.mjs';

const limits={preview:64*1024*1024,audio:1024*1024,wave:10*1024*1024,frame:256*1024};
const rootFor=studio=>path.join(studio.root,'scene-reviews');
const cancelled=signal=>{if(signal?.aborted)throw Error('scene_review_cancelled');};
async function directorySafe(dir){const s=await fs.lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw Error('scene_review_cache_integrity');}
async function cleanPartial(root,folder){
  const relative=path.relative(path.resolve(root),path.resolve(folder));
  if(!/^review-[A-Za-z0-9]+$/.test(relative)||path.isAbsolute(relative))throw Error('scene_review_cache_integrity');
  await fs.rm(folder,{recursive:true,force:true});
}
function publicResult(record,cached){const {folder,...value}=record;return {...value,cached};}
export async function readSceneReviewFile(studio,projectId,id,item){
  if(!/^scene_review_[a-f0-9]{64}$/.test(id)||(!['preview','audio','wave'].includes(item)&&(!Number.isInteger(item)||item<0||item>=12)))throw Error('not_found');
  const record=studio.read(id,'scene-review');
  if(record.projectId!==projectId||!/^review-[A-Za-z0-9]+$/.test(record.folder))throw Error('not_found');
  const meta=typeof item==='number'?record.frames.find(f=>f.index===item):item==='preview'?record.preview:record.audio;
  if(!meta)throw Error('not_found');
  const sha256=item==='wave'?meta.waveSha256:meta.sha256,name=typeof item==='number'?`frame-${item}.jpg`:({preview:'preview.mp4',audio:'audio.mp3',wave:'mix-48k.wav'})[item];
  const root=rootFor(studio),folder=path.join(root,record.folder),file=path.join(folder,name),max=limits[typeof item==='number'?'frame':item];
  await directorySafe(root);await directorySafe(folder);const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)throw Error('scene_review_cache_integrity');
  const bytes=await fs.readFile(file);
  if(bytes.length>max||crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('scene_review_cache_integrity');
  return bytes;
}
function context(studio,projectId,input){
  const record=studio.getTimeline(projectId),plan=record.plan;
  if(record.timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');
  if(record.revision!==input.baseRevision)throw Error('revision_conflict');
  const frames=input.endFrame-input.startFrame;
  if(frames<2||frames/rateValue(rational(plan.fps))>30||input.endFrame>plan.frames)throw Error('scene_review_range');
  const visible=(plan.pictureClips||plan.clips).filter(c=>c.at<input.endFrame&&c.at+c.frames>input.startFrame);
  if(visible.length>64)throw Error('scene_review_picture_limit');
  const selections=visible.map(c=>{
    const start=Math.max(input.startFrame,c.at),end=Math.min(input.endFrame,c.at+c.frames),clock=samplingFor(c,plan.fps);
    const offsetFrames=c.sourceKind==='image'?0:clock.offsetFrames+start-c.at;
    return {...c,at:start,frames:end-start,sourceStart:c.sourceKind==='image'?'0/1':advanceSource(clock.origin,offsetFrames,plan.fps),sampling:{origin:clock.origin,offsetFrames}};
  });
  if(selections.reduce((n,c)=>n+c.frames,0)!==frames)throw Error('scene_review_picture_missing');
  const intent=sceneIntent(studio,projectId,plan.clips.filter(c=>c.at<input.endFrame&&c.at+c.frames>input.startFrame).map(c=>c.id));
  return {plan,selections,intent,font:burnedCues(plan).length?textFont():null};
}
export async function reviewScene(studio,projectId,input,{signal}={}){
  validateSchema(SCENE_REVIEW_INPUT,input);cancelled(signal);
  const options={...input,frameCount:input.frameCount??8},initial=context(studio,projectId,options),{plan,selections,intent}=initial;
  const contextHash=fingerprint(initial),id='scene_review_'+fingerprint({schema,projectId,options,contextHash});
  const startSample=samplesAtFrame(input.startFrame,plan.fps),endSample=samplesAtFrame(input.endFrame,plan.fps);
  const sourceIds=new Set(selections.map(c=>c.assetId));
  if(plan.soundtrack)sourceIds.add(plan.soundtrack.assetId);
  for(const track of plan.soundStage?.tracks||[])for(const c of track.clips)if(c.atSample<endSample&&c.atSample+c.samples>startSample)sourceIds.add(c.assetId);
  signal=AbortSignal.any([AbortSignal.timeout(180000),...(signal?[signal]:[])]);
  const fresh=async()=>{
    for(const assetId of sourceIds)await verifyMediaAsset(studio,assetId);
    cancelled(signal);
    if(fingerprint(context(studio,projectId,options))!==contextHash)throw Error('scene_review_context_conflict');
    const row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);if(row&&row.kind!=='scene-review')throw Error('scene_review_identity_conflict');
  };
  await fresh();let prior;try{prior=studio.read(id,'scene-review');}catch(e){if(e.message!=='not_found')throw e;}
  if(prior){try{
    await readSceneReviewFile(studio,projectId,id,'preview');if(prior.audio){await readSceneReviewFile(studio,projectId,id,'audio');await readSceneReviewFile(studio,projectId,id,'wave');}
    for(const frame of prior.frames)await readSceneReviewFile(studio,projectId,id,frame.index);
    await fresh();return publicResult(prior,true);
  }catch(e){if(e.code!=='ENOENT'&&e.message!=='scene_review_cache_integrity')throw e;}}
  await preflightText(plan);cancelled(signal);
  const root=rootFor(studio);await fs.mkdir(root,{recursive:true});await directorySafe(root);
  const folder=await fs.mkdtemp(path.join(root,'review-'));let published=false;
  const run=(tool,args)=>inspectProcess(tool,args,{signal,timeoutMs:180000,maxBytes:65536});
  const probe=async file=>JSON.parse((await run('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',file])).stdout).streams;
  const checkVideo=(streams,frames,width,height)=>{
    const v=streams.find(s=>s.codec_type==='video');
    if(Number(v?.nb_read_frames)!==frames||v.width!==width||v.height!==height||rateText(rational(v.avg_frame_rate))!==plan.fps)throw Error('scene_review_frame_contract');
  };
  try{
    const shots=[];let workBytes=0;
    for(const [i,c] of selections.entries()){
      const profile=getMediaProfile(studio,c.assetId),name=`shot-${i}.mp4`,target=path.join(folder,name);
      await run('ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,...(profile.kind==='image'?['-loop','1','-framerate',plan.fps]:[]),
        '-i',studio.assetPath(c.assetId),'-map',`0:${profile.videoStream}`,'-vf',mediaPictureFilters(plan,c,profile),'-r',plan.fps,'-fps_mode','cfr',
        '-frames:v',String(c.frames),'-an','-sn','-dn','-c:v','libx264','-preset','fast','-crf','18','-threads','2','-filter_threads','1',
        ...(isPrepared709(profile)?COLOR_TAG_ARGS:[]),'-video_track_timescale',String(rational(plan.fps).n),'-map_metadata','-1','-movflags','+faststart','-fs',String(limits.preview),target]);
      checkVideo(await probe(target),c.frames,plan.width,plan.height);workBytes+=(await fs.stat(target)).size;
      if(workBytes>128*1024*1024)throw Error('scene_review_work_size');shots.push(name);
    }
    const concat=path.join(folder,'concat.txt'),picture=path.join(folder,'picture.mp4');
    await fs.writeFile(concat,shots.map(name=>`file '${name}'`).join('\n')+'\n');
    await run('ffmpeg',['-v','error','-nostdin','-f','concat','-safe','1','-i',concat,'-map','0:v:0','-c','copy','-movflags','+faststart',picture]);
    let silent=picture,textEvidence=null;
    const frames=input.endFrame-input.startFrame;
    if(burnedCues(plan).some(c=>c.startFrame<input.endFrame&&c.endFrame>input.startFrame)){
      silent=path.join(folder,'text-picture.mp4');textEvidence=await burnTextPicture(plan,folder,picture,silent,{offset:input.startFrame,count:frames,signal});
    }
    const prefix=`/api/media/productions/${encodeURIComponent(projectId)}/reviews/${id}`;
    let audio=null;
    if(plan.soundStage||plan.soundtrack){
      await renderSoundStageInterval(studio,{...plan,soundStage:plan.soundStage||emptySoundStage()},folder,{startSample,endSample,signal});
      const wave=path.join(folder,'mix-48k.wav'),mp3=path.join(folder,'audio.mp3');
      await run('ffmpeg',['-v','error','-nostdin','-i',wave,'-map','0:a:0','-c:a','libmp3lame','-b:a','160k','-map_metadata','-1',mp3]);
      if((await fs.stat(wave)).size>limits.wave||(await fs.stat(mp3)).size>limits.audio)throw Error('scene_review_audio_size');
      audio={url:prefix+'/audio',sha256:await fileDigest(mp3),waveUrl:prefix+'/wave',waveSha256:await fileDigest(wave),startSample,endSample,samples:endSample-startSample,sampleRate:48000,channels:2};
    }
    const scale=Math.min(1,1280/Math.max(plan.width,plan.height)),width=Math.max(2,Math.floor(plan.width*scale/2)*2),height=Math.max(2,Math.floor(plan.height*scale/2)*2),preview=path.join(folder,'preview.mp4');
    await run('ffmpeg',['-v','error','-nostdin','-i',silent,...(audio?['-i',path.join(folder,'mix-48k.wav')]:[]),'-map','0:v:0',
      ...(audio?['-map','1:a:0','-c:a','aac','-b:a','320k']:['-an']),
      ...(scale<1?['-vf',`scale=${width}:${height}:flags=lanczos,setsar=1`,'-c:v','libx264','-preset','fast','-crf','18','-threads','2','-filter_threads','1']:['-c:v','copy']),
      '-map_metadata','-1','-video_track_timescale',String(rational(plan.fps).n),'-movflags','+faststart','-fs',String(limits.preview),preview]);
    const streams=await probe(preview);checkVideo(streams,frames,width,height);
    if(streams.filter(s=>s.codec_type==='audio').length!==(audio?1:0)||(await fs.stat(preview)).size>limits.preview)throw Error('scene_review_preview_contract');
    const count=Math.min(options.frameCount,frames),pictures=[],thumbScale=Math.min(1,640/Math.max(width,height)),tw=Math.max(2,Math.floor(width*thumbScale/2)*2),th=Math.max(2,Math.floor(height*thumbScale/2)*2);
    for(let index=0;index<count;index++){
      const previewFrame=Math.floor(index*(frames-1)/(count-1)),sceneFrame=input.startFrame+previewFrame,file=path.join(folder,`frame-${index}.jpg`);
      await run('ffmpeg',['-v','error','-nostdin',...decoderArgs,'-i',preview,'-vf',`select=eq(n\\,${previewFrame}),scale=${tw}:${th}:flags=lanczos`,
        '-frames:v','1','-an','-c:v','mjpeg','-q:v','3','-threads','1','-filter_threads','1','-update','1',file]);
      if((await fs.stat(file)).size>limits.frame)throw Error('scene_review_image_size');
      pictures.push({index,previewFrame,sceneFrame,previewTime:advanceSource('0',previewFrame,plan.fps),sceneTime:advanceSource('0',sceneFrame,plan.fps),sha256:await fileDigest(file),url:`${prefix}/frames/${index}`});
    }
    const keep=new Set(['preview.mp4',...(audio?['audio.mp3','mix-48k.wav']:[]),...pictures.map(f=>`frame-${f.index}.jpg`)]);
    for(const name of await fs.readdir(folder))if(!keep.has(name))await fs.rm(path.join(folder,name));
    const sha256=await fileDigest(preview);await fresh();
    const result=studio.write('scene-review',{schema,id,projectId,baseRevision:input.baseRevision,planHash:plan.hash,startFrame:input.startFrame,endFrame:input.endFrame,fps:plan.fps,intent,
      frameCount:options.frameCount,frames:pictures,selections:selections.map(({sampling,...c})=>({...c,sampling})),
      preview:{url:prefix+'/preview',sha256,fps:plan.fps,frames,width,height,durationSeconds:frames/rateValue(rational(plan.fps)),audio:audio?'mixed':'none'},
      ...(audio?{audio}:{}),...(textEvidence?{textEvidence}:{}),folder:path.basename(folder),
      sampling:{method:'Evenly spaced composite playback frames including first and last',maxGapFrames:Math.ceil((frames-1)/(count-1)),sampledFrames:count,totalFrames:frames},
      limitations:['Review of this saved revision and scene interval only. Later edits require a new review. No footage, timeline, note or delivery is created.',
        'Unmanaged SDR review; display size may be reduced. Sidecar-only captions follow delivery policy and are not burned into playback.',
        'Images omit intervening frames. A playback URL is not evidence that an AI watched the video or heard its mix. Audio-capable clients must request audio explicitly.',
        'The authored sound mix retains the global sample clock and fades. Compressed playback may have codec padding; the WAV preserves the exact sample interval.',
        'Review evidence does not certify character, motion or story continuity.']});
    published=true;return publicResult(result,false);
  }finally{if(!published)await cleanPartial(root,folder);}
}
