import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Studio} from '../src/store.mjs';
import {Renderer} from '../src/renderer.mjs';
import {createServer} from '../src/server.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZkAAAAASUVORK5CYII=','base64');
function fixture(t,mode='reference-to-video') {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-h3-'));const studio=new Studio(root);
 t.after(()=>{studio.close();fs.rmSync(root,{recursive:true,force:true});});
 const original=studio.importAsset(png), current=studio.importAsset(Buffer.concat([png,Buffer.from('state')]));
 const production=studio.createProduction({title:'Continuity',style:'painted animation',cast:[{id:'mira',name:'Mira',reference:original.id}],place:{name:'observatory',reference:original.id},shots:[{id:'ridge',title:'Ridge',action:'Mira shields the sphere',before:'Mira holds one sphere',after:'Mira still holds it',camera:'medium reverse',reference:current.id,cast:['mira'],characterStates:[{castId:'mira',reference:current.id,description:'wet orange coat'}],location:{name:'ridge',reference:current.id},generation:{model:'h3-max',mode,resolution:'480P',duration:5,aspectRatio:'16:9'},frames:120,fps:24,width:848,height:480,seed:1}]});
 return {studio,production,original,current};
}
test('prepared H3 references bind current costume and shot location without overwriting original identity',t=>{
 const {studio,production,original,current}=fixture(t);const job=studio.prepareJob(production.id,'ridge','state');
 assert.equal(job.snapshot.workflow,'minimax/h3-max/reference-to-video');
 assert.equal(job.snapshot.cast[0].reference,original.id);
 assert.equal(job.snapshot.shot.characterStates[0].reference,current.id);
 assert.equal(job.snapshot.place.name,'ridge');
 assert.ok(job.snapshot.bindings.some(b=>b.assetId===current.id&&b.role.includes('wet orange coat')));
 studio.saveProduction(production.id,1,{...production,shots:[{...production.shots[0],characterStates:[]}]});
 assert.equal(studio.getJob(job.id).snapshot.shot.characterStates[0].description,'wet orange coat');
});
test('text generation needs no image and invalid reference roles or timing cannot silently change the route',t=>{
 const {studio,production}=fixture(t,'text-to-video');let shot={...production.shots[0],reference:null,cast:[],characterStates:[],location:{}};
 studio.saveProduction(production.id,1,{...production,shots:[shot]});
 assert.equal(studio.prepareJob(production.id,'ridge','text').snapshot.workflow,'minimax/h3-max/text-to-video');
 assert.throws(()=>studio.saveProduction(production.id,2,{...production,shots:[{...shot,generation:{...shot.generation,duration:4}}]}),/h3_duration/);
 assert.throws(()=>studio.saveProduction(production.id,2,{...production,shots:[{...shot,characterStates:[{castId:'missing',reference:production.shots[0].reference}]}]}),/character_state/);
});
async function serverFixture(t,{lost=false,price=.0125,caps,mediaOverride={}}={}) {
 const f=fixture(t,'image-to-video');const submitted=[];let base;
 const upstream=http.createServer(async(req,res)=>{const chunks=[];for await(const c of req)chunks.push(c);res.setHeader('content-type','application/json');
 if(req.url.startsWith('/pricing'))return res.end(JSON.stringify({prices:[{endpoint_id:'minimax/h3-max/image-to-video',unit_price:price,unit:'seconds',currency:'USD'}]}));
 if(req.method==='POST'){submitted.push(JSON.parse(Buffer.concat(chunks)));if(lost)return res.destroy();return res.end(JSON.stringify({request_id:'req-one',status_url:base+'/status',response_url:base+'/result'}));}
 if(req.url==='/status')return res.end('{"status":"COMPLETED"}');
 if(req.url==='/result'){res.setHeader('x-fal-billable-units','5');return res.end(JSON.stringify({video:{url:base+'/video'},expanded_prompt:'expanded'}));}
 if(req.url==='/video')return res.end(Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]));
 res.statusCode=404;res.end('{}');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+upstream.address().port;
 const renderer=new Renderer(f.studio,{fal:{key:'test-key',queueBase:base,pricingBase:base+'/pricing',caps,probe:async file=>file.endsWith('.mp4')?{kind:'video',decoded:true,width:848,height:480,frames:120,fps:24,duration:5,audioStreams:1,...mediaOverride}:{kind:'image',width:1024,height:1024,decoded:true}}});
 const server=createServer({studio:f.studio,renderer});await new Promise(r=>server.listen(0,'127.0.0.1',r));const app='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await new Promise(r=>upstream.close(r));});
 const prepare=async key=>{const res=await fetch(app+'/api/jobs',{method:'POST',body:JSON.stringify({projectId:f.production.id,shotId:'ridge',requestKey:key})});assert.equal(res.status,201);return res.json();};
 return {...f,renderer,submitted,app,prepare};
}
test('real app prepares paid quote, submits exact image once, reconciles receipt and exposes a decoded take',async t=>{
 const f=await serverFixture(t);const job=await f.prepare('paid');assert.equal(job.quote.reservedUsd,.063);
 const run=await fetch(f.app+'/api/jobs/'+job.id+'/run',{method:'POST'});assert.equal(run.status,200);
 await f.renderer.submit(job.id);assert.equal(f.submitted.length,1);assert.ok(f.submitted[0].image_url.startsWith('data:image/png;base64,'));assert.equal(f.submitted[0].reference_image_urls,undefined);
 const result=await f.renderer.reconcile(job.id);assert.equal(result.state,'ready');assert.equal(result.media.audioStreams,1);assert.equal(result.charge.actualUsd,.0625);
 const balance=(await f.renderer.health()).fal.budget;assert.equal(balance.imageReference.spent,.0625);assert.equal(balance.text.spent,0);
});
test('uncertain paid submission retains its budget reservation and refuses another charge',async t=>{
 const f=await serverFixture(t,{lost:true});const job=await f.prepare('lost');await assert.rejects(f.renderer.submit(job.id));
 assert.equal(f.studio.getJob(job.id).state,'unknown');await assert.rejects(f.renderer.submit(job.id),/submission_unknown/);assert.equal(f.submitted.length,1);
 assert.equal((await f.renderer.health()).fal.budget.imageReference.reserved,.063);
});
test('paid pool ceiling is enforced before contacting the generation endpoint',async t=>{
 const f=await serverFixture(t,{caps:{text:1,imageReference:.06}});const job=await f.prepare('cap');await assert.rejects(f.renderer.submit(job.id),/budget_exceeded/);assert.equal(f.submitted.length,0);assert.equal(f.studio.getJob(job.id).state,'prepared');
});
test('unprepared scene state assets survive the production export',t=>{
 const {studio,production}=fixture(t);
 const unique=studio.importAsset(Buffer.concat([png,Buffer.from('unprepared-look')]));
 studio.saveProduction(production.id,1,{...production,shots:[{...production.shots[0],characterStates:[{castId:'mira',reference:unique.id,description:'later costume'}]}]});
 assert.ok(studio.exportProduction(production.id).assets.some(a=>a.id===unique.id));
});
test('a named new location without a reference must not inherit the old set image',t=>{
 const {studio,production,original}=fixture(t);studio.saveProduction(production.id,1,{...production,shots:[{...production.shots[0],reference:null,location:{name:'ridge'},characterStates:[]}]});
 const job=studio.prepareJob(production.id,'ridge','new-location');assert.equal(job.snapshot.place.name,'ridge');assert.equal(job.snapshot.bindings.some(b=>b.role.includes('location observatory')),false);
});
test('observed H3 frame padding is preserved and reported, not billed as a second generation',async t=>{
 const f=await serverFixture(t,{mediaOverride:{width:832,frames:124,duration:124/24}});const job=await f.prepare('padding');await f.renderer.submit(job.id);const result=await f.renderer.reconcile(job.id);
 assert.equal(result.state,'ready');assert.equal(result.media.frames,124);assert.equal(result.timingDifferenceSeconds,.166667);assert.equal(f.submitted.length,1);
});
test('reference quote pools decoded image, video and audio tokens using output resolution',async t=>{
 const {studio,production}=fixture(t);
 const video=studio.importAsset(Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]));
 const audio=studio.importAsset(Buffer.from('RIFF0000WAVEdata'));
 studio.saveProduction(production.id,1,{...production,shots:[{...production.shots[0],extraReferences:[{assetId:video.id,role:'motion only'},{assetId:audio.id,role:'voice only'}]}]});
 const renderer=new Renderer(studio,{fal:{key:'offline-test-key',probe:async file=>file.endsWith('.mp4')?{kind:'video',duration:2,width:256,height:144,decoded:true}:file.endsWith('.wav')?{kind:'audio',duration:5,decoded:true}:{kind:'image',width:1024,height:1024,decoded:true}}});
 renderer.fal.request=async()=>({data:{prices:[{endpoint_id:'minimax/h3-max/reference-to-video',unit_price:.05,unit:'seconds',currency:'USD'}]},units:null});
 const job=studio.prepareJob(production.id,'ridge','pooled');const quoted=await renderer.fal.prepare(job.id);
 assert.equal(quoted.quote.referenceTokens,8220);assert.equal(quoted.quote.estimatedUsd,.33248);assert.equal(quoted.quote.reservedUsd,.333);
});
test('a decoded but invalid take stops polling while retaining its known charge',async t=>{
 const f=await serverFixture(t,{mediaOverride:{duration:9}});const job=await f.prepare('bad-profile');await f.renderer.submit(job.id);
 const result=await f.renderer.reconcile(job.id);assert.equal(result.state,'failed');assert.equal(result.error,'video_profile_mismatch');assert.equal(result.charge.actualUsd,.0625);
 assert.ok(result.failedCandidate);assert.deepEqual(await f.renderer.reconcile(job.id),result);assert.equal(f.submitted.length,1);
});
