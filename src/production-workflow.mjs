import crypto from 'node:crypto';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function context(studio,p,shot,job){
 const index=p.shots.findIndex(s=>s.id===shot.id),previous=p.shots[index-1];
 const prior=previous?.selectedTake?studio.getJob(previous.selectedTake):null;
 return {take:{id:job.id,output:job.output,review:job.review||null},shot:{action:shot.action,camera:shot.camera,sound:shot.sound,before:shot.before,after:shot.after,reference:shot.reference,endReference:shot.endReference,generation:shot.generation,characterStates:shot.characterStates,location:shot.location,extraReferences:shot.extraReferences,cast:(p.cast||[]).filter(c=>(shot.cast||[]).includes(c.id)),style:p.style,place:shot.location?.name||shot.location?.reference?shot.location:p.place},previous:previous?{shotId:previous.id,jobId:prior?.id,output:prior?.output,after:previous.after,characterStates:previous.characterStates}:null};
}
export function shotWorkflow(studio,p,shot,jobId=shot.selectedTake){
 const job=jobId?studio.getJob(jobId):null;
 if(job&&(job.projectId!==p.id||job.shotId!==shot.id||job.state!=='ready'||!job.output))throw Error('ready_take_required');
 const ctx=job?context(studio,p,shot,job):null,contextHash=ctx?hash(ctx):null,last=job?.decisions?.at(-1);
 return {shotId:shot.id,jobId:job?.id||null,previousShotId:ctx?.previous?.shotId||null,previousJobId:ctx?.previous?.jobId||null,contextHash,decision:last?(last.contextHash===contextHash?last.decision:'review_again'):'candidate',lastDecision:last||null};
}
export function productionWorkflow(studio,id){const p=studio.getProduction(id);return {projectId:id,revision:p.revision,shots:p.shots.map(s=>shotWorkflow(studio,p,s)),takes:studio.listJobs().filter(j=>j.projectId===id&&j.state==='ready'&&p.shots.some(s=>s.id===j.shotId)).map(j=>shotWorkflow(studio,p,p.shots.find(s=>s.id===j.shotId),j.id))};}
export function decideTake(studio,id,input){
 return studio.transaction(()=>{
  const job=studio.getJob(id),p=studio.getProduction(job.projectId),shot=p.shots.find(s=>s.id===job.shotId);
  if(p.revision!==input.baseRevision)throw Error('revision_conflict');
  if(!shot)throw Error('shot_not_found');
  const current=shotWorkflow(studio,p,shot,id);
  if(current.contextHash!==input.contextHash)throw Error('review_context_conflict');
  if(!['accepted','needs_revision'].includes(input.decision))throw Error('invalid_decision');
  const note=String(input.note||'').trim().slice(0,2000);if(input.decision==='needs_revision'&&!note)throw Error('revision_note_required');
  studio.verifyAsset(job.output);
  const record={decision:input.decision,note,contextHash:current.contextHash,context:context(studio,p,shot,job),at:new Date().toISOString()};
  studio.updateJob(id,{decisions:[...(job.decisions||[]),record]});
  if(input.decision==='accepted'){shot.selectedTake=id;studio.write('production',{...p,revision:p.revision+1,updatedAt:record.at});}
  return productionWorkflow(studio,p.id);
 });
}
