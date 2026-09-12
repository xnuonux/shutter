export const INSERT_SCHEMA='shutter-generative-insert-v1';
export const INSERT_KINDS=Object.freeze(['alternate','continue','bridge']);
export const INSERT_RESOLUTIONS=Object.freeze(['480P','768P','1080P']);
export const INSERT_QUALITY=Object.freeze(['balanced','quality']);
export const INSERT_LIMITS=Object.freeze({promptCharacters:8000,requestKeyCharacters:100,maxUsd:100,durationMin:5,durationMax:15});
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
export function insertEdges(edit,clipId,kind){
  if(!edit||edit.format!=='shutter-media-edit-v1'||!Array.isArray(edit.clips)||!safeId(clipId)||!INSERT_KINDS.includes(kind))throw Error('insert_target_invalid');
  const index=edit.clips.findIndex(c=>c.id===clipId);if(index<0)throw Error('insert_target_missing');
  const current=edit.clips[index],next=edit.clips[index+1]||null;
  if(kind==='bridge'&&!next)throw Error('insert_bridge_needs_next_shot');
  if(kind==='alternate')return [{clipId:current.id,edge:'start',role:'opening-frame'},{clipId:current.id,edge:'end',role:'ending-frame'}];
  if(kind==='bridge')return [{clipId:current.id,edge:'end',role:'opening-frame'},{clipId:next.id,edge:'start',role:'ending-frame'}];
  return [{clipId:current.id,edge:'end',role:'opening-frame'}];
}
export function insertLanding(edit,clipId,kind){
  const index=edit.clips.findIndex(c=>c.id===clipId);if(index<0)throw Error('insert_target_missing');
  if(kind==='alternate')return {kind:'take-stack',clipId};
  if(kind==='continue')return {kind:'insert-after',leftClipId:clipId,rightClipId:edit.clips[index+1]?.id??null};
  if(kind==='bridge')return {kind:'insert-between',leftClipId:clipId,rightClipId:edit.clips[index+1]?.id??null};
  throw Error('insert_kind');
}
export function insertTargetSnapshot(edit,clipId,kind){
  const edges=insertEdges(edit,clipId,kind),wanted=new Set(edges.map(e=>e.clipId));
  return {fps:edit.fps,width:edit.width,height:edit.height,kind,clipId,clips:edit.clips.filter(c=>wanted.has(c.id)).map(c=>({id:c.id,assetId:c.assetId,sourceStart:c.sourceStart,frames:c.frames,fit:c.fit,sampling:c.sampling??null}))};
}
export function insertDisclosure(referenceCount){
  if(!Number.isSafeInteger(referenceCount)||referenceCount<1||referenceCount>2)throw Error('insert_reference_count');
  return {leavesDeviceOnSubmission:['prompt',`${referenceCount} derived PNG reference image${referenceCount===1?'':'s'}`],staysLocal:['camera originals','master soundtrack','sound lanes','finishing text','unselected library media'],providerContacted:false,submissionState:'not-submitted'};
}
export function adapterReadiness(request){
  normalizeInsertRequest(request);
  return {workflow:'minimax/h3-max/image-to-video',provider:'fal',model:'H3 Max',adapterReady:true,qualification:'implemented from current provider contract; no paid live render was executed by this change',reason:null};
}
