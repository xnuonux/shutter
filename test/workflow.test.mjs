import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Studio} from '../src/store.mjs';import {createServer} from '../src/server.mjs';
import {execFileSync} from 'node:child_process';
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-workflow-')),studio=new Studio(root);
 const image=studio.importAsset(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6VZkAAAAASUVORK5CYII=','base64'));
 const p=studio.createProduction({title:'Story',shots:['a','b'].map(id=>({id,title:id,action:'hold sphere',before:'Mira holds sphere',after:'Mira holds sphere',cast:[],reference:image.id,frames:24,fps:24,width:64,height:48}))});
 const jobs=p.shots.map(s=>{const j=studio.prepareJob(p.id,s.id,s.id);return studio.updateJob(j.id,{state:'ready',output:image.id});});
 for(const j of jobs)studio.selectTake(p.id,studio.getProduction(p.id).revision,j.shotId,j.id);
 const server=createServer({studio,renderer:{health:async()=>({online:false}),reconcile:async id=>studio.getJob(id)}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));studio.close();fs.rmSync(root,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;
 const overview=async()=>{const r=await fetch(base+'/api/productions/'+p.id+'/workflow');assert.equal(r.status,200);return r.json();};
 const decide=async(jobId,input)=>fetch(base+'/api/jobs/'+jobId+'/decision',{method:'POST',body:JSON.stringify(input)});
 return {studio,p,jobs,overview,decide,base,root};
}
test('HTTP review separates cut selection from acceptance and invalidates a changed previous ending',async t=>{
 const f=await fixture(t);let w=await f.overview();assert.equal(w.shots[1].decision,'candidate');
 let r=await f.decide(f.jobs[1].id,{baseRevision:w.revision,contextHash:w.shots[1].contextHash,decision:'accepted',note:'Reviewed this cut'});assert.equal(r.status,200);
 w=await f.overview();assert.equal(w.shots[1].decision,'accepted');
 let p=f.studio.getProduction(f.p.id);f.studio.saveProduction(p.id,p.revision,{...p,shots:p.shots.map((s,i)=>i===0?{...s,after:'Sol now holds sphere'}:s)});
 w=await f.overview();assert.equal(w.shots[1].decision,'review_again');assert.equal(f.studio.getJob(f.jobs[1].id).decisions.length,1);
});
test('a stale review cannot accept a newer context and revision needs a concrete note',async t=>{
 const f=await fixture(t),w=await f.overview();let p=f.studio.getProduction(f.p.id);f.studio.saveProduction(p.id,p.revision,{...p,shots:p.shots.map(s=>({...s,before:'changed'}))});
 let r=await f.decide(f.jobs[1].id,{baseRevision:p.revision+1,contextHash:w.shots[1].contextHash,decision:'accepted'});assert.equal(r.status,409);
 const current=await f.overview();r=await f.decide(f.jobs[1].id,{baseRevision:current.revision,contextHash:current.shots[1].contextHash,decision:'needs_revision',note:''});assert.equal(r.status,400);
 r=await f.decide(f.jobs[1].id,{baseRevision:current.revision,contextHash:current.shots[1].contextHash,decision:'needs_revision',note:'Keep sleeves rolled'});assert.equal(r.status,200);
 assert.equal((await f.overview()).shots[1].decision,'needs_revision');assert.equal(f.studio.getProduction(f.p.id).shots[0].selectedTake,f.jobs[0].id);
});
test('an unrelated title edit keeps a valid acceptance and a new previous take requires review',async t=>{
 const f=await fixture(t);let w=await f.overview();await f.decide(f.jobs[1].id,{baseRevision:w.revision,contextHash:w.shots[1].contextHash,decision:'accepted'});
 let p=f.studio.getProduction(f.p.id);f.studio.saveProduction(p.id,p.revision,{...p,title:'Retitled'});assert.equal((await f.overview()).shots[1].decision,'accepted');
 const j=f.studio.prepareJob(p.id,'a','new-a');f.studio.updateJob(j.id,{state:'ready',output:f.jobs[0].output});f.studio.selectTake(p.id,f.studio.getProduction(p.id).revision,'a',j.id);
 assert.equal((await f.overview()).shots[1].decision,'review_again');
});
test('HTTP comparison extracts and caches real beginning and ending frames from the saved take',async t=>{
 const f=await fixture(t);execFileSync(process.env.SHUTTER_PROBE_PYTHON||'D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe',['-s','test/media_fixture.py',f.root],{windowsHide:true});
 const a=f.studio.importAsset(fs.readFileSync(path.join(f.root,'first.mp4')));f.studio.updateJob(f.jobs[0].id,{output:a.id});
 const url=f.base+'/api/jobs/'+f.jobs[0].id+'/frames';const r=await fetch(url);assert.equal(r.status,200);const frames=await r.json();
 assert.equal(frames.sourceDigest,a.sha256);assert.equal(frames.frameCount,24);assert.equal(f.studio.verifyAsset(frames.first).kind,'image');assert.equal(f.studio.verifyAsset(frames.last).kind,'image');
 assert.deepEqual(await (await fetch(url)).json(),frames);
 assert.ok(f.studio.exportProduction(f.p.id).assets.some(a=>a.id===frames.last));
});
test('changing sound or dialogue invalidates an acceptance of the previous shot brief',async t=>{
 const f=await fixture(t),w=await f.overview();await f.decide(f.jobs[1].id,{baseRevision:w.revision,contextHash:w.shots[1].contextHash,decision:'accepted'});
 const p=f.studio.getProduction(f.p.id);f.studio.saveProduction(p.id,p.revision,{...p,shots:p.shots.map((s,i)=>i===1?{...s,sound:'Sol speaks a new line'}:s)});
 assert.equal((await f.overview()).shots[1].decision,'review_again');
});
test('continue shot uses actual selected video ending and frozen story state without preparing a paid job',async t=>{
 const f=await fixture(t);execFileSync(process.env.SHUTTER_PROBE_PYTHON||'D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe',['-s','test/media_fixture.py',f.root],{windowsHide:true});
 const a=f.studio.importAsset(fs.readFileSync(path.join(f.root,'first.mp4')));f.studio.updateJob(f.jobs[0].id,{output:a.id});
 let p=f.studio.getProduction(f.p.id);p=f.studio.saveProduction(p.id,p.revision,{...p,shots:p.shots.map((s,i)=>i===0?{...s,after:'UNRENDERED EDIT: Sol holds sphere',endReference:s.reference}:s)});
 const url=f.base+'/api/productions/'+p.id+'/continue-shot';
 const input={baseRevision:p.revision,sourceJobId:f.jobs[0].id,title:'The exchange',action:'Mira passes the sphere to Sol',after:'Sol holds sphere',camera:'Locked two-shot',composition:'continue'};
 let r=await fetch(url,{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,201);
 const result=await r.json(),next=result.production.shots[1],frames=f.studio.getJob(f.jobs[0].id).reviewFrames;
 assert.equal(next.before,'Mira holds sphere');assert.equal(next.after,'Sol holds sphere');assert.equal(next.reference,frames.last);
 assert.equal(next.continuitySource.output,a.id);assert.equal(next.continuitySource.jobId,f.jobs[0].id);
 assert.equal(next.endReference,null);assert.equal(next.selectedTake,null);assert.equal(next.generation.mode,'image-to-video');
 assert.equal(result.production.shots[0].selectedTake,f.jobs[0].id);assert.equal(result.production.shots[2].id,'b');assert.equal(f.studio.listJobs().length,2);
 const prepared=f.studio.prepareJob(p.id,next.id,'continuation-snapshot');assert.equal(prepared.snapshot.bindings[0].assetId,frames.last);assert.match(prepared.snapshot.shot.action,/passes/);
 r=await fetch(url,{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,409);assert.equal(f.studio.getProduction(p.id).shots.length,3);
 r=await fetch(url,{method:'POST',body:JSON.stringify({...input,baseRevision:result.production.revision,composition:'new',reference:f.jobs[0].snapshot.shot.reference})});assert.equal(r.status,201);
 const composed=(await r.json()).production.shots[1];assert.equal(composed.reference,f.jobs[0].snapshot.shot.reference);assert.notEqual(composed.reference,frames.last);assert.equal(composed.continuitySource.frame,frames.last);
});
test('new camera continuation requires an image and rejects an unselected or foreign source take',async t=>{
 const f=await fixture(t),p=f.studio.getProduction(f.p.id),url=f.base+'/api/productions/'+p.id+'/continue-shot';
 const input={baseRevision:p.revision,sourceJobId:f.jobs[0].id,title:'Next',action:'Look up',after:'Still holding',camera:'Close-up',composition:'new'};
 let r=await fetch(url,{method:'POST',body:JSON.stringify(input)});assert.equal(r.status,400);assert.equal((await r.json()).error,'composition_image_required');
 const j=f.studio.prepareJob(p.id,'a','unselected');f.studio.updateJob(j.id,{state:'ready',output:f.jobs[0].output});
 r=await fetch(url,{method:'POST',body:JSON.stringify({...input,composition:'continue',sourceJobId:j.id})});assert.equal(r.status,400);assert.equal((await r.json()).error,'selected_source_required');
 assert.equal(f.studio.getProduction(p.id).shots.length,2);
});
