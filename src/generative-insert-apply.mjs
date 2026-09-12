/** Explicitly place an already-reconciled generated insert into picture. Never called automatically. */
import {readGenerativeInsert} from './generative-inserts.mjs';
import {verifyMediaAsset,ensureMediaProfile} from './media-io.mjs';
function rateValue(fps){const m=String(fps).match(/^(\d{1,9})(?:\/(\d{1,9}))?$/);if(!m)throw Error('insert_timeline_rate');const n=Number(m[1]),d=Number(m[2]||1),v=n/d;if(!Number.isFinite(v)||n<=0||d<=0)throw Error('insert_timeline_rate');return v;}
export async function applyGeneratedInsert(studio,projectId,id,input={}){
 let record=readGenerativeInsert(studio,projectId,id);if(!Number.isSafeInteger(input.baseRevision)||record.revision!==input.baseRevision)throw Error('revision_conflict');
 if(record.landing.kind==='take-stack')throw Error('insert_take_uses_take_stack');if(!['ready-insert','applied-insert'].includes(record.state)||!record.outputAssetId)throw Error('insert_not_ready_to_apply');
 let current=studio.getTimeline(projectId);if(!Number.isSafeInteger(input.timelineRevision)||current.revision!==input.timelineRevision)throw Error('revision_conflict');
 const generatedId='gen_'+record.id.slice(-48),existing=current.timeline.clips.find(c=>c.id===generatedId);
 if(existing){if(existing.assetId!==record.outputAssetId)throw Error('insert_generated_clip_conflict');if(record.state==='applied-insert')return {insert:record,timeline:current};const applied=studio.write('generative-insert',{...stripComputed(record),state:'applied-insert',revision:record.revision+1,applied:{clipId:generatedId,timelineRevision:current.revision,frames:existing.frames,recovered:true},appliedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});return {insert:readGenerativeInsert(studio,projectId,applied.id),timeline:current};}
 if(record.state!=='ready-insert'||!record.current)throw Error('insert_target_stale');
 const asset=await verifyMediaAsset(studio,record.outputAssetId),profile=await ensureMediaProfile(studio,record.outputAssetId);if(profile.kind!=='video'||!Number.isFinite(profile.duration)||profile.duration<=0)throw Error('generated_video_required');
 record=readGenerativeInsert(studio,projectId,id);current=studio.getTimeline(projectId);if(record.revision!==input.baseRevision||!record.current||current.revision!==input.timelineRevision)throw Error('revision_conflict');
 const rate=rateValue(current.timeline.fps),frames=Math.max(1,Math.round(profile.duration*rate));if(frames/rate>profile.duration+1/rate+1e-6)throw Error('generated_duration_contract');
 const next=structuredClone(current.timeline);let insertionIndex,fit;
 if(record.landing.kind==='insert-before'){
   const rightIndex=next.clips.findIndex(c=>c.id===record.landing.rightClipId);if(rightIndex<0)throw Error('insert_target_missing');
   if(record.landing.leftClipId!==null&&next.clips[rightIndex-1]?.id!==record.landing.leftClipId)throw Error('insert_target_stale');
   insertionIndex=rightIndex;fit=next.clips[rightIndex].fit;
 }else{
   const leftIndex=next.clips.findIndex(c=>c.id===record.landing.leftClipId);if(leftIndex<0)throw Error('insert_target_missing');
   if(record.landing.rightClipId!==null&&next.clips[leftIndex+1]?.id!==record.landing.rightClipId)throw Error('insert_target_stale');
   insertionIndex=leftIndex+1;fit=next.clips[leftIndex].fit;
 }
 next.clips.splice(insertionIndex,0,{id:generatedId,assetId:asset.id,sourceStart:'0/1',frames,fit});
 const saved=studio.saveTimeline(projectId,current.revision,next);
 const stored=studio.write('generative-insert',{...stripComputed(record),state:'applied-insert',revision:record.revision+1,applied:{clipId:generatedId,timelineRevision:saved.revision,frames,assetId:asset.id,placement:record.landing,audioPolicy:record.audioHandling?.policy||'isolated-never-auto-mix'},appliedAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 return {insert:readGenerativeInsert(studio,projectId,stored.id),timeline:saved};
}
function stripComputed(record){return Object.fromEntries(Object.entries(record).filter(([k])=>!['currentTimelineRevision','revisionCurrent','targetCurrent','targetStatus','current'].includes(k)));}
