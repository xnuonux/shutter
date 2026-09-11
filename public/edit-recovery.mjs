/** Local drafts are never automatically written over a newer server revision. */
export const RECOVERY_SCHEMA='shutter-local-draft-v1';
export function makeRecovery(projectId,record,timeline,updatedAt=new Date().toISOString()) {
  return {schema:RECOVERY_SCHEMA,projectId,baseRevision:record.revision,basePlanHash:record.plan.hash,timeline:structuredClone(timeline),updatedAt};
}
export function inspectRecovery(projectId,record,value) {
  if(!value||value.schema!==RECOVERY_SCHEMA||value.projectId!==projectId||!Number.isSafeInteger(value.baseRevision)||typeof value.basePlanHash!=='string'||value.timeline?.format!=='shutter-media-edit-v1')return {status:'invalid'};
  if(JSON.stringify(value.timeline)===JSON.stringify(record.timeline))return {status:'redundant'};
  if(value.baseRevision!==record.revision||value.basePlanHash!==record.plan.hash)return {status:'conflict',draft:value};
  return {status:'recoverable',draft:value};
}
export const recoveryKey=projectId=>'shutter:local-draft:v1:'+projectId;
