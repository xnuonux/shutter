/** Exact-file recovery for the local content-addressed library. Never substitutes a take. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {MAX_IMPORT_BYTES,fileDigest} from './media-io.mjs';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const cancelled = signal => { if (signal?.aborted) throw Error('media_recovery_cancelled'); };
export const assetRecordKey = asset => digest(JSON.stringify([asset.id,asset.sha256,asset.filename,asset.bytes]));
export const savedEditKey = record => digest(JSON.stringify(record.timeline));
function checkedRecord(studio,id) {
  if (!/^asset_[a-f0-9]{64}$/.test(id)) throw Error('media_record_invalid');
  const asset=studio.read(id,'asset');
  if (asset.id!==id || asset.sha256!==id.slice(6) ||
      !new RegExp('^'+asset.sha256+'\\.[a-z0-9]{1,10}$').test(asset.filename) ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes<1) throw Error('media_record_invalid');
  return asset;
}
async function assetDirectory(studio) {
  const root=await fsp.realpath(studio.root),directory=path.join(root,'assets');
  const info=await fsp.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw Error('media_directory_unsafe');
  return directory;
}
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
/** Hash a stable, opened file. No symbolic-link targets or caller-supplied paths are read. */
export async function inspectStoredAsset(studio,id,{signal,budget}={}) {
  cancelled(signal);
  let asset;
  try {asset=checkedRecord(studio,id);} catch(e) {
    return {assetId:id,status:'unassessed',reason:e.message==='not_found'?'record-missing':'record-invalid',restoreEligible:false};
  }
  const result={assetId:id,name:asset.name,kind:asset.kind,expectedBytes:asset.bytes,expectedSha256:asset.sha256,
    recordKey:assetRecordKey(asset),restoreEligible:false};
  let handle;
  try {
    const directory=await assetDirectory(studio),file=path.join(directory,asset.filename);
    let before;
    try {before=await fsp.lstat(file,{bigint:true});}
    catch(e) {if(e.code==='ENOENT')return {...result,status:'missing',reason:'file-missing',restoreEligible:asset.bytes<=MAX_IMPORT_BYTES};throw e;}
    if(!before.isFile() || before.isSymbolicLink())return {...result,status:'unassessed',reason:'unsafe-file-type'};
    if(before.size!==BigInt(asset.bytes))return {...result,status:'changed',reason:'size-mismatch',observedBytes:Number(before.size)};
    if(budget && (budget.remaining<asset.bytes || Date.now()>=budget.deadline))return {...result,status:'unassessed',reason:'scan-budget'};
    handle=await fsp.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    if(stamp(before)!==stamp(await handle.stat({bigint:true})))throw Error('media_file_changed');
    const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024);let bytes=0;
    for (;;) {
      cancelled(signal);
      if(budget && Date.now()>=budget.deadline)throw Error('media_scan_budget');
      const {bytesRead}=await handle.read(buffer,0,buffer.length,bytes);
      if(!bytesRead)break;
      bytes+=bytesRead;
      if(budget){budget.remaining-=bytesRead;if(budget.remaining<0)throw Error('media_scan_budget');}
      if(bytes>asset.bytes)throw Error('media_file_changed');
      hash.update(buffer.subarray(0,bytesRead));
    }
    if(bytes!==asset.bytes || stamp(before)!==stamp(await handle.stat({bigint:true})) ||
       stamp(before)!==stamp(await fsp.lstat(file,{bigint:true})))throw Error('media_file_changed');
    const observedSha256=hash.digest('hex');
    return {...result,status:observedSha256===asset.sha256?'verified':'changed',reason:observedSha256===asset.sha256?'sha256-match':'hash-mismatch',observedBytes:bytes,observedSha256};
  } catch(e) {
    cancelled(signal);
    return {...result,status:'unassessed',reason:e.message==='media_scan_budget'?'scan-budget':
      e.message==='media_file_changed'?'changed-during-read':e.message==='media_directory_unsafe'?'unsafe-directory':
      e.code==='ELOOP'?'unsafe-file-type':e.code==='ENOENT'?'changed-during-read':'read-failed'};
  } finally {await handle?.close();}
}
/** Read the saved record directly so missing media cannot prevent diagnosis by compilation. */
export function mediaHealthScope(studio,projectId,baseRevision) {
  studio.read(projectId,'production');
  const record=studio.read('timeline_'+projectId,'timeline'),edit=record.timeline;
  if(edit?.format!=='shutter-media-edit-v1')throw Error('media_edit_required');
  if(!Number.isSafeInteger(baseRevision)||baseRevision!==record.revision)throw Error('revision_conflict');
  const used=new Map();
  const add=(assetId,role)=>{
    if(typeof assetId!=='string'||!/^asset_[a-f0-9]{64}$/.test(assetId))throw Error('media_reference_invalid');
    const item=used.get(assetId)||{assetId,roles:[]};item.roles.push(role);used.set(assetId,item);
  };
  if(!Array.isArray(edit.clips)||edit.clips.length>250)throw Error('media_edit_invalid');
  edit.clips.forEach((c,i)=>add(c.assetId,`picture ${i+1}`));
  if(!Array.isArray(edit.coverage??[])||(edit.coverage||[]).length>250)throw Error('coverage_invalid');
  (edit.coverage||[]).forEach((c,i)=>add(c.assetId,`coverage ${i+1}`));
  if(edit.soundtrack)add(edit.soundtrack.assetId,'master song');
  for(const lane of edit.soundStage?.tracks||[])for(const clip of lane.clips||[])add(clip.assetId,`sound: ${lane.name||lane.id}${lane.mute?' (muted)':''}`);
  // Check the same last-created proxy that the existing viewer selects, not an invented substitute.
  const primary=[...used.keys()],derivations=studio.list('media-derivation');
  for(const id of primary){const proxy=derivations.findLast(d=>d.recipe?.operation==='browser-proxy'&&d.recipe.sourceAssetId===id);if(proxy?.outputAssetId)add(proxy.outputAssetId,'viewing copy of '+id);}
  if(used.size>1000)throw Error('media_scan_asset_limit');
  return {record,items:[...used.values()]};
}
export async function checkMediaHealth(studio,projectId,{baseRevision}={}, {signal,maxHashBytes=64*1024**3,timeoutMs=300000}={}) {
  if(!Number.isSafeInteger(maxHashBytes)||maxHashBytes<0||maxHashBytes>64*1024**3||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw Error('media_scan_limits');
  const {record,items}=mediaHealthScope(studio,projectId,baseRevision),startedAt=new Date().toISOString();
  const budget={remaining:maxHashBytes,deadline:Date.now()+timeoutMs},assets=[];
  for(const item of items){cancelled(signal);assets.push({...await inspectStoredAsset(studio,item.assetId,{signal,budget}),roles:item.roles});}
  cancelled(signal);
  const counts={verified:0,missing:0,changed:0,unassessed:0};for(const a of assets)counts[a.status]++;
  return studio.write('media-health',{id:'media_health_'+crypto.randomUUID(),schema:'shutter-media-health-v1',projectId,
    revision:record.revision,editKey:savedEditKey(record),startedAt,completedAt:new Date().toISOString(),assets,counts,
    complete:counts.unassessed===0,allVerified:assets.length>0&&counts.verified===assets.length,
    scope:'Current saved picture, master, all authored sound (including muted lanes), and each selected viewing copy. Not history, unused library assets or ancestors.',
    notAssessed:['Codec decodability, frame cadence, display color, audio synchronization or native editor import.','Historical cuts, other library files, upstream originals of derivatives, project database recovery or external drive relinking.'],
    bytesHashed:maxHashBytes-budget.remaining});
}
/** Caller must serialize with mediaExclusive. No overwrite, rename, deletion, decoder or provider call. */
export async function restoreMissingAsset(studio,id,stream,{recordKey,signal}={}) {
  cancelled(signal);
  const asset=checkedRecord(studio,id);
  if(recordKey!==assetRecordKey(asset))throw Error('media_restore_record_conflict');
  if(asset.bytes>MAX_IMPORT_BYTES)throw Error('media_restore_size_limit');
  const initial=await inspectStoredAsset(studio,id,{signal});
  if(!['missing','verified'].includes(initial.status))throw Error('media_restore_existing_file_protected');
  const directory=await assetDirectory(studio),folder=await fsp.mkdtemp(path.join(directory,'.restore-'));
  const candidate=path.join(folder,'candidate'),target=path.join(directory,asset.filename);
  let handle,published=false;
  try {
    handle=await fsp.open(candidate,'wx',0o600);const hash=crypto.createHash('sha256');let bytes=0;
    for await(const input of stream){
      cancelled(signal);const chunk=Buffer.isBuffer(input)?input:Buffer.from(input);bytes+=chunk.length;
      if(bytes>asset.bytes)throw Error('media_restore_size_mismatch');hash.update(chunk);
      let offset=0;while(offset<chunk.length){const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);if(!bytesWritten)throw Error('media_restore_write_failed');offset+=bytesWritten;}
    }
    if(bytes!==asset.bytes)throw Error('media_restore_size_mismatch');
    if(hash.digest('hex')!==asset.sha256)throw Error('media_restore_hash_mismatch');
    await handle.sync();await handle.close();handle=null;cancelled(signal);
    if(await fileDigest(candidate)!==asset.sha256)throw Error('media_restore_hash_mismatch');
    cancelled(signal);
    if(assetRecordKey(checkedRecord(studio,id))!==recordKey)throw Error('media_restore_record_conflict');
    if(await assetDirectory(studio)!==directory)throw Error('media_directory_unsafe');
    try {await fsp.link(candidate,target);published=true;}
    catch(e){if(e.code!=='EEXIST')throw e;const current=await inspectStoredAsset(studio,id,{signal});if(current.status!=='verified')throw Error('media_restore_existing_file_protected');}
    // The file may be installed before a process crash or DB failure. A retry is safe and idempotent.
    const receipt=studio.write('media-restoration',{id:'media_restore_'+crypto.randomUUID(),schema:'shutter-media-restore-v1',
      assetId:id,sha256:asset.sha256,bytes:asset.bytes,recordKey,status:published?'restored':'already-present',createdAt:new Date().toISOString(),
      originalRecordUnchanged:true,timelineUnchanged:true});
    return receipt;
  } finally {await handle?.close();await fsp.rm(folder,{recursive:true,force:true});}
}
