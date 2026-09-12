import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {h3Input,isH3} from './h3-spec.mjs';
const execute=promisify(execFile);
const rounded=n=>Math.round(n*1e6)/1e6;
const resolutionMultiplier=resolution=>({'480P':1,'768P':1.6,'1080P':3.2}[resolution]??(()=>{throw Error('h3_resolution');})());
export async function probeMedia(file) {
 const {stdout}=await execute(process.env.SHUTTER_PROBE_PYTHON||'D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe',['-s',fileURLToPath(new URL('../tools/probe_media.py',import.meta.url)),file],{windowsHide:true,timeout:60000,maxBuffer:100000});
 return JSON.parse(stdout);
}
export class FalRenderer {
 constructor(studio,{key=process.env.FAL_KEY||process.env.FAL_API_KEY,queueBase='https://queue.fal.run',pricingBase='https://api.fal.ai/v1/models/pricing',probe=probeMedia,caps={text:1,imageReference:5}}={}) {
  this.studio=studio;this.key=key;this.queueBase=queueBase;this.pricingBase=pricingBase;this.probe=probe;this.polling=new Set();
  try{this.policy=studio.read('fal-study-budget-v1','budget');}catch(e){if(e.message!=='not_found')throw e;this.policy=studio.write('budget',{id:'fal-study-budget-v1',caps,reserve:.2,initialTotal:rounded(caps.text+caps.imageReference+.2),basis:'September 9 user-reported remaining funds; historical study excluded'});}
 }
 budget() {
  const result=Object.fromEntries(Object.entries(this.policy.caps).map(([k,cap])=>[k,{cap,spent:0,reserved:0,available:cap}]));
  for(const j of this.studio.listJobs().filter(isH3))if(j.charge){const p=result[j.charge.pool];if(!p)continue;if(j.charge.actualUsd!=null)p.spent+=j.charge.actualUsd;else p.reserved+=j.charge.reservedUsd;}
  for(const p of Object.values(result)){p.spent=rounded(p.spent);p.reserved=rounded(p.reserved);p.available=rounded(p.cap-p.spent-p.reserved);}
  return {...result,reserve:this.policy.reserve};
 }
 async request(url,options={}) {
  const u=new URL(url);const allowed=[new URL(this.queueBase).origin,new URL(this.pricingBase).origin];
  if(!allowed.includes(u.origin))throw Error('unexpected_fal_host');
  if(!this.key)throw Error('fal_key_missing');
  const r=await fetch(url,{...options,headers:{Authorization:'Key '+this.key,'content-type':'application/json'},signal:AbortSignal.timeout(90000),redirect:'error'});
  if(!r.ok)throw Error('fal_http_'+r.status);
  return {data:await r.json(),units:r.headers.get('x-fal-billable-units')};
 }
 async pricing(workflow){
  const {data}=await this.request(this.pricingBase+'?endpoint_id='+encodeURIComponent(workflow));
  const pricing=data.prices?.find(p=>p.endpoint_id===workflow),unit=Number(pricing?.unit_price);
  if(!pricing||pricing.currency!=='USD'||pricing.unit!=='seconds'||!Number.isFinite(unit)||unit<=0)throw Error('fal_pricing_unavailable');
  return {...pricing,unit_price:unit};
 }
 async prepare(id) {
  const job=this.studio.getJob(id);if(job.state!=='prepared')return job;
  const measured=[];
  for(const a of job.snapshot.references){this.studio.verifyAsset(a.id);const media=await this.probe(this.studio.assetPath(a.id));if(!media.decoded||media.kind!==a.kind)throw Error('reference_decode_failed');measured.push({id:a.id,sha256:a.sha256,...media});}
  const g=job.snapshot.shot.generation,ref=g.mode==='reference-to-video';
  if(ref&&g.resolution==='1080P')throw Error('h3_reference_1080_unqualified');
  let tokens=0;
  if(ref) {
   for(const kind of ['video','audio']){const clips=measured.filter(m=>m.kind===kind);if(clips.some(m=>!Number.isFinite(m.duration)||m.duration<2||m.duration>15)||clips.reduce((s,m)=>s+m.duration,0)>15.001)throw Error('h3_reference_duration');}
   for(const m of measured){if(m.kind==='image'){if(!Number.isFinite(m.width*m.height)||m.width<=0||m.height<=0)throw Error('reference_dimensions');tokens+=m.width*m.height/1024;}else tokens+=m.duration*(m.kind==='audio'?80:g.resolution==='480P'?2886:7459.2);}
  }
  const pricing=await this.pricing(job.snapshot.workflow),baseRate=pricing.unit_price,outputRate=baseRate*resolutionMultiplier(g.resolution);
  const estimatedUsd=rounded(outputRate*g.duration+(ref?Math.max(0,tokens-4096)*.02/1000:0));
  const quote={pool:g.mode==='text-to-video'?'text':'imageReference',estimatedUsd,reservedUsd:Math.ceil(estimatedUsd*1000)/1000,baseRate,outputRate,referenceTokens:tokens,referenceTokenRate:ref ? .02 : 0,measured,pricing:{endpointId:pricing.endpoint_id,currency:pricing.currency,unit:pricing.unit,unitPrice:pricing.unit_price},preparedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()};
  return this.studio.updateJob(id,{quote});
 }
 async submit(id) {
  let job=this.studio.getJob(id);
  if(job.providerId)return job;
  if(['unknown','submitting'].includes(job.state))throw Error('submission_unknown');
  if(job.state!=='prepared')throw Error('job_not_prepared');
  if(!job.quote||Date.now()>Date.parse(job.quote.expiresAt))throw Error('quote_expired_prepare_again');
  if(Number.isSafeInteger(job.snapshot.timelineRevision)){
   if(this.studio.getTimeline(job.projectId).revision!==job.snapshot.timelineRevision)throw Error('prepared_revision_conflict');
  }else{
   const current=this.studio.getProduction(job.projectId);if(current.revision!==job.snapshot.projectRevision)throw Error('prepared_revision_conflict');
  }
  if(Number.isFinite(job.snapshot.spendLimitUsd)&&job.quote.reservedUsd>job.snapshot.spendLimitUsd+1e-9)throw Error('job_spend_limit_exceeded');
  for(const a of job.snapshot.references)this.studio.verifyAsset(a.id);
  const pricing=await this.pricing(job.snapshot.workflow);
  if(pricing.unit_price!==job.quote.baseRate)throw Error('fal_pricing_changed');
  const input=h3Input(job,assetId=>{const a=this.studio.verifyAsset(assetId);return 'data:'+a.mime+';base64,'+fs.readFileSync(this.studio.assetPath(assetId)).toString('base64');});
  const claimed=this.studio.transaction(()=>{
   const fresh=this.studio.getJob(id);if(fresh.state!=='prepared')return false;
   if(this.studio.listJobs().some(j=>['submitting','rendering','verifying','unknown'].includes(j.state)))throw Error('renderer_busy');
   if(this.studio.listJobs().some(j=>isH3(j)&&j.charge&&j.charge.actualUsd==null))throw Error('billing_reconciliation_required');
   const b=this.budget();if(job.quote.reservedUsd>b[job.quote.pool].available+1e-9)throw Error('budget_exceeded');
   this.studio.updateJob(id,{state:'submitting',charge:{pool:job.quote.pool,reservedUsd:job.quote.reservedUsd,actualUsd:null},pricing,startedAt:new Date().toISOString(),error:null,providerInput:h3Input(job,assetId=>'asset:'+assetId)});return true;
  });
  if(!claimed)return this.studio.getJob(id);
  try {
   const {data:receipt}=await this.request(this.queueBase+'/'+job.snapshot.workflow,{method:'POST',body:JSON.stringify(input)});
   if(!receipt.request_id||!receipt.status_url||!receipt.response_url)throw Error('missing_provider_receipt');
   return this.studio.updateJob(id,{state:'rendering',providerId:receipt.request_id,receipt,error:null});
  }catch(e){this.studio.updateJob(id,{state:'unknown',error:e.message});throw e;}
 }
 async reconcile(id) {
  const job=this.studio.getJob(id);if(!job.providerId||job.state==='ready'||job.state==='failed'||this.polling.has(id))return job;
  this.polling.add(id);let staging;
  try {
   const {data:status}=await this.request(job.receipt.status_url);
   if(['FAILED','CANCELLED'].includes(status.status))return this.studio.updateJob(id,{state:'failed',providerStatus:status.status,error:'provider_failed_billing_reconciliation_required'});
   if(status.status!=='COMPLETED')return this.studio.updateJob(id,{providerStatus:status.status});
   const result=await this.request(job.receipt.response_url);
   const units=result.units===null?null:Number(result.units);
   const charge={...job.charge,...(Number.isFinite(units)&&units>=0?{billableUnits:units,actualUsd:rounded(units*job.pricing.unit_price)}:{})};
   this.studio.updateJob(id,{state:'verifying',result:result.data,charge});
   const url=new URL(result.data.video?.url);
   if(!((url.protocol==='https:'&&(url.hostname==='fal.media'||url.hostname.endsWith('.fal.media')))||url.origin===new URL(this.queueBase).origin))throw Error('unexpected_media_host');
   const response=await fetch(url,{signal:AbortSignal.timeout(90000),redirect:'error'});if(!response.ok)throw Error('media_download_failed');
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>256*1024*1024)throw Error('video_too_large');chunks.push(chunk);}
   const bytes=Buffer.concat(chunks);staging=path.join(this.studio.root,id+'.mp4');fs.writeFileSync(staging,bytes);
   const media=await this.probe(staging),g=job.snapshot.shot.generation;
   // Real provider timing is retained rather than relabeled to the requested whole-second duration.
   if(media.kind!=='video'||!media.decoded||!Number.isFinite(media.duration)||Math.abs(media.duration-g.duration)>.25||Math.abs(media.fps-24)>.01||Math.abs(Math.min(media.width,media.height)-Number(g.resolution.slice(0,-1)))>16)throw Error('video_profile_mismatch');
   const asset=this.studio.importAsset(bytes,{name:job.snapshot.shot.title+'.mp4',origin:'fal H3 Max; job '+id+'; provider '+job.providerId});
   fs.unlinkSync(staging);staging=null;
   return this.studio.updateJob(id,{state:'ready',output:asset.id,media,timingDifferenceSeconds:rounded(media.duration-g.duration),finishedAt:new Date().toISOString(),error:charge.actualUsd==null?'billing_reconciliation_required':null});
  }catch(e){const terminal=!!staging||['unexpected_media_host','video_too_large'].includes(e.message);return this.studio.updateJob(id,{state:terminal?'failed':'verifying',error:e.message,...(staging?{failedCandidate:path.basename(staging)}:{})});}
  finally{this.polling.delete(id);}
 }
}
