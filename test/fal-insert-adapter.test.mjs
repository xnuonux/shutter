import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FalRenderer} from '../src/fal-renderer.mjs';
import {h3Input,validateH3} from '../src/h3-spec.mjs';
class FakeStudio{
 constructor(job,{timelineRevision=7}={}){this.records=new Map();this.jobs=new Map([[job.id,structuredClone(job)]]);this.timelineRevision=timelineRevision;this.assets=new Map(job.snapshot.references.map(a=>[a.id,a]));}
 read(id,kind){const r=this.records.get(id);if(!r||r.kind!==kind)throw Error('not_found');return structuredClone(r.value);}
 write(kind,value){this.records.set(value.id,{kind,value:structuredClone(value)});return structuredClone(value);}
 listJobs(){return [...this.jobs.values()].map(structuredClone);}
 getJob(id){const j=this.jobs.get(id);if(!j)throw Error('not_found');return structuredClone(j);}
 updateJob(id,patch){const j={...this.getJob(id),...structuredClone(patch),id};this.jobs.set(id,j);return structuredClone(j);}
 verifyAsset(id){const a=this.assets.get(id);if(!a)throw Error('not_found');return structuredClone(a);}
 assetPath(id){return '/synthetic/'+id+'.png';}
 getProduction(){return {revision:3};}
 getTimeline(){return {revision:this.timelineRevision};}
 transaction(fn){return fn();}
}
const asset={id:'asset_'+('1'.repeat(64)),sha256:'1'.repeat(64),kind:'image',mime:'image/png',filename:'1'.repeat(64)+'.png',bytes:100};
const job=(resolution='1080P',quality='quality',limit=1)=>({id:'job_insert',projectId:'prod_demo',state:'prepared',providerId:null,snapshot:{workflow:'minimax/h3-max/image-to-video',projectRevision:3,timelineRevision:7,spendLimitUsd:limit,references:[asset],bindings:[{assetId:asset.id,role:'opening frame'}],cast:[],place:{},style:'Preserve the source.',shot:{id:'shot',title:'Generated alternate',action:'Continue the camera move.',reference:asset.id,generation:{model:'h3-max',mode:'image-to-video',duration:5,resolution,promptExpansionMode:quality,aspectRatio:'adaptive'}}}});
const priceResponse=unit=>({data:{prices:[{endpoint_id:'minimax/h3-max/image-to-video',currency:'USD',unit:'seconds',unit_price:unit}]},units:null});
test('H3 input carries the current 1080P and quality controls',()=>{const j=job();validateH3({read:()=>asset},j.snapshot.shot,[]);const input=h3Input(j,()=> 'data:image/png;base64,AAA');assert.equal(input.resolution,'1080P');assert.equal(input.prompt_expansion_mode,'quality');assert.equal(input.image_url,'data:image/png;base64,AAA');});
test('quote reads live endpoint pricing instead of a calendar promotion constant',async()=>{const s=new FakeStudio(job());const r=new FalRenderer(s,{key:'test',probe:async()=>({decoded:true,kind:'image',width:1920,height:1080})});r.request=async()=>priceResponse(.02);const prepared=await r.prepare('job_insert');assert.equal(prepared.quote.baseRate,.02);assert.equal(prepared.quote.outputRate,.064);assert.equal(prepared.quote.estimatedUsd,.32);assert.equal(prepared.quote.reservedUsd,.32);});
test('timeline-bound insert job cannot submit after the saved cut changes',async()=>{const s=new FakeStudio(job(),{timelineRevision:8});const r=new FalRenderer(s,{key:'test',probe:async()=>({decoded:true,kind:'image',width:1920,height:1080})});r.request=async()=>priceResponse(.02);await r.prepare('job_insert');await assert.rejects(r.submit('job_insert'),/prepared_revision_conflict/);assert.equal(s.getJob('job_insert').state,'prepared');});
test('per-insert hard spending ceiling is checked before provider submission',async()=>{const s=new FakeStudio(job('1080P','balanced',.10));const r=new FalRenderer(s,{key:'test',probe:async()=>({decoded:true,kind:'image',width:1920,height:1080})});r.request=async()=>priceResponse(.02);await r.prepare('job_insert');await assert.rejects(r.submit('job_insert'),/job_spend_limit_exceeded/);assert.equal(s.getJob('job_insert').state,'prepared');});
test('reference-to-video 1080P remains explicitly unqualified until its input-token pricing is modeled',()=>{const s={read:()=>asset};assert.throws(()=>validateH3(s,{id:'x',action:'x',cast:[],extraReferences:[{assetId:asset.id,role:'reference'}],generation:{model:'h3-max',mode:'reference-to-video',duration:5,resolution:'1080P',promptExpansionMode:'balanced',aspectRatio:'16:9'}},[]),/h3_reference_1080_unqualified/);});
