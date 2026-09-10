import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Studio} from '../src/store.mjs';
import {createServer} from '../src/server.mjs';
import {getCanvas,saveCanvas,connectReference} from '../src/canvas.mjs';

function fixture(t,mode='reference-to-video') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-canvas-'));
  const studio=new Studio(root);
  t.after(()=>{studio.close();fs.rmSync(root,{recursive:true,force:true});});
  const image=studio.importAsset(Buffer.from('89504e470d0a1a0a00','hex'));
  const audio=studio.importAsset(Buffer.from('ID3sound'));
  const video=studio.importAsset(Buffer.from('000000186674797000','hex'));
  const p=studio.createProduction({title:'Canvas',shots:[{id:'one',title:'One',action:'Move the lamp',reference:image.id,frames:120,fps:24,generation:{model:'h3-max',mode,duration:5,resolution:'480P'}}]});
  return {studio,root,p,image,audio,video};
}

test('canvas connection changes the actual next snapshot, preserves prior footage and does not submit',async t=>{
  const {studio,p,audio}=fixture(t);
  const before=studio.prepareJob(p.id,'one','before');
  const server=createServer({studio,renderer:{submit(){assert.fail('canvas must not submit');}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}/api/productions/${p.id}`;
  let response=await fetch(url+'/connections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:1,shotId:'one',assetId:audio.id,role:'reference',description:'Rain sound reference'})});
  assert.equal(response.status,200);assert.equal(studio.listJobs().length,1);
  const next=studio.prepareJob(p.id,'one','after');
  assert(next.snapshot.bindings.some(b=>b.assetId===audio.id&&b.role==='Rain sound reference'));
  assert.deepEqual(studio.getJob(before.id).snapshot,before.snapshot);
  response=await fetch(url+'/canvas');const canvas=await response.json();
  assert.equal(response.status,200);assert(canvas.shots[0].bindings.some(b=>b.assetId===audio.id));
  const stale=await fetch(url+'/connections',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:1,shotId:'one',assetId:audio.id,role:'reference',remove:true})});
  assert.equal(stale.status,409);assert.equal(studio.getProduction(p.id).revision,2);
  connectReference(studio,p.id,{baseRevision:2,shotId:'one',assetId:audio.id,role:'reference',remove:true});
  assert.equal(getCanvas(studio,p.id).shots[0].bindings.length,1);
});

test('canvas rejects incompatible inputs without altering production',t=>{
  const {studio,p,video}=fixture(t,'image-to-video');
  for(const role of ['opening','reference','imaginary'])assert.throws(()=>connectReference(studio,p.id,{baseRevision:1,shotId:'one',assetId:video.id,role}),/image_required|canvas_role/);
  assert.equal(studio.getProduction(p.id).revision,1);
  assert.equal(studio.listJobs().length,0);
});

test('canvas layout persists with independent revision checks and finite bounded coordinates',t=>{
  const {studio,root,p}=fixture(t);
  assert.equal(getCanvas(studio,p.id).revision,0);
  const positions={'shot_one':{x:422,y:115}};
  saveCanvas(studio,p.id,0,positions);
  assert.throws(()=>saveCanvas(studio,p.id,0,{}),/revision_conflict/);
  assert.throws(()=>saveCanvas(studio,p.id,1,{bad:{x:Infinity,y:0}}),/canvas_position/);
  const reopened=new Studio(root);assert.deepEqual(getCanvas(reopened,p.id).positions,positions);reopened.close();
  assert.equal(studio.getProduction(p.id).revision,1);
});
