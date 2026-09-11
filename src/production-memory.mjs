/** Authored source intervals in the existing journal; FTS5 is a rebuildable derived index. */
import crypto from 'node:crypto';
import {fingerprint} from './store.mjs';
import {getMediaProfile,verifyMediaAsset} from './media-io.mjs';
import {MEMORY_LIMITS,memoryId,memoryText,normalizeMoment,searchExpression,sourceSelection,sameSelection,rangeFitsTake,takeProposal} from '../public/memory-contract.mjs';
const ready=new WeakSet();
function words(alias){return `coalesce(json_extract(${alias}.payload,'$.label'),'')||' '||coalesce(json_extract(${alias}.payload,'$.notes'),'')||' '||coalesce(json_extract(${alias}.payload,'$.tags'),'')||' '||coalesce(json_extract(${alias}.payload,'$.assetName'),'')`;}
export function ensureMemory(studio){
  if(ready.has(studio.db))return;
  // Triggers keep search and authored records atomic, including updates made outside this module.
  try {studio.db.exec(`SAVEPOINT shutter_memory_schema;
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_search_v1 USING fts5(id UNINDEXED,project_id UNINDEXED,words,tokenize='unicode61 remove_diacritics 2');
    CREATE TRIGGER IF NOT EXISTS memory_insert_v1 AFTER INSERT ON records WHEN new.kind='memory-moment' BEGIN
      INSERT INTO memory_search_v1(id,project_id,words) VALUES(new.id,json_extract(new.payload,'$.projectId'),${words('new')});END;
    CREATE TRIGGER IF NOT EXISTS memory_update_v1 AFTER UPDATE ON records WHEN new.kind='memory-moment' BEGIN
      DELETE FROM memory_search_v1 WHERE id=old.id;
      INSERT INTO memory_search_v1(id,project_id,words) VALUES(new.id,json_extract(new.payload,'$.projectId'),${words('new')});END;
    CREATE TRIGGER IF NOT EXISTS memory_delete_v1 AFTER DELETE ON records WHEN old.kind='memory-moment' BEGIN
      DELETE FROM memory_search_v1 WHERE id=old.id;END;
    DELETE FROM memory_search_v1;
    INSERT INTO memory_search_v1(id,project_id,words) SELECT r.id,json_extract(r.payload,'$.projectId'),${words('r')} FROM records r WHERE kind='memory-moment';
    RELEASE shutter_memory_schema;`);}catch(e){try{studio.db.exec('ROLLBACK TO shutter_memory_schema; RELEASE shutter_memory_schema;');}catch{}throw e;}
  ready.add(studio.db);
}
function optional(studio,id,kind){const row=studio.db.prepare('SELECT kind FROM records WHERE id=?').get(id);if(!row)return null;if(row.kind!==kind)throw Error('memory_identity_conflict');return studio.read(id,kind);}
function project(studio,id){memoryId(id);studio.getProduction(id);}
export function readMoment(studio,projectId,id){project(studio,projectId);const m=studio.read(memoryId(id),'memory-moment');if(m.projectId!==projectId)throw Error('not_found');return m;}
export async function saveMoment(studio,projectId,input,{baseRevision=0}={}){
  project(studio,projectId);const moment=normalizeMoment(input);
  if(!Number.isSafeInteger(baseRevision)||baseRevision<0)throw Error('memory_revision');
  const asset=await verifyMediaAsset(studio,moment.assetId),profile=getMediaProfile(studio,moment.assetId);
  if(profile.kind==='image'){if(moment.startUs!==0)throw Error('image_source_start');}
  else if(moment.endUs>Math.floor(profile.duration*1e6))throw Error('memory_source_range');
  ensureMemory(studio);
  return studio.transaction(()=>{
    const prior=optional(studio,moment.id,'memory-moment');
    // A global id cannot be rebound across productions or sources.
    if(prior&&(prior.projectId!==projectId||prior.assetId!==moment.assetId))throw Error('memory_identity_conflict');
    if((prior?.revision||0)!==baseRevision)throw Error('revision_conflict');
    if(!prior&&studio.db.prepare("SELECT count(*) AS n FROM records WHERE kind='memory-moment' AND json_extract(payload,'$.projectId')=?").get(projectId).n>=MEMORY_LIMITS.notes)throw Error('memory_note_limit');
    return studio.write('memory-moment',{...moment,schema:'shutter-memory-moment-v1',projectId,revision:baseRevision+1,
      sourceSha256:asset.sha256,assetName:asset.name,mediaKind:profile.kind,technical:{width:profile.width,height:profile.height,fps:profile.fps,codec:profile.videoCodec},
      evidence:'artist-authored',createdAt:prior?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});
  });
}
export function deleteMoment(studio,projectId,id,baseRevision){
  ensureMemory(studio);return studio.transaction(()=>{const m=readMoment(studio,projectId,id);if(m.revision!==baseRevision)throw Error('revision_conflict');studio.db.prepare("DELETE FROM records WHERE id=? AND kind='memory-moment'").run(id);return {deleted:id};});
}
export function searchMoments(studio,projectId,{query='',favorite=false,kind='all',limit=50,offset=0}={}){
  project(studio,projectId);ensureMemory(studio);const expression=searchExpression(query);
  if(typeof favorite!=='boolean'||!['all','video','image','audio'].includes(kind)||!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>MEMORY_LIMITS.notes)throw Error('memory_search_options');
  const params=[projectId],where=["json_extract(r.payload,'$.projectId')=?"];
  if(favorite)where.push("json_extract(r.payload,'$.favorite')=1");
  if(kind!=='all'){where.push("json_extract(r.payload,'$.mediaKind')=?");params.push(kind);}
  let join='',order="json_extract(r.payload,'$.favorite') DESC, json_extract(r.payload,'$.updatedAt') DESC,r.id";
  if(expression.query&&!expression.empty){join=' JOIN memory_search_v1 s ON s.id=r.id';where.push('memory_search_v1 MATCH ?');params.push(expression.match);order='bm25(memory_search_v1),'+order;}
  if(expression.query&&expression.empty)return {schema:'shutter-memory-search-v1',query,results:[],nextOffset:null,total:0,engine:'SQLite FTS5 · lexical, not semantic'};
  const condition="r.kind='memory-moment' AND "+where.join(' AND ');
  const total=studio.db.prepare('SELECT count(*) AS n FROM records r'+join+' WHERE '+condition).get(...params).n;
  const results=studio.db.prepare('SELECT r.payload FROM records r'+join+' WHERE '+condition+' ORDER BY '+order+' LIMIT ? OFFSET ?').all(...params,limit,offset).map(row=>JSON.parse(row.payload));
  return {schema:'shutter-memory-search-v1',query,results,total,nextOffset:offset+results.length<total?offset+results.length:null,engine:'SQLite FTS5 · lexical, not semantic'};
}
const stackId=(projectId,clipId)=>'stack_'+fingerprint([projectId,clipId]);
function selectedShot(studio,projectId,clipId,baseRevision){
  project(studio,projectId);memoryId(clipId);const record=studio.getTimeline(projectId);
  if(record.timeline.format!=='shutter-media-edit-v1')throw Error('media_edit_required');
  if(baseRevision!==undefined&&(!Number.isSafeInteger(baseRevision)||record.revision!==baseRevision))throw Error('revision_conflict');
  const clip=record.timeline.clips.find(c=>c.id===clipId);if(!clip)throw Error('take_shot_not_found');return {record,clip};
}
export function getTakeStack(studio,projectId,clipId){
  const {record,clip}=selectedShot(studio,projectId,clipId),stack=optional(studio,stackId(projectId,clipId),'take-stack')||{id:stackId(projectId,clipId),schema:'shutter-take-stack-v1',projectId,clipId,revision:0,candidates:[]};
  return {...stack,timelineRevision:record.revision,shotFrames:clip.frames,fps:record.timeline.fps,candidates:stack.candidates.map(c=>{
    let fit;try{fit=rangeFitsTake(c,clip,record.timeline.fps,getMediaProfile(studio,c.assetId));}catch{fit={fits:false,reason:'source_unavailable'};}
    return {...c,...fit,current:sameSelection(c,clip,record.timeline.fps)};
  })};
}
function cleanStack(stack){return {...stack,candidates:stack.candidates.map(({fits,reason,current,...c})=>c)};}
export async function collectTake(studio,projectId,clipId,{baseRevision,stackRevision,momentId,momentRevision}={}){
  const before=selectedShot(studio,projectId,clipId,baseRevision),moment=readMoment(studio,projectId,momentId);
  if(moment.revision!==momentRevision)throw Error('memory_revision_conflict');
  if(!['video','image'].includes(moment.mediaKind))throw Error('visual_media_required');
  const source=await verifyMediaAsset(studio,moment.assetId);await verifyMediaAsset(studio,before.clip.assetId);
  if(source.sha256!==moment.sourceSha256)throw Error('asset_integrity');
  ensureMemory(studio);
  return studio.transaction(()=>{
    const {record,clip}=selectedShot(studio,projectId,clipId,baseRevision),currentMoment=readMoment(studio,projectId,momentId);
    if(currentMoment.revision!==momentRevision)throw Error('memory_revision_conflict');
    const stack=cleanStack(getTakeStack(studio,projectId,clipId));
    if(!Number.isSafeInteger(stackRevision)||stack.revision!==stackRevision)throw Error('stack_revision_conflict');
    const currentAsset=studio.read(clip.assetId,'asset'),profile=getMediaProfile(studio,clip.assetId);
    if(!stack.candidates.some(c=>sameSelection(c,clip,record.timeline.fps)))stack.candidates.push({id:'take_'+crypto.randomUUID(),label:stack.candidates.length?'Prior selection':'Original selection',
      ...sourceSelection(clip,record.timeline.fps),endUs:profile.kind==='image'?MEMORY_LIMITS.rangeUs:Math.floor(profile.duration*1e6),
      sourceSha256:currentAsset.sha256,evidence:'saved-shot',capturedRevision:record.revision});
    const candidate={id:'take_'+crypto.randomUUID(),label:moment.label,assetId:moment.assetId,sourceStart:`${moment.startUs}/1000000`,endUs:moment.endUs,
      sourceSha256:moment.sourceSha256,evidence:'artist-authored',momentId,momentRevision,notes:moment.notes,tags:moment.tags};
    if(!stack.candidates.some(c=>c.momentId===momentId&&c.momentRevision===momentRevision))stack.candidates.push(candidate);
    if(stack.candidates.length>MEMORY_LIMITS.takes)throw Error('take_stack_limit');
    delete stack.timelineRevision;delete stack.shotFrames;delete stack.fps;
    studio.write('take-stack',{...stack,revision:stack.revision+1,updatedAt:new Date().toISOString()});return getTakeStack(studio,projectId,clipId);
  });
}
export async function acceptTake(studio,projectId,clipId,{baseRevision,stackRevision,candidateId}={}){
  selectedShot(studio,projectId,clipId,baseRevision);let stack=getTakeStack(studio,projectId,clipId);
  if(stack.revision!==stackRevision)throw Error('stack_revision_conflict');
  const candidate=stack.candidates.find(c=>c.id===candidateId);if(!candidate)throw Error('take_not_found');
  const asset=await verifyMediaAsset(studio,candidate.assetId);if(asset.sha256!==candidate.sourceSha256)throw Error('asset_integrity');
  // No await between the final two revision checks and the timeline's atomic save.
  const {record,clip}=selectedShot(studio,projectId,clipId,baseRevision);stack=getTakeStack(studio,projectId,clipId);
  if(stack.revision!==stackRevision)throw Error('stack_revision_conflict');
  const proposal=takeProposal(record.timeline,clipId,candidate,getMediaProfile(studio,candidate.assetId));
  if(sameSelection(candidate,clip,record.timeline.fps))return {...record,unchanged:true};
  return studio.saveTimeline(projectId,baseRevision,proposal);
}
export function exportProductionMemory(studio,projectId){
  project(studio,projectId);return {schema:'shutter-production-memory-export-v1',projectId,
    moments:studio.list('memory-moment').filter(m=>m.projectId===projectId),stacks:studio.list('take-stack').filter(s=>s.projectId===projectId),
    limitations:['Metadata only; not a portable media/database backup.','Search is lexical over artist-authored words; no visual identity inference or transcription.']};
}
