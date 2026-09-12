import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FalRenderer} from '../src/fal-renderer.mjs';
import {h3Input,h3Snapshot} from '../src/h3-spec.mjs';
const image={id:'img',sha256:'a',kind:'image',mime:'image/png',bytes:1},video={id:'vid',sha256:'b',kind:'video',mime:'video/mp4',bytes:1};
class FakeStudio{
 constructor(job){this.records=new Map();this.jobs=new Map(job?[[job.id,structuredClone(job)]]:[]);this.assets=new Map([[image.id,image],[video.id,video]]);}
 read(id,kind){const r=this.records.get(id);if(!r||r.kind!==kind)throw Error('not_found');return structuredClone(r.value);}
 write(kind,value){this.records.set(value.id,{kind,value:structuredClone(value)});return structuredClone(value);}
 listJobs(){return [...this.jobs.values()].map(structuredClone);}
 getJob(id){const j=this.jobs.get(id);if(!j)throw Error('not_found');return structuredClone(j);}
 updateJob(id,patch){const j={...this.getJob(id),...structuredClone(patch),id};this.jobs.set(id,j);return structuredClone(j);}
 verifyAsset(id){const a=this.assets.get(id);if(!a)throw Error('not_found');return structuredClone(a);}
 assetPath(id){return '/synthetic/'+id;}
 getProduction(){return {revision:1};}
 getTimeline(){return {revision:1};}
 transaction(fn){return fn();}
}
test('authority split reaches H3 reference prompt and URLs',()=>{
 const studio=new FakeStudio(),p={cast:[],place:{}},shot={id:'s',action:'Create one new adjacent angle.',cast:[],extraReferences:[{assetId:'img',role:'authoritative current visible appearance; appearance wins conflicts'},{assetId:'vid',role:'prior visual motion and temporal continuity only'}],generation:{model:'h3-max',mode:'reference-to-video',duration:5,resolution:'480P',promptExpansionMode:'balanced',aspectRatio:'16:9'}};
 const snap=h3Snapshot(studio,p,shot),job={snapshot:{...snap,shot,style:'Respect reference authority.',cast:[]}},input=h3Input(job,id=>'u:'+id);
 assert.deepEqual(input.reference_image_urls,['u:img']);assert.deepEqual(input.reference_video_urls,['u:vid']);assert.match(input.prompt,/appearance wins conflicts/);assert.match(input.prompt,/No non-diegetic music/);
});
test('Ref2V quote separates output from conservative variable reference reserve',async()=>{
 const job={id:'j',projectId:'prod',state:'prepared',snapshot:{workflow:'minimax/h3-max/reference-to-video',references:[video],bindings:[{assetId:'vid',role:'motion-time'}],shot:{generation:{mode:'reference-to-video',duration:5,resolution:'480P'}}}};
 const studio=new FakeStudio(job),renderer=new FalRenderer(studio,{key:'test',probe:async()=>({decoded:true,kind:'video',duration:5})});
 renderer.request=async()=>({data:{prices:[{endpoint_id:'minimax/h3-max/reference-to-video',currency:'USD',unit:'seconds',unit_price:.05}]},units:null});
 const prepared=await renderer.prepare('j');assert.equal(prepared.quote.outputUsd,.25);assert.ok(prepared.quote.referenceInputUsd>0);assert.equal(prepared.quote.variableReferenceCost,true);assert.equal(prepared.quote.validatedLiveOn,'2026-09-12');assert.match(prepared.quote.referenceCostBasis,/provider billable units/);
});
