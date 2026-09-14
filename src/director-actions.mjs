/** Deterministic Studio editing over the existing journal, compiler and undo history. */
import {ACTIONS,ACTION_VERSION,PROPOSAL_SELECTION_SCHEMA,validateSchema,validateCommand} from '../public/action-contract.mjs';
import {applyTimelineCommand} from '../public/edit-actions.mjs';
import {getMediaProfile} from './media-io.mjs';
import {MEDIA_EDIT_FORMAT} from './media-edit.mjs';
import {fingerprint} from './store.mjs';
import {resolveProposalSelection} from './shot-direction.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',minLength:1,maxLength:200,pattern:'^[A-Za-z0-9_-]+$'};
const revision={type:'integer',minimum:0};
const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
const requestFields={version:{const:ACTION_VERSION},baseRevision:revision,commands:{type:'array',minItems:1,maxItems:32,items:{type:'object'}}};
const previewSchema=object({...requestFields,proposal:PROPOSAL_SELECTION_SCHEMA},Object.keys(requestFields));
const applySchema=object({...requestFields,proposal:PROPOSAL_SELECTION_SCHEMA,previewHash:hash,requestKey:id},[...Object.keys(requestFields),'previewHash','requestKey']);
const optionalRead=(studio,id,kind)=>{
  try{return studio.read(id,kind);}catch(e){if(e.message!=='not_found')throw e;return null;}
};
const history=type=>type==='undo'||type==='redo';
const receiptId=(projectId,requestKey)=>'edit_action_'+fingerprint({projectId,requestKey});

/** Authored direction only. This is context for judgment, never an inferred visual fact. */
export function sceneIntent(studio,projectId,clipIds){
  const unique=[...new Set(clipIds)],selected=unique.slice(0,16);
  const records=new Map(studio.list('shot-direction').filter(d=>d.projectId===projectId).map(d=>[d.clipId,d]));
  return {directions:selected.filter(id=>records.has(id)).map(clipId=>{
    const d=records.get(clipId);return {clipId,revision:d.revision,brief:structuredClone(d.brief),evidence:d.evidence||'artist-authored'};
  }),missingClipIds:selected.filter(id=>!records.has(id)),truncated:unique.length>selected.length};
}

export function actionCatalog(types=[]){
  validateSchema({type:'array',maxItems:ACTIONS.length,items:{type:'string'}},types);
  const requested=types.length?types.map(type=>ACTIONS.find(a=>a.type===type)||(()=>{throw Error('action_unsupported');})()):ACTIONS;
  return {version:ACTION_VERSION,scope:'asset-backed-studio',limits:{commandsPerBatch:32},
    units:{scene:'integer output frames; end exclusive',source:'exact nonnegative seconds as decimal or fraction strings',sound:'integer sample frames at 48000 Hz'},
    workflow:['Read action-context and retain the observed revision.','Request the needed action schemas by type.','For a chosen shot proposal, preserve proposal={proposalId,momentId} and exactly its single candidate command through preview, evidence and apply.','Preview a complete batch. Inspect changed fields, visible source intervals and warnings.','Apply with the exact commands, optional proposal, baseRevision, previewHash and a stable requestKey.','On an uncertain response, read the receipt or retry identical input with the same key. Never invent a result.'],
    boundaries:['No command generates media, uploads data or spends credits.','Picture ripple edits leave coverage, sound, text and cues pinned to authored scene positions. Review their synchronization.','An edit is not an artist continuity acceptance. Source matching and creative judgment remain separate.','Undo or redo must be the only command in a batch.','Local single-user interface; not hosted authentication.'],
    relatedTools:['shutter_studio_context','shutter_search_moments','shutter_save_moment','shutter_get_direction','shutter_save_direction','shutter_propose_shots','shutter_inspect_cutaway'],
    actions:requested.map(({type,description,effects,inputSchema,examples})=>({type,description,effects,...(types.length?{inputSchema,examples}:{})}))};
}

export function commandProfiles(studio,edit,commands=[]){
  commands.forEach(validateCommand);
  const ids=new Set([...edit.clips,...(edit.coverage||[])].map(c=>c.assetId));
  for(const op of commands)for(const assetId of [op.assetId,op.clip?.assetId,op.coverage?.assetId])if(assetId)ids.add(assetId);
  return new Map([...ids].map(id=>[id,getMediaProfile(studio,id)]));
}
function current(studio,projectId){
  const record=studio.getTimeline(projectId);
  if(record.timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');
  return record;
}
const view=c=>({id:c.id,assetId:c.assetId,at:c.at,frames:c.frames,sourceStart:c.sourceStart,fit:c.fit,layer:c.layer||'main'});
function resultView(record){
  const {timeline,plan}=record;
  return {timeline,frames:plan.frames,fps:plan.fps,main:plan.clips.map(view),visible:(plan.pictureClips||plan.clips).map(view),
    soundtrack:timeline.soundtrack||null,planHash:plan.hash,warnings:plan.warnings,canUndo:record.past.length>0,canRedo:record.future.length>0};
}
export function directorContext(studio,{projectId,assetOffset=0,assetLimit=30}={}){
  validateSchema(object({projectId:id,assetOffset:{type:'integer',minimum:0},assetLimit:{type:'integer',minimum:1,maximum:100}},['assetOffset','assetLimit']),{...(projectId?{projectId}:{}),assetOffset,assetLimit});
  const assets=studio.list('asset'),timelines=studio.list('timeline').filter(t=>t.timeline?.format===MEDIA_EDIT_FORMAT),profiles=new Map(studio.list('media-profile').map(p=>[p.assetId,p]));
  const selected=projectId?current(studio,projectId):null;
  const projects=timelines.map(t=>({id:t.projectId,title:studio.getProduction(t.projectId).title,revision:t.revision}));
  return {version:ACTION_VERSION,projects,assets:assets.slice(assetOffset,assetOffset+assetLimit).map(a=>{
    const media=profiles.get(a.id);
    return {id:a.id,name:a.name,kind:a.kind,sha256:a.sha256,media:media?{kind:media.kind,duration:media.duration,width:media.width,height:media.height,fps:media.fps,audio:media.audio}:null};
  }),nextAssetOffset:assetOffset+assetLimit<assets.length?assetOffset+assetLimit:null,
  ...(selected?{project:{id:projectId,title:studio.getProduction(projectId).title,revision:selected.revision,...resultView(selected),intent:sceneIntent(studio,projectId,selected.timeline.clips.map(c=>c.id))}}:{})};
}
export function previewActions(studio,projectId,input){
  validateSchema(previewSchema,input);input.commands.forEach(validateCommand);
  const record=current(studio,projectId);
  if(record.revision!==input.baseRevision)throw Error('revision_conflict');
  let binding={};
  if(input.proposal){
    const selection=resolveProposalSelection(studio,projectId,input.proposal,input.baseRevision);
    if(input.commands.length!==1||fingerprint(input.commands[0])!==fingerprint(selection.candidate.command))throw Error('proposal_command_conflict');
    binding={proposal:structuredClone(input.proposal),proposalContext:selection.context};
  }
  if(input.commands.some(c=>history(c.type))&&input.commands.length!==1)throw Error('action_history_standalone');
  const action=input.commands[0].type;let timeline=record.timeline;
  if(history(action)){
    timeline=action==='undo'?record.past.at(-1):record.future[0];
    if(!timeline)throw Error('timeline_no_'+action);
  }else{
    const profiles=commandProfiles(studio,record.timeline,input.commands);
    for(const command of input.commands)timeline=applyTimelineCommand(timeline,command,profiles);
  }
  const plan=studio.timelinePlan(projectId,timeline),fields=[...new Set([...Object.keys(record.timeline),...Object.keys(timeline)])].filter(k=>fingerprint(record.timeline[k]??null)!==fingerprint(timeline[k]??null)).sort();
  const previewHash=fingerprint({version:ACTION_VERSION,projectId,baseRevision:record.revision,before:record.timeline,beforePlan:record.plan.hash,commands:input.commands,after:timeline,afterPlan:plan.hash,...binding});
  const result=resultView({...record,timeline,plan});
  result.canUndo=action==='undo'?record.past.length>1:true;
  result.canRedo=action==='undo'||(action==='redo'&&record.future.length>1);
  return {version:ACTION_VERSION,projectId,baseRevision:record.revision,commands:structuredClone(input.commands),previewHash,...binding,
    changes:{fields,beforeFrames:record.plan.frames,afterFrames:plan.frames},result};
}
function replay(studio,projectId,receipt){
  return {...receipt.result,replayed:true,currentRevision:current(studio,projectId).revision};
}
export function actionReceipt(studio,projectId,requestKey){
  validateSchema(id,requestKey);studio.getProduction(projectId);
  const receipt=studio.read(receiptId(projectId,requestKey),'edit-action-receipt');
  return replay(studio,projectId,receipt);
}
export function applyActions(studio,projectId,input){
  validateSchema(applySchema,input);input.commands.forEach(validateCommand);
  const key=receiptId(projectId,input.requestKey),requestHash=fingerprint({projectId,...input});
  const existing=optionalRead(studio,key);
  if(existing){
    const receipt=optionalRead(studio,key,'edit-action-receipt');
    if(!receipt)throw Error('action_receipt_identity_conflict');
    if(receipt.requestHash!==requestHash)throw Error('action_request_conflict');
    return replay(studio,projectId,receipt);
  }
  const previewInput={version:input.version,baseRevision:input.baseRevision,commands:input.commands,...(input.proposal?{proposal:input.proposal}:{})};
  const p=previewActions(studio,projectId,previewInput);
  if(p.previewHash!==input.previewHash)throw Error('action_preview_conflict');
  const result={version:ACTION_VERSION,projectId,requestKey:input.requestKey,previewHash:p.previewHash,commands:p.commands,...(p.proposal?{proposal:p.proposal,proposalContext:p.proposalContext}:{}),baseRevision:p.baseRevision,revision:p.baseRevision+1,planHash:p.result.planHash,changes:p.changes,canUndo:p.result.canUndo,canRedo:p.result.canRedo};
  const action=input.commands[0].type;
  const guard=input.proposal?()=>{if(previewActions(studio,projectId,previewInput).previewHash!==input.previewHash)throw Error('action_preview_conflict');}:null;
  studio.saveTimeline(projectId,input.baseRevision,p.result.timeline,history(action)?action:'save',{id:key,projectId,requestHash,result},guard);
  return {...result,replayed:false,currentRevision:result.revision};
}
