/** Artist direction and revision-bound source proposals. No model or provider calls. */
import {fingerprint} from './store.mjs';
import {getMediaProfile} from './media-io.mjs';
import {memoryId,memoryText,rangeFitsTake,sameSelection} from '../public/memory-contract.mjs';
import {applyEdit,placements} from '../public/music-edit.mjs';
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
  if(!brief||Object.keys(brief).some(k=>!['goal','continuity','query'].includes(k)))throw Error('direction_brief');
  if(!Array.isArray(brief.continuity)||brief.continuity.length>12)throw Error('direction_continuity');
  return {goal:memoryText(brief.goal,2000,true),continuity:brief.continuity.map(s=>memoryText(s,600,true)),query:memoryText(brief.query??'',240)};
}
export function readShotDirection(studio,projectId,clipId){
  selected(studio,projectId,clipId);
  const direction=currentDirection(studio,projectId,clipId);
  return {direction,proposal:direction?.latestProposalId?studio.read(direction.latestProposalId,'shot-proposal'):null};
}
export function saveShotDirection(studio,projectId,clipId,{baseRevision,brief}={}){
  selected(studio,projectId,clipId);const normalized=normalizeBrief(brief);
  if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw Error('direction_revision');
  return studio.transaction(()=>{
    const prior=currentDirection(studio,projectId,clipId);if((prior?.revision||0)!==baseRevision)throw Error('direction_revision_conflict');
    return studio.write('shot-direction',{id:directionId(projectId,clipId),schema:'shutter-shot-direction-v1',projectId,clipId,revision:baseRevision+1,brief:normalized,latestProposalId:prior?.latestProposalId||null,evidence:'artist-authored',updatedAt:new Date().toISOString()});
  });
}
export function proposeShots(studio,projectId,clipId,{baseRevision,directionRevision}={}){
  if(!Number.isSafeInteger(baseRevision)||!Number.isSafeInteger(directionRevision))throw Error('direction_revision');
  const {record,shot}=selected(studio,projectId,clipId,baseRevision),direction=currentDirection(studio,projectId,clipId);
  if(!direction||direction.revision!==directionRevision)throw Error('direction_revision_conflict');
  const found=searchMoments(studio,projectId,{query:direction.brief.query,limit:100}),visual=found.results.filter(m=>['video','image'].includes(m.mediaKind));
  const candidates=visual.slice(0,12).map(m=>{
    const sourceStart=`${m.startUs}/1000000`,candidate={assetId:m.assetId,sourceStart,endUs:m.endUs};let fit;
    try{fit=rangeFitsTake(candidate,shot,record.timeline.fps,getMediaProfile(studio,m.assetId));}catch{fit={fits:false,reason:'source_unavailable'};}
    return {momentId:m.id,momentRevision:m.revision,label:m.label,notes:m.notes,tags:m.tags,assetName:m.assetName,mediaKind:m.mediaKind,
      ...candidate,startUs:m.startUs,sourceSha256:m.sourceSha256,...fit,current:sameSelection(candidate,shot,record.timeline.fps),
      evidence:'artist-authored',continuity:'needs-review',command:{type:'replace',clipId,assetId:m.assetId,sourceStart}};
  });
  const value={schema:'shutter-shot-proposal-v1',projectId,clipId,baseRevision,directionRevision,brief:direction.brief,
    shot:{...shot,coverage:(record.timeline.coverage||[]).filter(c=>c.at<shot.end&&c.at+c.frames>shot.at)},fps:record.timeline.fps,
    candidates,search:{query:found.query,total:found.total,shown:candidates.length,engine:'authored-words'},
    operation:'replace-source-keep-timing',continuity:'artist-review-required'};
  const id='proposal_'+fingerprint(value);
  return studio.transaction(()=>{
    const existing=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);
    if(existing&&existing.kind!=='shot-proposal')throw Error('direction_identity_conflict');
    const proposal=studio.write('shot-proposal',{id,...value,createdAt:new Date().toISOString()});
    studio.write('shot-direction',{...direction,latestProposalId:id});return proposal;
  });
}
export async function acceptShotProposal(studio,projectId,clipId,{proposalId,momentId,reviewed,checkedContinuity}={}){
  const proposal=studio.read(memoryId(proposalId),'shot-proposal');
  if(proposal.projectId!==projectId||proposal.clipId!==clipId)throw Error('not_found');
  const candidate=proposal.candidates.find(c=>c.momentId===momentId);if(!candidate)throw Error('direction_candidate_not_found');
  const required=proposal.brief.continuity.length;
  if(reviewed!==true||!Array.isArray(checkedContinuity)||checkedContinuity.length!==required||new Set(checkedContinuity).size!==required||checkedContinuity.some(i=>!Number.isSafeInteger(i)||i<0||i>=required))throw Error('direction_review_required');
  const check=()=>{
    const {record,shot}=selected(studio,projectId,clipId,proposal.baseRevision);
    if(currentDirection(studio,projectId,clipId)?.revision!==proposal.directionRevision)throw Error('direction_revision_conflict');
    let moment;try{moment=readMoment(studio,projectId,momentId);}catch(e){if(e.message==='not_found')throw Error('memory_revision_conflict');throw e;}
    if(moment.revision!==candidate.momentRevision||moment.sourceSha256!==candidate.sourceSha256)throw Error('memory_revision_conflict');
    const fit=rangeFitsTake(candidate,shot,record.timeline.fps,getMediaProfile(studio,candidate.assetId));if(!fit.fits)throw Error(fit.reason);
    if(sameSelection(candidate,shot,record.timeline.fps))throw Error('direction_already_selected');return record;
  };
  check();
  // Collection verifies both immutable files and preserves the original selection.
  // A rejected later edit may leave an unaccepted take, never a partial picture edit.
  await collectTake(studio,projectId,clipId,{baseRevision:proposal.baseRevision,stackRevision:getTakeStack(studio,projectId,clipId).revision,momentId,momentRevision:candidate.momentRevision});
  const record=check(); // Recheck direction, note and cut after asynchronous file verification.
  const ids=new Set([...record.timeline.clips,...record.timeline.coverage||[],candidate].map(c=>c.assetId));
  const profiles=new Map([...ids].map(id=>[id,getMediaProfile(studio,id)]));
  return studio.saveTimeline(projectId,proposal.baseRevision,applyEdit(record.timeline,candidate.command,profiles));
}
