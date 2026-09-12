export const INSERT_SCHEMA='shutter-generative-insert-v1';
export const INSERT_KINDS=Object.freeze(['alternate','continue','new-angle','bridge','arrive']);
export const INSERT_RESOLUTIONS=Object.freeze(['480P','768P','1080P']);
export const INSERT_QUALITY=Object.freeze(['balanced','quality']);
export const INSERT_LIMITS=Object.freeze({promptCharacters:8000,requestKeyCharacters:100,maxUsd:100,durationMin:5,durationMax:15});
export const INSERT_RESOLUTION_TIERS=Object.freeze({draft:'480P',review:'768P',finish:'1080P'});
export const GENERATED_AUDIO_POLICY='isolated-never-auto-mix';
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const rejectUnknown=(value,allowed,code)=>{if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error(code);};
const text=(value,max,code)=>{
  if(typeof value!=='string'||!value.trim()||[...value].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value))throw Error(code);
  return value.trim();
};
export function normalizeInsertRequest(value){
  rejectUnknown(value,['schema','requestKey','baseRevision','clipId','kind','prompt','duration','resolution','quality','maxUsd','acknowledgeUnmanagedColor'],'insert_request_invalid');
  if(value.schema!==undefined&&value.schema!==INSERT_SCHEMA)throw Error('insert_schema');
  if(!safeId(value.requestKey)||[...value.requestKey].length>INSERT_LIMITS.requestKeyCharacters)throw Error('insert_request_key');
  if(!Number.isSafeInteger(value.baseRevision)||value.baseRevision<1)throw Error('insert_timeline_revision');
  if(!safeId(value.clipId))throw Error('insert_clip_id');
  if(!INSERT_KINDS.includes(value.kind))throw Error('insert_kind');
  if(!Number.isSafeInteger(value.duration)||value.duration<INSERT_LIMITS.durationMin||value.duration>INSERT_LIMITS.durationMax)throw Error('insert_duration');
  if(!INSERT_RESOLUTIONS.includes(value.resolution))throw Error('insert_resolution');
  const quality=value.quality??'balanced';if(!INSERT_QUALITY.includes(quality))throw Error('insert_quality');
  if(typeof value.maxUsd!=='number'||!Number.isFinite(value.maxUsd)||value.maxUsd<=0||value.maxUsd>INSERT_LIMITS.maxUsd)throw Error('insert_spend_limit');
  if(value.acknowledgeUnmanagedColor!==true)throw Error('reference_color_review_required');
  return {schema:INSERT_SCHEMA,requestKey:value.requestKey,baseRevision:value.baseRevision,clipId:value.clipId,kind:value.kind,prompt:text(value.prompt,INSERT_LIMITS.promptCharacters,'insert_prompt'),duration:value.duration,resolution:value.resolution,quality,maxUsd:Math.round(value.maxUsd*1e6)/1e6,acknowledgeUnmanagedColor:true};
}
export function resolutionTier(resolution){
  if(!INSERT_RESOLUTIONS.includes(resolution))throw Error('insert_resolution');
  return resolution==='480P'?'draft':resolution==='768P'?'review':'finish';
}
export function insertIntent(kind){
  if(!INSERT_KINDS.includes(kind))throw Error('insert_kind');
  return {kind,providerMode:kind==='new-angle'?'reference-to-video':'image-to-video',audioPolicy:GENERATED_AUDIO_POLICY,creativeTransition:kind==='bridge',referenceAuthority:kind==='new-angle'?[{kind:'image',authority:'appearance-state',role:'accepted ending appearance/current visible state'},{kind:'video',authority:'motion-time',role:'prior shot tail for motion language and temporal scene continuity'}]:[]};
}
export function intentPrompt(kind,prompt){
  const p=text(prompt,INSERT_LIMITS.promptCharacters,'insert_prompt');
  const policy={alternate:'Create an alternate take of this shot while respecting the supplied opening and ending composition boundaries.',continue:'Continue naturally from the supplied ending frame in one continuous shot. Preserve visible subject, object and environment state.','new-angle':'Create ONE NEW adjacent shot from a distinct camera position. Begin immediately from that new angle. One continuous shot only; no internal cuts. Appearance/current state follows the still reference; motion and temporal continuity follow the prior video reference.',bridge:'Create a deliberate cinematic bridge between the supplied boundary frames. A motivated transition or occlusion is allowed when the two worlds differ; do not claim literal continuous physics when a transformation is needed.',arrive:'Create the preceding action that resolves naturally into the supplied ending frame. The supplied frame is the destination, not an opening image.'}[kind];
  if(!policy)throw Error('insert_kind');
  return `${policy}\n${p}\nAudio: diegetic scene sound only. No non-diegetic music, score, captions or text.`;
}
export function insertEdges(edit,clipId,kind){
  if(!edit||edit.format!=='shutter-media-edit-v1'||!Array.isArray(edit.clips)||!safeId(clipId)||!INSERT_KINDS.includes(kind))throw Error('insert_target_invalid');
  const index=edit.clips.findIndex(c=>c.id===clipId);if(index<0)throw Error('insert_target_missing');
  const current=edit.clips[index],next=edit.clips[index+1]||null;
  if(kind==='bridge'&&!next)throw Error('insert_bridge_needs_next_shot');
  if(kind==='alternate')return [{clipId:current.id,edge:'start',role:'opening-frame',authority:'boundary'},{clipId:current.id,edge:'end',role:'ending-frame',authority:'boundary'}];
  if(kind==='bridge')return [{clipId:current.id,edge:'end',role:'opening-frame',authority:'boundary'},{clipId:next.id,edge:'start',role:'ending-frame',authority:'boundary'}];
  if(kind==='arrive')return [{clipId:current.id,edge:'start',role:'ending-frame',authority:'destination'}];
  if(kind==='new-angle')return [{clipId:current.id,edge:'end',role:'appearance-state',authority:'appearance-state'}];
  return [{clipId:current.id,edge:'end',role:'opening-frame',authority:'boundary'}];
}
export function insertLanding(edit,clipId,kind){
  const index=edit.clips.findIndex(c=>c.id===clipId);if(index<0)throw Error('insert_target_missing');
  if(kind==='alternate')return {kind:'take-stack',clipId};
  if(kind==='continue'||kind==='new-angle')return {kind:'insert-after',leftClipId:clipId,rightClipId:edit.clips[index+1]?.id??null};
  if(kind==='bridge')return {kind:'insert-between',leftClipId:clipId,rightClipId:edit.clips[index+1]?.id??null};
  if(kind==='arrive')return {kind:'insert-before',leftClipId:edit.clips[index-1]?.id??null,rightClipId:clipId};
  throw Error('insert_kind');
}
export function insertTargetSnapshot(edit,clipId,kind){
  const edges=insertEdges(edit,clipId,kind),wanted=new Set(edges.map(e=>e.clipId));
  return {fps:edit.fps,width:edit.width,height:edit.height,kind,clipId,clips:edit.clips.filter(c=>wanted.has(c.id)).map(c=>({id:c.id,assetId:c.assetId,sourceStart:c.sourceStart,frames:c.frames,fit:c.fit,sampling:c.sampling??null}))};
}
export function insertDisclosure(references){
  const refs=Number.isSafeInteger(references)?Array.from({length:references},()=>({kind:'image'})):references;
  if(!Array.isArray(refs)||refs.length<1||refs.length>12||refs.some(r=>!['image','video','audio'].includes(r?.kind)))throw Error('insert_reference_count');
  const counts=Object.fromEntries(['image','video','audio'].map(k=>[k,refs.filter(r=>r.kind===k).length])),descriptions=[];
  if(counts.image)descriptions.push(`${counts.image} derived PNG reference image${counts.image===1?'':'s'}`);
  if(counts.video)descriptions.push(`${counts.video} derived motion reference video${counts.video===1?'':'s'}`);
  if(counts.audio)descriptions.push(`${counts.audio} derived audio reference${counts.audio===1?'':'s'}`);
  return {leavesDeviceOnSubmission:['prompt',...descriptions],staysLocal:['camera originals','master soundtrack','sound lanes','finishing text','unselected library media'],providerContacted:false,submissionState:'not-submitted',generatedAudioPolicy:GENERATED_AUDIO_POLICY};
}
export function adapterReadiness(request){
  const normalized=normalizeInsertRequest(request),intent=insertIntent(normalized.kind);
  if(intent.providerMode==='reference-to-video'&&normalized.resolution==='1080P')return {workflow:'minimax/h3-max/reference-to-video',provider:'fal',model:'H3 Max',adapterReady:false,qualification:'live billing/provider lifecycle validated 2026-09-12; 1080P reference-token pricing remains deliberately unqualified',reason:'h3_reference_1080_unqualified',liveValidationDate:'2026-09-12',visualQualification:'artist-review-required'};
  return {workflow:'minimax/h3-max/'+intent.providerMode,provider:'fal',model:'H3 Max',adapterReady:true,qualification:'live provider submission, receipt reconciliation and billing validated 2026-09-12; returned visual continuity still requires artist review',reason:null,liveValidationDate:'2026-09-12',visualQualification:'artist-review-required',recommendedExpansion:'balanced',audioPolicy:GENERATED_AUDIO_POLICY};
}
