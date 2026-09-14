/** Short silent source playback and ordered sampled pictures, using the exporter's clock. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateSchema} from '../public/action-contract.mjs';
import {SOURCE_INSPECTION_SCHEMA as schema,SOURCE_INSPECTION_INPUT} from '../public/source-inspection-contract.mjs';
import {advanceSource} from '../public/music-edit.mjs';
import {fingerprint} from './store.mjs';
import {verifyMediaAsset,getMediaProfile,decoderArgs,fileDigest} from './media-io.mjs';
import {inspectProcess} from './media-inspect.mjs';
import {mediaPictureFilters} from './media-edit.mjs';

const fps='24/1',maxPreviewBytes=16*1024*1024,maxImageBytes=256*1024;
const rootFor=studio=>path.join(studio.root,'source-inspections');
const cancelled=signal=>{if(signal?.aborted)throw Error('source_inspection_cancelled');};
async function safeDirectory(dir){const stat=await fs.lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('source_inspection_cache_integrity');}
function publicResult(record,cached){const {folder,...value}=record;return {...value,cached};}
async function removePartial(root,folder){
  const relative=path.relative(path.resolve(root),path.resolve(folder));
  if(!/^range-[A-Za-z0-9]+$/.test(relative)||path.isAbsolute(relative))throw Error('source_inspection_cache_integrity');
  await fs.rm(folder,{recursive:true,force:true});
}
export async function readSourceInspectionFile(studio,id,index){
  if(!/^inspection_[a-f0-9]{64}$/.test(id)||(index!=='preview'&&(!Number.isInteger(index)||index<0||index>=12)))throw Error('not_found');
  const record=studio.read(id,'source-inspection'),item=index==='preview'?record.preview:record.frames.find(f=>f.index===index);
  if(!item||!/^range-[A-Za-z0-9]+$/.test(record.folder))throw Error('not_found');
  const root=rootFor(studio),folder=path.join(root,record.folder);await safeDirectory(root);await safeDirectory(folder);
  const file=path.join(folder,index==='preview'?'preview.mp4':`frame-${index}.jpg`),max=index==='preview'?maxPreviewBytes:maxImageBytes,stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>max)throw Error('source_inspection_cache_integrity');
  const bytes=await fs.readFile(file);if(bytes.length>max||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('source_inspection_cache_integrity');
  return bytes;
}
export async function inspectSourceRange(studio,assetId,input,{signal}={}){
  validateSchema(SOURCE_INSPECTION_INPUT,input);cancelled(signal);
  const options={...input,frameCount:input.frameCount??8},profile=getMediaProfile(studio,assetId);
  const durationUs=options.endUs-options.startUs,frames=Math.floor(durationUs*24/1e6);
  if(profile.kind!=='video')throw Error('source_inspection_video_required');
  if(durationUs<125000||durationUs>15e6||options.endUs>Math.floor(profile.duration*1e6))throw Error('source_inspection_range');
  if(['smpte2084','arib-std-b67'].includes(profile.color?.transfer))throw Error('hdr_transform_required');
  signal=AbortSignal.any([AbortSignal.timeout(90000),...(signal?[signal]:[])]);
  const asset=await verifyMediaAsset(studio,assetId),profileHash=fingerprint(profile);
  const id='inspection_'+fingerprint({schema,assetId,sourceSha256:asset.sha256,profileHash,options,fps});
  const fresh=async()=>{
    await verifyMediaAsset(studio,assetId);cancelled(signal);
    if(fingerprint(getMediaProfile(studio,assetId))!==profileHash)throw Error('source_inspection_context_conflict');
    const row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);if(row&&row.kind!=='source-inspection')throw Error('source_inspection_identity_conflict');
  };
  await fresh();let prior;try{prior=studio.read(id,'source-inspection');}catch(e){if(e.message!=='not_found')throw e;}
  if(prior){try{await readSourceInspectionFile(studio,id,'preview');for(const f of prior.frames)await readSourceInspectionFile(studio,id,f.index);await fresh();return publicResult(prior,true);}catch(e){if(e.code!=='ENOENT'&&e.message!=='source_inspection_cache_integrity')throw e;}}
  const root=rootFor(studio);await fs.mkdir(root,{recursive:true});await safeDirectory(root);
  const folder=await fs.mkdtemp(path.join(root,'range-'));let published=false;
  try{
    const plan={fps,width:640,height:360},sourceStart=`${options.startUs}/1000000`,clip={sourceStart,frames,fit:'contain'};
    const playback=path.join(folder,'preview.mp4');
    await inspectProcess('ffmpeg',['-v','error','-nostdin',...decoderArgs,'-i',studio.assetPath(assetId),'-map',`0:${profile.videoStream}`,
      '-vf',mediaPictureFilters(plan,clip,profile),'-frames:v',String(frames),'-an','-sn','-dn','-c:v','libx264','-preset','fast','-crf','23','-threads','2','-filter_threads','1',
      '-map_metadata','-1','-movflags','+faststart','-fs',String(maxPreviewBytes),playback],{signal,timeoutMs:90000,maxBytes:65536});
    const {stdout}=await inspectProcess('ffprobe',['-v','error',...decoderArgs,'-count_frames','-show_streams','-of','json',playback],{signal,timeoutMs:10000,maxBytes:65536});
    const streams=JSON.parse(stdout).streams,v=streams?.[0];
    if(streams?.length!==1||v.codec_type!=='video'||Number(v.nb_read_frames)!==frames||v.width!==640||v.height!==360||v.avg_frame_rate!==fps)throw Error('source_inspection_frame_contract');
    const prefix=`/api/media/inspections/${id}`,count=Math.min(options.frameCount,frames),pictures=[];
    for(let index=0;index<count;index++){
      cancelled(signal);const previewFrame=Math.floor(index*(frames-1)/(count-1)),file=path.join(folder,`frame-${index}.jpg`);
      await inspectProcess('ffmpeg',['-v','error','-nostdin',...decoderArgs,'-i',playback,'-vf',`select=eq(n\\,${previewFrame})`,'-frames:v','1','-an','-c:v','mjpeg','-q:v','3','-threads','1','-filter_threads','1','-update','1',file],{signal,timeoutMs:10000,maxBytes:65536});
      const stat=await fs.stat(file);if(stat.size<1||stat.size>maxImageBytes)throw Error('source_inspection_image_size');
      pictures.push({index,previewFrame,previewTime:advanceSource('0',previewFrame,fps),sourceTime:advanceSource(sourceStart,previewFrame,fps),sha256:await fileDigest(file),url:`${prefix}/frames/${index}`});
    }
    if((await fs.stat(playback)).size>maxPreviewBytes)throw Error('source_inspection_preview_size');
    const previewSha256=await fileDigest(playback);await fresh();
    const result=studio.write('source-inspection',{schema,id,assetId,sourceSha256:asset.sha256,options,frames:pictures,
      preview:{url:`${prefix}/preview`,sha256:previewSha256,fps,frames,width:640,height:360,durationSeconds:frames/24,audio:'omitted',
        sourceStart:advanceSource(sourceStart,0,fps),sourceEnd:advanceSource(sourceStart,frames,fps)},folder:path.basename(folder),
      sampling:{method:'24 fps resampling on the exporter source clock; evenly spaced playback frames including first and last',maxGapFrames:Math.ceil((frames-1)/(count-1)),sampledFrames:count,totalFrames:frames},
      limitations:['Silent unmanaged review playback, not a delivery or generation reference. Original footage remains unchanged.',
        'Source times label the nominal resampling clock, not original decoded-frame timestamps. Playback may omit a tail shorter than one 24 fps frame.',
        'The strip omits intervening frames. Request a shorter interval to inspect fast action; sampled pictures do not certify motion, identity or story continuity.']});
    published=true;return publicResult(result,false);
  }finally{if(!published)await removePartial(root,folder);}
}
