/** Artist direction and revision-bound source proposals. No model or provider calls. */
import {fingerprint} from './store.mjs';
import {getMediaProfile,verifyMediaAsset} from './media-io.mjs';
import {memoryId,memoryText,rangeFitsTake,sameSelection,authoredEvidence} from '../public/memory-contract.mjs';
import {applyEdit,placements,clipAt,advanceSource,totalFrames,MAX_FRAMES} from '../public/music-edit.mjs';
import {searchMoments,readMoment,getTakeStack,collectTake} from './production-memory.mjs';

const directionId=(projectId,clipId)=>'direction_'+fingerprint([projectId,clipId]);
function selected(studio,projectId,clipId,baseRevision){
  studio.getProduction(memoryId(projectId));memoryId(clipId);
  const record=studio.getTimeline(projectId);
  if(record.timeline.format!=='shutter-media-edit-v1')throw Error('media_edit_required');
  if(baseRevision!==undefined&&record.revision!==baseRevision)throw Error('revision_conflict');
  const shot=placements(record.timeline).find(c=>c.id===clipId);if(!shot)throw Error('direction_shot_not_found');
  return {record,shot};
}
function currentDirection(studio,projectId,clipId){
  const id=directionId(projectId,clipId),row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);
  if(!row)return null;if(row.kind!=='shot-direction')throw Error('direction_identity_conflict');return studio.read(id,'shot-direction');
}
function normalizeBrief(brief){
  if(!brief||Object.keys(brief).some(k=>!['goal','continuity','query','coverage'].includes(k)))throw Error('direction_brief');
  if(!Array.isArray(brief.continuity)||brief.continuity.length>12)throw Error('direction_continuity');
  let coverage;
  if(brief.coverage!==undefined){
    const c=brief.coverage;
    if(!c||Object.keys(c).some(k=>!['at','end','sourceOffsetUs'].includes(k))||![c.at,c.end,c.sourceOffsetUs].every(Number.isSafeInteger)||c.at<0||c.end<=c.at||c.end>MAX_FRAMES||c.sourceOffsetUs<0||c.sourceOffsetUs>86400e6)throw Error('direction_coverage_range');
    coverage={at:c.at,end:c.end,sourceOffsetUs:c.sourceOffsetUs};
  }
  return {goal:memoryText(brief.goal,2000,true),continuity:brief.continuity.map(s=>memoryText(s,600,true)),query:memoryText(brief.query??'',240),...(coverage?{coverage}:{})};
}
function coverageInterval(studio,edit,shot,coverage){
  if(!coverage)return null;
  const {at,end}=coverage;
  if(end>totalFrames(edit)||at>=shot.end||end<=shot.at)throw Error('direction_coverage_outside_shot_or_scene');
  if((edit.coverage||[]).some(c=>c.at<end&&c.at+c.frames>at))throw Error('direction_coverage_overlap');
  const sourceAt=(c,frame)=>getMediaProfile(studio,c.assetId).kind==='image'?'0/1':advanceSource(c.sourceStart,frame-c.at,edit.fps);
  const mainViews=placements(edit).filter(c=>c.at<end&&c.end>at).map(c=>({clipId:c.id,at:Math.max(at,c.at),end:Math.min(end,c.end),assetId:c.assetId,sourceStart:sourceAt(c,Math.max(at,c.at))}));
  const next=clipAt(edit,end);
  return {at,end,frames:end-at,mainViews,returnTo:next?{clipId:next.id,frame:end,assetId:next.assetId,sourceStart:sourceAt(next,end),layer:next.layer||'main'}:null};
}
export function readShotDirection(studio,projectId,clipId){
  const {record}=selected(studio,projectId,clipId);
  const direction=currentDirection(studio,projectId,clipId);
  return {timelineRevision:record.revision,directionRevision:direction?.revision||0,direction,proposal:direction?.latestProposalId?studio.read(direction.latestProposalId,'shot-proposal'):null};
}
export function saveShotDirection(studio,projectId,clipId,{baseRevision,brief,timelineRevision,authoredBy='artist'}={}){
  if(timelineRevision!==undefined&&(!Number.isSafeInteger(timelineRevision)||timelineRevision<1))throw Error('direction_timeline_revision');
  selected(studio,projectId,clipId,timelineRevision);const normalized=normalizeBrief(brief),evidence=authoredEvidence(authoredBy);
  if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw Error('direction_revision');
  return studio.transaction(()=>{
    selected(studio,projectId,clipId,timelineRevision);
    const prior=currentDirection(studio,projectId,clipId);if((prior?.revision||0)!==baseRevision)throw Error('direction_revision_conflict');
    return studio.write('shot-direction',{id:directionId(projectId,clipId),schema:'shutter-shot-direction-v1',projectId,clipId,revision:baseRevision+1,brief:normalized,latestProposalId:prior?.latestProposalId||null,evidence,updatedAt:new Date().toISOString()});
  });
}
export function proposeShots(studio,projectId,clipId,{baseRevision,directionRevision}={}){
  if(!Number.isSafeInteger(baseRevision)||!Number.isSafeInteger(directionRevision))throw Error('direction_revision');
  const {record,shot}=selected(studio,projectId,clipId,baseRevision),direction=currentDirection(studio,projectId,clipId);
  if(!direction||direction.revision!==directionRevision)throw Error('direction_revision_conflict');
  const interval=coverageInterval(studio,record.timeline,shot,direction.brief.coverage);
  const found=searchMoments(studio,projectId,{query:direction.brief.query,limit:100}),visual=found.results.filter(m=>['video','image'].includes(m.mediaKind));
  const candidates=visual.slice(0,12).map(m=>{
    const startUs=m.startUs+(direction.brief.coverage?.sourceOffsetUs||0),sourceStart=`${startUs}/1000000`,candidate={assetId:m.assetId,sourceStart,endUs:m.endUs};let fit;
    try{fit=rangeFitsTake(candidate,interval||shot,record.timeline.fps,getMediaProfile(studio,m.assetId));}catch{fit={fits:false,reason:'source_unavailable'};}
    const command=interval?{type:'coverage-add',coverage:{id:'coverage_'+fingerprint([projectId,clipId,baseRevision,directionRevision,m.id,sourceStart,interval.at,interval.end]),assetId:m.assetId,sourceStart,at:interval.at,frames:interval.frames,fit:shot.fit}}:{type:'replace',clipId,assetId:m.assetId,sourceStart};
    return {momentId:m.id,momentRevision:m.revision,label:m.label,notes:m.notes,tags:m.tags,assetName:m.assetName,mediaKind:m.mediaKind,
      ...candidate,startUs,markedStartUs:m.startUs,sourceSha256:m.sourceSha256,...fit,current:!interval&&sameSelection(candidate,shot,record.timeline.fps),
      evidence:m.evidence||'artist-authored',continuity:'needs-review',command};
  });
  const value={schema:'shutter-shot-proposal-v1',projectId,clipId,baseRevision,directionRevision,brief:direction.brief,directionEvidence:direction.evidence||'artist-authored',
    shot:{...shot,coverage:(record.timeline.coverage||[]).filter(c=>c.at<shot.end&&c.at+c.frames>shot.at)},fps:record.timeline.fps,
    candidates,search:{query:found.query,total:found.total,shown:candidates.length,engine:'authored-words'},
    ...(interval?{interval}:{}),operation:interval?'add-camera-coverage':'replace-source-keep-timing',continuity:'artist-review-required'};
  const id='proposal_'+fingerprint(value);
  return studio.transaction(()=>{
    const existing=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);
    if(existing&&existing.kind!=='shot-proposal')throw Error('direction_identity_conflict');
    const proposal=studio.write('shot-proposal',{id,...value,createdAt:new Date().toISOString()});
    studio.write('shot-direction',{...direction,latestProposalId:id});return proposal;
  });
}
export async function acceptShotProposal(studio,projectId,clipId,{proposalId,momentId,reviewed,checkedContinuity,aligned}={}){
  const proposal=studio.read(memoryId(proposalId),'shot-proposal');
  if(proposal.projectId!==projectId||proposal.clipId!==clipId)throw Error('not_found');
  const candidate=proposal.candidates.find(c=>c.momentId===momentId);if(!candidate)throw Error('direction_candidate_not_found');
  const required=proposal.brief.continuity.length;
  if(reviewed!==true||!Array.isArray(checkedContinuity)||checkedContinuity.length!==required||new Set(checkedContinuity).size!==required||checkedContinuity.some(i=>!Number.isSafeInteger(i)||i<0||i>=required))throw Error('direction_review_required');
  const coverage=proposal.operation==='add-camera-coverage';
  if(coverage&&aligned!==true)throw Error('direction_source_alignment_required');
  const check=()=>{
    const {record,shot}=selected(studio,projectId,clipId,proposal.baseRevision);
    if(currentDirection(studio,projectId,clipId)?.revision!==proposal.directionRevision)throw Error('direction_revision_conflict');
    let moment;try{moment=readMoment(studio,projectId,momentId);}catch(e){if(e.message==='not_found')throw Error('memory_revision_conflict');throw e;}
    if(moment.revision!==candidate.momentRevision||moment.sourceSha256!==candidate.sourceSha256)throw Error('memory_revision_conflict');
    const interval=coverageInterval(studio,record.timeline,shot,proposal.brief.coverage);
    const fit=rangeFitsTake(candidate,interval||shot,record.timeline.fps,getMediaProfile(studio,candidate.assetId));if(!fit.fits)throw Error(fit.reason);
    if(!coverage&&sameSelection(candidate,shot,record.timeline.fps))throw Error('direction_already_selected');return record;
  };
  check();
  // Collection verifies both immutable files and preserves the original selection.
  // A rejected later edit may leave an unaccepted take, never a partial picture edit.
  if(coverage){const asset=await verifyMediaAsset(studio,candidate.assetId);if(asset.sha256!==candidate.sourceSha256)throw Error('asset_integrity');}
  else await collectTake(studio,projectId,clipId,{baseRevision:proposal.baseRevision,stackRevision:getTakeStack(studio,projectId,clipId).revision,momentId,momentRevision:candidate.momentRevision});
  const record=check(); // Recheck direction, note and cut after asynchronous file verification.
  const ids=new Set([...record.timeline.clips,...record.timeline.coverage||[],candidate].map(c=>c.assetId));
  const profiles=new Map([...ids].map(id=>[id,getMediaProfile(studio,id)]));
  return studio.saveTimeline(projectId,proposal.baseRevision,applyEdit(record.timeline,candidate.command,profiles));
}
