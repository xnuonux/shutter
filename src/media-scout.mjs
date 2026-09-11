/** Bounded local scene-change observations and a visual contact sheet. No semantic model. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fingerprint} from './store.mjs';
import {verifyMediaAsset,getMediaProfile,decoderArgs,fileDigest,runMedia} from './media-io.mjs';
import {inspectProcess} from './media-inspect.mjs';
import {MEMORY_LIMITS,memoryRange,secondsUs,memoryId} from '../public/memory-contract.mjs';
export function scoutSegments(startUs,endUs,changes){
  memoryRange(startUs,endUs);if(endUs-startUs>MEMORY_LIMITS.scoutUs)throw Error('scout_range_limit');
  if(!Array.isArray(changes)||changes.length>MEMORY_LIMITS.scenes||changes.some(t=>!Number.isSafeInteger(t)||t<startUs||t>endUs))throw Error('scout_scene_limit');
  const cuts=[startUs,...new Set(changes.filter(t=>t>startUs&&t<endUs)),endUs].sort((a,b)=>a-b),ranges=[];
  for(let i=1;i<cuts.length;i++){
    // Long continuous shots still get browsable windows; those divisions are not claimed as edits.
    for(let at=cuts[i-1];at<cuts[i];at+=10e6)ranges.push({startUs:at,endUs:Math.min(cuts[i],at+10e6),boundary:at===cuts[i-1]&&i>1?'scene-change-observation':'browsing-window'});
  }
  if(ranges.length>MEMORY_LIMITS.scenes+12)throw Error('scout_scene_limit');return ranges;
}
function scanOptions(input,profile){
  if(!input||Object.keys(input).some(k=>!['startUs','endUs','threshold'].includes(k)))throw Error('scout_options');
  const {startUs,endUs}=memoryRange(input.startUs,input.endUs),threshold=input.threshold??10;
  if(profile.kind!=='video')throw Error('scout_video_required');
  if(endUs-startUs>MEMORY_LIMITS.scoutUs||endUs>Math.floor(profile.duration*1e6))throw Error('scout_range_limit');
  if(!Number.isInteger(threshold)||threshold<1||threshold>50)throw Error('scout_threshold');
  return {startUs,endUs,threshold};
}
export async function scoutAsset(studio,assetId,input,{signal}={}){
  if(signal?.aborted)throw Error('scout_cancelled');
  const asset=await verifyMediaAsset(studio,assetId),profile=getMediaProfile(studio,assetId),options=scanOptions(input,profile);
  if(['smpte2084','arib-std-b67'].includes(profile.color?.transfer))throw Error('hdr_transform_required');
  const id='scout_'+fingerprint({schema:'shutter-scout-v1',assetId,sourceSha256:asset.sha256,options});
  const checkIdentity=()=>{const row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);if(row&&row.kind!=='memory-scout')throw Error('memory_identity_conflict');};checkIdentity();
  let prior;try{prior=studio.read(id,'memory-scout');}catch(e){if(e.message!=='not_found')throw e;}
  if(prior){try{for(const image of prior.images)await readScoutImage(studio,id,image.index);return {...prior,cached:true};}catch(e){if(e.code!=='ENOENT'&&e.message!=='scout_cache_integrity')throw e;}}
  const root=path.join(studio.root,'memory-cache');await fs.mkdir(root,{recursive:true});if((await fs.lstat(root)).isSymbolicLink())throw Error('scout_cache_integrity');const folder=await fs.mkdtemp(path.join(root,'scout-'));
  let published=false;
  try {
    const changes=[],start=options.startUs/1e6,end=options.endUs/1e6;
    // Retain source-relative timestamps; reset original PTS once, before trimming.
    await inspectProcess('ffmpeg',['-hide_banner','-v','error','-nostdin',...decoderArgs,'-t',String(end),'-i',studio.assetPath(assetId),'-map',`0:${profile.videoStream}`,
      '-vf',`setpts=PTS-STARTPTS,trim=start=${start}:end=${end},scale=320:-2,scdet=t=${options.threshold},metadata=mode=select:key=lavfi.scd.time,metadata=mode=print:key=lavfi.scd.time:file=-`,
      '-an','-sn','-dn','-threads','2','-filter_threads','1','-f','null','-'],{
        signal,timeoutMs:180000,maxBytes:2*1024*1024,onLine:line=>{const match=/^lavfi\.scd\.time=(\d+(?:\.\d{1,6})?)$/.exec(line);if(match){changes.push(secondsUs(match[1]));if(changes.length>MEMORY_LIMITS.scenes)throw Error('scout_scene_limit');}}
      });
    const ranges=scoutSegments(options.startUs,options.endUs,changes),images=[];
    const selected=ranges.length<=MEMORY_LIMITS.thumbnails?ranges:ranges.filter((_,i)=>Array.from({length:MEMORY_LIMITS.thumbnails},(_,j)=>Math.floor(j*(ranges.length-1)/(MEMORY_LIMITS.thumbnails-1))).includes(i));
    for(let i=0;i<selected.length;i++){
      if(signal?.aborted)throw Error('scout_cancelled');
      const range=selected[i],nominalFrameUs=profile.fps?Math.ceil(1e6*profile.fps.d/profile.fps.n):0,timeUs=Math.max(range.startUs,Math.min(Math.floor((range.startUs+range.endUs)/2),range.endUs-nominalFrameUs)),name=`frame-${i}.jpg`,target=path.join(folder,name);
      // Decode/trim from the original (never an H.264 viewing proxy). Not a calibrated reference.
      await inspectProcess('ffmpeg',['-hide_banner','-v','error','-nostdin',...decoderArgs,'-t',String(end),'-i',studio.assetPath(assetId),'-map',`0:${profile.videoStream}`,
        '-vf',`setpts=PTS-STARTPTS,trim=start=${timeUs/1e6},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1`,
        '-frames:v','1','-an','-c:v','mjpeg','-q:v','4','-threads','1','-filter_threads','1','-update','1',target],{signal,timeoutMs:180000,maxBytes:65536});
      const stat=await fs.stat(target);if(stat.size<1||stat.size>256*1024)throw Error('scout_image_size');
      images.push({...range,index:i,timeUs,name,sha256:await fileDigest(target)});
    }
    await verifyMediaAsset(studio,assetId);if(signal?.aborted)throw Error('scout_cancelled');
    const engine=(await runMedia('ffmpeg',['-version'],{timeoutMs:5000})).split('\n')[0];
    checkIdentity();
    const result=studio.write('memory-scout',{id,schema:'shutter-scout-v1',assetId,sourceSha256:asset.sha256,options,
      folder:path.basename(folder),images,ranges,sceneTimesUs:changes,createdAt:new Date().toISOString(),
      engine,
      evidence:'FFmpeg scdet observations + fixed browsing windows; not scene understanding',
      sampledRanges:images.length,totalRanges:ranges.length,color:'unmanaged browsing thumbnails, not generation/color proofs'});
    published=true;if(prior&&/^scout-[A-Za-z0-9]+$/.test(prior.folder)){await fs.rm(path.join(root,prior.folder),{recursive:true,force:true});}return {...result,...(prior?{rebuilt:true}:{})};
  }finally{if(!published)await fs.rm(folder,{recursive:true,force:true});}
}
export async function readScoutImage(studio,id,index){
  memoryId(id);if(!Number.isInteger(index)||index<0||index>=MEMORY_LIMITS.thumbnails)throw Error('not_found');
  const record=studio.read(id,'memory-scout'),image=record.images.find(i=>i.index===index);
  if(!image||!/^scout-[A-Za-z0-9]+$/.test(record.folder)||image.name!==`frame-${index}.jpg`)throw Error('not_found');
  const directory=path.join(studio.root,'memory-cache',record.folder);const parent=await fs.lstat(directory);if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('scout_cache_integrity');
  const file=path.join(directory,image.name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>256*1024||await fileDigest(file)!==image.sha256)throw Error('scout_cache_integrity');
  return fs.readFile(file);
}
