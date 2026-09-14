/** Local source pictures tied to a proposed edit. No generation or semantic approval. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {ACTION_VERSION,PROPOSAL_SELECTION_SCHEMA,validateSchema} from '../public/action-contract.mjs';
import {samplingFor,advanceSource} from '../public/music-edit.mjs';
import {previewActions,sceneIntent} from './director-actions.mjs';
import {fingerprint} from './store.mjs';
import {verifyMediaAsset,getMediaProfile,decoderArgs,fileDigest} from './media-io.mjs';
import {mediaPictureFilters} from './media-edit.mjs';
import {inspectProcess} from './media-inspect.mjs';

const schema='shutter-cutaway-evidence-v1',maxBytes=256*1024;
const inputSchema={type:'object',additionalProperties:false,required:['version','baseRevision','commands','previewHash','coverageId'],properties:{
  version:{const:ACTION_VERSION},baseRevision:{type:'integer',minimum:0},commands:{type:'array',minItems:1,maxItems:32,items:{type:'object'}},
  proposal:PROPOSAL_SELECTION_SCHEMA,
  previewHash:{type:'string',pattern:'^[a-f0-9]{64}$'},coverageId:{type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9_-]+$'}
}};
const at=(clips,frame)=>clips.find(c=>c.at<=frame&&frame<c.at+c.frames);
const cancelled=signal=>{if(signal?.aborted)throw Error('evidence_cancelled');};
function selection(clip,sceneFrame,fps,role){
  if(!clip)throw Error('evidence_picture_missing');
  const clock=samplingFor(clip,fps),offsetFrames=clip.sourceKind==='image'?0:clock.offsetFrames+sceneFrame-clip.at;
  const sourceStart=clip.sourceKind==='image'?'0/1':advanceSource(clock.origin,offsetFrames,fps);
  return {role,sceneFrame,sourceStart,assetId:clip.assetId,clipId:clip.id,layer:clip.layer||'main',fit:clip.fit,
    clip:{...clip,sourceStart,frames:1,sampling:{origin:clock.origin,offsetFrames}}};
}
function evidencePlan(studio,projectId,input){
  const preview=previewActions(studio,projectId,{version:input.version,baseRevision:input.baseRevision,commands:input.commands,...(input.proposal?{proposal:input.proposal}:{})});
  if(preview.previewHash!==input.previewHash)throw Error('action_preview_conflict');
  const plan=studio.timelinePlan(projectId,preview.result.timeline),coverage=plan.coverage?.find(c=>c.id===input.coverageId);
  if(!coverage)throw Error('evidence_coverage_missing');
  const start=coverage.at,end=start+coverage.frames,visible=plan.pictureClips||plan.clips,frames=[];
  const add=(role,frame,clip)=>frames.push(selection(clip,frame,plan.fps,role));
  if(start>0)add('entry-before',start-1,at(visible,start-1));
  add('entry-main',start,at(plan.clips,start));add('entry-alternate',start,{...coverage,layer:'coverage'});
  add('return-alternate',end-1,{...coverage,layer:'coverage'});add('return-main',end-1,at(plan.clips,end-1));
  if(end<plan.frames)add('return-after',end,at(visible,end));
  const intent=sceneIntent(studio,projectId,plan.clips.filter(c=>c.at<=end&&c.at+c.frames>Math.max(0,start-1)).map(c=>c.id));
  const id='evidence_'+fingerprint({schema,projectId,previewHash:preview.previewHash,coverageId:coverage.id,frames,intent});
  return {id,plan,intent,frames,interval:{at:start,end},binding:preview.proposal?{proposal:preview.proposal,proposalContext:preview.proposalContext}:{}};
}
function checkIdentity(studio,id){const row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);if(row&&row.kind!=='director-evidence')throw Error('evidence_identity_conflict');}
function publicManifest(record,cached){const {folder,...value}=record;return {...value,cached};}
const cacheRoot=studio=>path.join(studio.root,'director-evidence');
async function directorySafe(root){const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('evidence_cache_integrity');}
async function cleanPartial(root,folder){
  const relative=path.relative(path.resolve(root),path.resolve(folder));
  if(!/^cutaway-[A-Za-z0-9]+$/.test(relative)||path.isAbsolute(relative))throw Error('evidence_cache_integrity');
  await fs.rm(folder,{recursive:true,force:true});
}
export async function readCutawayFrame(studio,projectId,id,index){
  if(!/^evidence_[a-f0-9]{64}$/.test(id)||!Number.isInteger(index)||index<0||index>=6)throw Error('not_found');
  const record=studio.read(id,'director-evidence'),frame=record.frames.find(f=>f.index===index);
  if(record.projectId!==projectId||!frame||!/^cutaway-[A-Za-z0-9]+$/.test(record.folder))throw Error('not_found');
  const root=cacheRoot(studio),folder=path.join(root,record.folder);await directorySafe(root);await directorySafe(folder);
  const file=path.join(folder,`frame-${index}.jpg`),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size<1||stat.size>maxBytes)throw Error('evidence_cache_integrity');
  const bytes=await fs.readFile(file);
  if(bytes.length>maxBytes||crypto.createHash('sha256').update(bytes).digest('hex')!==frame.sha256)throw Error('evidence_cache_integrity');
  return bytes;
}
export async function inspectCutaway(studio,projectId,input,{signal}={}){
  validateSchema(inputSchema,input);cancelled(signal);
  signal=AbortSignal.any([AbortSignal.timeout(90000),...(signal?[signal]:[])]);
  const proposed=evidencePlan(studio,projectId,input),{id,plan,intent,frames,interval}=proposed;
  const ids=[...new Set(frames.map(f=>f.assetId))];
  const verify=async()=>{for(const assetId of ids){await verifyMediaAsset(studio,assetId);cancelled(signal);}};
  const fresh=()=>{if(evidencePlan(studio,projectId,input).id!==id)throw Error('evidence_intent_conflict');checkIdentity(studio,id);cancelled(signal);};
  checkIdentity(studio,id);await verify();fresh();
  let prior;try{prior=studio.read(id,'director-evidence');}catch(e){if(e.message!=='not_found')throw e;}
  if(prior){
    try{for(const frame of prior.frames)await readCutawayFrame(studio,projectId,id,frame.index);await verify();fresh();return publicManifest(prior,true);}
    catch(e){if(e.code!=='ENOENT'&&e.message!=='evidence_cache_integrity')throw e;}
  }
  const root=cacheRoot(studio);await fs.mkdir(root,{recursive:true});await directorySafe(root);
  const folder=await fs.mkdtemp(path.join(root,'cutaway-'));let published=false;
  try{
    const ratio=Math.min(1,640/Math.max(plan.width,plan.height)),width=Math.max(2,Math.floor(plan.width*ratio/2)*2),height=Math.max(2,Math.floor(plan.height*ratio/2)*2),pictures=[];
    for(const [index,frame] of frames.entries()){
      cancelled(signal);const profile=getMediaProfile(studio,frame.assetId),file=path.join(folder,`frame-${index}.jpg`);
      const filters=mediaPictureFilters(plan,frame.clip,profile)+(ratio<1?`,scale=${width}:${height}:flags=lanczos`:'');
      await inspectProcess('ffmpeg',['-v','error','-nostdin',...decoderArgs,...(profile.kind==='image'?['-loop','1','-framerate',plan.fps]:[]),'-i',studio.assetPath(frame.assetId),'-map',`0:${profile.videoStream}`,
        '-vf',filters,'-frames:v','1','-an','-c:v','mjpeg','-q:v','3','-threads','1','-filter_threads','1','-update','1',file],{signal,timeoutMs:120000,maxBytes:65536});
      const stat=await fs.stat(file);if(stat.size<1||stat.size>maxBytes)throw Error('evidence_image_size');
      const {clip,...position}=frame;
      pictures.push({...position,index,width,height,sha256:await fileDigest(file),url:`/api/media/productions/${projectId}/actions/evidence/${id}/frames/${index}`});
    }
    await verify();fresh();
    const result=studio.write('director-evidence',{schema,id,projectId,baseRevision:input.baseRevision,previewHash:input.previewHash,coverageId:input.coverageId,
      interval,fps:plan.fps,intent,...proposed.binding,frames:pictures,folder:path.basename(folder),notes:[
        'Pictures use the proposed edit’s source sampling, framing and scene clock. Source times are exact seconds; scene frames start at zero.',
        'Local source pictures only. Text overlays and sound are excluded. These are unmanaged review thumbnails, not calibrated color or generation references.',
        'Saved intent identifies its artist or director authorship. Matching time positions does not prove matching action, identity or continuity.'
      ]});
    published=true;return publicManifest(result,false);
  }finally{if(!published)await cleanPartial(root,folder);}
}
