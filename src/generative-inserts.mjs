/** Governed Generative Insert lifecycle. Planning is local-only; provider contact happens only during explicit quote/submission/reconcile steps. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fingerprint} from './store.mjs';
import {getMediaProfile,verifyMediaAsset,importMediaFile,ensureMediaProfile,decoderArgs} from './media-io.mjs';
import {inspectProcess} from './media-inspect.mjs';
import {mediaPictureFilters,MEDIA_EDIT_FORMAT} from './media-edit.mjs';
import {normalizeInsertRequest,insertEdges,insertLanding,insertTargetSnapshot,insertDisclosure,adapterReadiness} from '../public/insert-contract.mjs';
import {MEMORY_LIMITS,sourceSelection,sameSelection} from '../public/memory-contract.mjs';
import {getTakeStack} from './production-memory.mjs';
import {h3Snapshot} from './h3-spec.mjs';
import {FalRenderer} from './fal-renderer.mjs';

const kind='generative-insert';
const providers=new WeakMap();
const providerFor=studio=>{let provider=providers.get(studio);if(!provider){provider=new FalRenderer(studio);providers.set(studio,provider);}return provider;};
const safeId=value=>typeof value==='string'&&/^insert_[a-f0-9]{64}$/.test(value);
const insertId=(projectId,requestKey)=>'insert_'+fingerprint(['generative-insert-v1',projectId,requestKey]);
function rowKind(studio,id){return studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id)?.kind||null;}
function optional(studio,id){const k=rowKind(studio,id);if(!k)return null;if(k!==kind)throw Error('insert_identity_conflict');return studio.read(id,kind);}
function requireProject(studio,projectId){if(typeof projectId!=='string'||!/^prod_[A-Za-z0-9-]+$/.test(projectId))throw Error('insert_project');studio.getProduction(projectId);}
function timeline(studio,projectId){const record=studio.getTimeline(projectId);if(record.timeline?.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');return record;}
function targetHash(edit,clipId,insertKind){return fingerprint(insertTargetSnapshot(edit,clipId,insertKind));}
function publicRecord(studio,record){
  const current=timeline(studio,record.projectId);let sameTarget=false,targetStatus=null;
  try{sameTarget=targetHash(current.timeline,record.request.clipId,record.request.kind)===record.targetFingerprint;}catch(e){targetStatus=e.message;}
  return {...record,currentTimelineRevision:current.revision,revisionCurrent:current.revision===record.timelineRevision,targetCurrent:sameTarget,targetStatus,current:current.revision===record.timelineRevision&&sameTarget};
}
export function readGenerativeInsert(studio,projectId,id){
  requireProject(studio,projectId);if(!safeId(id))throw Error('not_found');const value=studio.read(id,kind);if(value.projectId!==projectId)throw Error('not_found');return publicRecord(studio,value);
}
export function listGenerativeInserts(studio,projectId,{clipId=null,limit=50}={}){
  requireProject(studio,projectId);if(clipId!==null&&(typeof clipId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(clipId)))throw Error('insert_clip_id');if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('insert_list_limit');
  return studio.list(kind).filter(x=>x.projectId===projectId&&(!clipId||x.request.clipId===clipId)).slice(-limit).reverse().map(x=>publicRecord(studio,x));
}
function planClip(record,clipId){const clip=record.plan.clips.find(c=>c.id===clipId);if(!clip)throw Error('insert_target_missing');return clip;}
async function renderEdge(studio,record,edge,folder,index,{signal}={}){
  const clip=planClip(record,edge.clipId),profile=getMediaProfile(studio,clip.assetId),source=await verifyMediaAsset(studio,clip.assetId);
  if(!['video','image'].includes(profile.kind))throw Error('visual_media_required');
  const offset=edge.edge==='start'?0:clip.frames-1;if(offset<0)throw Error('insert_empty_target');
  const sampling=clip.sampling||{origin:clip.sourceStart??'0/1',offsetFrames:0};
  const one={...clip,frames:1,sampling:{origin:sampling.origin,offsetFrames:sampling.offsetFrames+offset}};
  const output=path.join(folder,`reference-${index+1}.png`),filters=mediaPictureFilters(record.plan,one,profile)+',format=rgb24';
  await inspectProcess('ffmpeg',['-v','error','-nostdin',...decoderArgs,...(profile.kind==='image'?['-loop','1','-framerate',record.plan.fps]:[]),'-i',studio.assetPath(clip.assetId),'-map',`0:${profile.videoStream}`,'-vf',filters,'-frames:v','1','-fps_mode','vfr','-an','-sn','-dn','-c:v','png','-threads','1','-filter_threads','1','-map_metadata','-1',output],{timeoutMs:600000,maxBytes:1024*1024,signal});
  const stat=await fs.lstat(output);if(!stat.isFile()||stat.size<32)throw Error('insert_reference_render_failed');
  const after=await verifyMediaAsset(studio,clip.assetId);if(after.sha256!==source.sha256)throw Error('asset_integrity');
  return {output,role:edge.role,edge:edge.edge,sourceClipId:clip.id,sourceAssetId:clip.assetId,sourceSha256:source.sha256,outputFrame:clip.at+offset,colorPolicy:'composition-unmanaged-sdr-reference',fit:clip.fit};
}
export async function planGenerativeInsert(studio,projectId,input,{signal}={}){
  requireProject(studio,projectId);const request=normalizeInsertRequest(input),record=timeline(studio,projectId);
  if(request.baseRevision!==record.revision)throw Error('revision_conflict');
  const edges=insertEdges(record.timeline,request.clipId,request.kind),targetFingerprint=targetHash(record.timeline,request.clipId,request.kind),landing=insertLanding(record.timeline,request.clipId,request.kind);
  const id=insertId(projectId,request.requestKey),specHash=fingerprint({projectId,timelineRevision:record.revision,request,targetFingerprint,landing});
  const prior=optional(studio,id);if(prior){if(prior.specHash!==specHash)throw Error('insert_request_conflict');return publicRecord(studio,prior);}
  const root=path.join(studio.root,'media-tmp');await fs.mkdir(root,{recursive:true});const folder=await fs.mkdtemp(path.join(root,'insert-plan-'));
  try {
    const rendered=[];for(let i=0;i<edges.length;i++){if(signal?.aborted)throw Error('insert_plan_cancelled');rendered.push(await renderEdge(studio,record,edges[i],folder,i,{signal}));}
    if(signal?.aborted)throw Error('insert_plan_cancelled');
    // A plan cannot be relabeled onto a newer saved cut after asynchronous decoding.
    const fresh=timeline(studio,projectId);if(fresh.revision!==record.revision||targetHash(fresh.timeline,request.clipId,request.kind)!==targetFingerprint)throw Error('revision_conflict');
    const references=[];
    for(const item of rendered){
      const imported=await importMediaFile(studio,item.output,{name:`${studio.getProduction(projectId).title} · ${request.kind} · ${item.role}.png`,origin:`Shutter Generative Insert local reference; ${item.sourceClipId} ${item.edge}; no provider contacted`});
      const derivationId='derivation_'+crypto.randomUUID();
      studio.write('media-derivation',{id:derivationId,outputAssetId:imported.id,recipe:{operation:'generative-insert-reference',projectId,timelineRevision:record.revision,targetClipId:request.clipId,kind:request.kind,role:item.role,edge:item.edge,sourceClipId:item.sourceClipId,sourceAssetId:item.sourceAssetId,sourceSha256:item.sourceSha256,outputFrame:item.outputFrame,fit:item.fit,colorPolicy:item.colorPolicy},createdAt:new Date().toISOString()});
      references.push({...item,output:undefined,assetId:imported.id,sha256:imported.sha256,derivationId});
    }
    const readiness=adapterReadiness(request),opening=references.find(r=>r.role==='opening-frame'),ending=references.find(r=>r.role==='ending-frame');
    const packet={workflow:readiness.workflow,mode:'image-to-video',prompt:request.prompt,duration:request.duration,resolution:request.resolution,promptExpansionMode:request.quality,imageAssetId:opening.assetId,...(ending?{endImageAssetId:ending.assetId}:{})};
    // Final synchronous revision check before committing the governed intent record.
    const finalRecord=timeline(studio,projectId);if(finalRecord.revision!==record.revision||targetHash(finalRecord.timeline,request.clipId,request.kind)!==targetFingerprint)throw Error('revision_conflict');
    const value={id,schema:'shutter-generative-insert-plan-v1',projectId,revision:1,state:'planned',requestKey:request.requestKey,specHash,timelineRevision:record.revision,planHash:record.plan.hash,targetFingerprint,
      request,landing,references:references.map(({output,...r})=>r),providerIntent:{...readiness,packet},disclosure:insertDisclosure(references.length),spending:{hardLimitUsd:request.maxUsd,quote:null,authorized:false,spentUsd:0},
      createdAt:new Date().toISOString(),limitations:['Local plan only: no provider was contacted and no generation was submitted.','Reference PNGs are clean composition frames without finishing text or audio, but the production color pipeline remains unmanaged SDR.','A first/end frame conditions generation; it does not guarantee motion, identity, continuity or a seamless transition.','The H3 image-to-video adapter now carries 1080P and quality-mode parameters, but this change does not itself execute a paid live render.']};
    const collision=rowKind(studio,id);if(collision&&collision!==kind)throw Error('insert_identity_conflict');if(collision){const existing=studio.read(id,kind);if(existing.specHash!==specHash)throw Error('insert_request_conflict');return publicRecord(studio,existing);}
    studio.write(kind,value);return publicRecord(studio,value);
  } finally {await fs.rm(folder,{recursive:true,force:true});}
}
export function discardGenerativeInsert(studio,projectId,id,{baseRevision}={}){
  requireProject(studio,projectId);const current=readGenerativeInsert(studio,projectId,id);if(!Number.isSafeInteger(baseRevision)||current.revision!==baseRevision)throw Error('revision_conflict');
  if(!['planned','quote-error','quoted','quoted-over-limit'].includes(current.state))throw Error('insert_discard_state');
  if(current.jobId){const job=studio.getJob(current.jobId);if(job.state==='prepared')studio.updateJob(job.id,{state:'cancelled',error:'insert_discarded_before_submission'});else if(!['cancelled','failed'].includes(job.state))throw Error('insert_discard_state');}
  const saved=studio.write(kind,{...Object.fromEntries(Object.entries(current).filter(([k])=>!['currentTimelineRevision','revisionCurrent','targetCurrent','targetStatus','current'].includes(k))),state:'discarded',revision:current.revision+1,discardedAt:new Date().toISOString()});return publicRecord(studio,saved);
}

function stripComputed(record){return Object.fromEntries(Object.entries(record).filter(([k])=>!['currentTimelineRevision','revisionCurrent','targetCurrent','targetStatus','current'].includes(k)));}
function providerShot(studio,record){
 const opening=record.references.find(r=>r.role==='opening-frame'),ending=record.references.find(r=>r.role==='ending-frame');
 if(!opening)throw Error('insert_opening_reference');
 const project=studio.getProduction(record.projectId),shot={id:record.request.clipId,title:`${project.title} · ${record.request.kind}`,frames:record.request.duration*24,fps:24,width:record.request.resolution==='480P'?854:record.request.resolution==='768P'?1366:1920,height:Number(record.request.resolution.slice(0,-1)),
  action:record.request.prompt,camera:'',sound:'',cast:[],characterStates:[],extraReferences:[],reference:opening.assetId,...(ending?{endReference:ending.assetId}:{}),
  generation:{model:'h3-max',mode:'image-to-video',duration:record.request.duration,resolution:record.request.resolution,promptExpansionMode:record.request.quality,aspectRatio:'adaptive'}};
 const h3=h3Snapshot(studio,project,shot);
 return {project,shot,h3};
}
function writeLifecycle(studio,record,patch){return publicRecord(studio,studio.write(kind,{...stripComputed(record),...patch,revision:record.revision+1,updatedAt:new Date().toISOString()}));}
export async function quoteGenerativeInsert(studio,projectId,id,{baseRevision}={}, {fal=providerFor(studio)}={}){
 let record=readGenerativeInsert(studio,projectId,id);if(!Number.isSafeInteger(baseRevision)||record.revision!==baseRevision)throw Error('revision_conflict');
 if(!['planned','quote-error','quoted','quoted-over-limit'].includes(record.state))throw Error('insert_quote_state');
 if(!record.current)throw Error('insert_target_stale');if(!record.providerIntent.adapterReady)throw Error('insert_adapter_not_qualified');
 let job=record.jobId?studio.getJob(record.jobId):null;
 if(!job){
  const {project,shot,h3}=providerShot(studio,record),snapshot={projectId,projectRevision:project.revision,timelineRevision:record.timelineRevision,insertId:record.id,targetFingerprint:record.targetFingerprint,spendLimitUsd:record.spending.hardLimitUsd,
   title:project.title,style:'Preserve the supplied composition and visual continuity. The reference frames are authoritative boundaries; do not add captions or music.',cast:[],place:h3.place||{},shot,references:h3.references,bindings:h3.bindings,workflow:h3.workflow};
  job=studio.write('job',{id:'job_'+crypto.randomUUID(),projectId,shotId:record.request.clipId,requestKey:'insert:'+record.requestKey,specHash:fingerprint(snapshot),snapshot,state:'prepared',providerId:null,output:null,review:null,createdAt:new Date().toISOString()});
  record=writeLifecycle(studio,record,{jobId:job.id,state:'quote-pending',quote:null,error:null});
 }
 try{
  job=await fal.prepare(job.id);const over=job.quote.reservedUsd>record.spending.hardLimitUsd+1e-9;
  return writeLifecycle(studio,record,{state:over?'quoted-over-limit':'quoted',quote:job.quote,error:over?'quote_exceeds_insert_spend_limit':null,disclosure:{...record.disclosure,providerContacted:true},spending:{...record.spending,quote:job.quote,authorized:false}});
 }catch(e){return writeLifecycle(studio,record,{state:'quote-error',error:e.message,disclosure:{...record.disclosure,providerContacted:e.message==='fal_key_missing'?record.disclosure.providerContacted:true}});}
}
export async function submitGenerativeInsert(studio,projectId,id,input={}, {fal=providerFor(studio)}={}){
 let record=readGenerativeInsert(studio,projectId,id);if(!Number.isSafeInteger(input.baseRevision)||record.revision!==input.baseRevision)throw Error('revision_conflict');
 if(record.state!=='quoted'||!record.quote||!record.current)throw Error('insert_not_ready_to_submit');
 if(input.authorize!==true||input.acceptDisclosure!==true||typeof input.acceptedReservedUsd!=='number'||Math.abs(input.acceptedReservedUsd-record.quote.reservedUsd)>1e-9)throw Error('insert_authorization_required');
 if(Date.now()>Date.parse(record.quote.expiresAt))throw Error('quote_expired_prepare_again');if(record.quote.reservedUsd>record.spending.hardLimitUsd+1e-9)throw Error('insert_spend_limit_exceeded');
 // Claim the artist authorization before any provider request. A duplicate old revision cannot submit twice.
 record=writeLifecycle(studio,record,{state:'submitting',authorizedAt:new Date().toISOString(),error:null,spending:{...record.spending,authorized:true},disclosure:{...record.disclosure,submissionState:'attempting'}});
 try{
  const job=await fal.submit(record.jobId),state=job.state==='rendering'?'rendering':job.state;
  return writeLifecycle(studio,record,{state,error:job.error||null,providerId:job.providerId||null,disclosure:{...record.disclosure,submissionState:job.providerId?'submitted':'attempting'}});
 }catch(e){
  const job=studio.getJob(record.jobId);if(job.state==='unknown')return writeLifecycle(studio,record,{state:'unknown',error:job.error||e.message,providerId:job.providerId||null,disclosure:{...record.disclosure,submissionState:'uncertain'}});
  // Pricing/revision/budget preflight failures mean there is no provider receipt and no implicit retry.
  writeLifecycle(studio,record,{state:'quoted',error:e.message,spending:{...record.spending,authorized:false},disclosure:{...record.disclosure,submissionState:'not-submitted'}});throw e;
 }
}
function cleanStack(stack){const {timelineRevision,shotFrames,fps,...base}=stack;return {...base,candidates:base.candidates.map(({fits,reason,current,...c})=>c)};}
async function attachAlternateCandidate(studio,record,job){
 const current=timeline(studio,record.projectId);if(current.revision!==record.timelineRevision||targetHash(current.timeline,record.request.clipId,record.request.kind)!==record.targetFingerprint)return {attached:false,reason:'target_stale'};
 const clip=current.timeline.clips.find(c=>c.id===record.request.clipId);if(!clip)return {attached:false,reason:'target_missing'};
 const output=await verifyMediaAsset(studio,job.output),profile=await ensureMediaProfile(studio,job.output);if(profile.kind!=='video')throw Error('generated_video_required');
 return studio.transaction(()=>{
  const now=timeline(studio,record.projectId);if(now.revision!==record.timelineRevision||targetHash(now.timeline,record.request.clipId,record.request.kind)!==record.targetFingerprint)return {attached:false,reason:'target_stale'};
  const currentClip=now.timeline.clips.find(c=>c.id===record.request.clipId),view=getTakeStack(studio,record.projectId,record.request.clipId),stack=cleanStack(view);
  if(stack.candidates.some(c=>c.insertId===record.id))return {attached:true,stackRevision:stack.revision,duplicate:true};
  if(!stack.candidates.some(c=>sameSelection(c,currentClip,now.timeline.fps))){const a=studio.read(currentClip.assetId,'asset'),p=getMediaProfile(studio,currentClip.assetId);stack.candidates.push({id:'take_'+crypto.randomUUID(),label:stack.candidates.length?'Prior selection':'Original selection',...sourceSelection(currentClip,now.timeline.fps),endUs:p.kind==='image'?MEMORY_LIMITS.rangeUs:Math.floor(p.duration*1e6),sourceSha256:a.sha256,evidence:'saved-shot',capturedRevision:now.revision});}
  stack.candidates.push({id:'take_'+crypto.randomUUID(),label:`Generated ${record.request.kind} · ${record.request.prompt.slice(0,80)}`,assetId:job.output,sourceStart:'0/1',endUs:Math.floor(profile.duration*1e6),sourceSha256:output.sha256,evidence:'generated-candidate',insertId:record.id,jobId:job.id,provider:'fal',workflow:job.snapshot.workflow,quote:record.quote,createdAt:new Date().toISOString()});
  if(stack.candidates.length>MEMORY_LIMITS.takes)throw Error('take_stack_limit');studio.write('take-stack',{...stack,revision:stack.revision+1,updatedAt:new Date().toISOString()});return {attached:true,stackRevision:stack.revision+1};
 });
}
export async function reconcileGenerativeInsert(studio,projectId,id,{baseRevision}={}, {fal=providerFor(studio)}={}){
 let record=readGenerativeInsert(studio,projectId,id);if(!Number.isSafeInteger(baseRevision)||record.revision!==baseRevision)throw Error('revision_conflict');if(!record.jobId)throw Error('insert_job_missing');
 let job=studio.getJob(record.jobId);
 if(['rendering','verifying','unknown'].includes(job.state)&&job.providerId)job=await fal.reconcile(job.id);
 if(job.state==='unknown'&&!job.providerId)return writeLifecycle(studio,record,{state:'unknown',error:job.error||'submission_unknown',disclosure:{...record.disclosure,submissionState:'uncertain'}});
 if(job.state==='failed')return writeLifecycle(studio,record,{state:'failed',error:job.error||'provider_failed',providerStatus:job.providerStatus||null,spending:{...record.spending,spentUsd:job.charge?.actualUsd??null}});
 if(job.state!=='ready')return writeLifecycle(studio,record,{state:job.state,error:job.error||null,providerStatus:job.providerStatus||null});
 await ensureMediaProfile(studio,job.output);const freshStatus=readGenerativeInsert(studio,projectId,id);let landing={attached:false,reason:'insert-slot-awaits-artist',targetCurrent:freshStatus.current};
 if(record.landing.kind==='take-stack'){try{landing=await attachAlternateCandidate(studio,record,job);}catch(e){landing={attached:false,reason:e.message};}}
 const readyState=landing.attached?'ready-candidate':record.landing.kind!=='take-stack'&&freshStatus.current?'ready-insert':'ready-historical';
 return writeLifecycle(studio,record,{state:readyState,error:job.error||null,outputAssetId:job.output,media:job.media,landingResult:landing,spending:{...record.spending,spentUsd:job.charge?.actualUsd??null},disclosure:{...record.disclosure,submissionState:'completed'}});
}
