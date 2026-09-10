import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Studio} from '../src/store.mjs';
import {createServer} from '../src/server.mjs';

function fixture(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-timeline-'));
  const studio=new Studio(root);
  t.after(()=>{studio.close();fs.rmSync(root,{recursive:true,force:true});});
  const ref=studio.importAsset(Buffer.from('89504e470d0a1a0a00','hex'));
  const p=studio.createProduction({title:'One minute',shots:[0,1,2,3].map(i=>({id:'s'+i,title:'Camera '+i,reference:ref.id,action:'move',frames:360,fps:24,width:64,height:48}))});
  const jobs=p.shots.map((s,i)=>{
    const job=studio.prepareJob(p.id,s.id,s.id);
    const a=studio.importAsset(Buffer.concat([Buffer.from('0000001866747970','hex'),Buffer.from([i])]));
    studio.updateJob(job.id,{state:'ready',output:a.id,media:{frames:360,fps:24,width:64,height:48,audioStreams:1}});
    studio.selectTake(p.id,studio.getProduction(p.id).revision,s.id,job.id);return job;
  });
  return {studio,p,jobs,root};
}

// Catches appending coverage, replaying continuation from frame zero, and resetting its audio.
test('replacement coverage preserves one minute and resumes the underlying source at scene second 17',t=>{
  const {studio,p,jobs}=fixture(t);
  assert.equal(typeof studio.getTimeline,'function','studio needs a persisted editing timeline');
  const before=studio.getTimeline(p.id);
  const edited={...before.timeline,coverage:[{id:'reaction',jobId:jobs[2].id,at:336,sourceIn:24,sourceOut:96}]};
  const saved=studio.saveTimeline(p.id,0,edited);
  const cut=studio.buildCutPlan(p.id);
  assert.equal(cut.frames,1440);
  assert.deepEqual(cut.videoSegments.slice(0,3).map(s=>[s.jobId,s.at,s.sourceIn,s.sourceOut]),[
    [jobs[0].id,0,0,336],[jobs[2].id,336,24,96],[jobs[1].id,408,48,360]
  ]);
  assert.deepEqual(cut.audioSegments.map(s=>[s.at,s.sourceIn,s.sourceOut]),[[0,0,360],[360,0,360],[720,0,360],[1080,0,360]]);
  assert.equal(saved.revision,1);assert.equal(studio.listJobs().length,4);
  assert.throws(()=>studio.saveTimeline(p.id,0,edited),/revision_conflict/);
  const reopened=new Studio(studio.root);assert.deepEqual(reopened.getTimeline(p.id).timeline,edited);reopened.close();
  const undo=studio.undoTimeline(p.id,1);assert.equal(undo.timeline.coverage.length,0);
  assert.equal(studio.redoTimeline(p.id,2).timeline.coverage.length,1);
});

test('invalid source ranges and ambiguous overlapping coverage leave the saved edit intact',t=>{
  const {studio,p,jobs}=fixture(t);
  assert.equal(typeof studio.getTimeline,'function');
  const initial=studio.getTimeline(p.id).timeline;
  for(const coverage of [
    [{id:'a',jobId:jobs[0].id,at:0,sourceIn:0,sourceOut:361}],
    [{id:'a',jobId:jobs[0].id,at:1430,sourceIn:0,sourceOut:24}],
    [{id:'a',jobId:jobs[0].id,at:0,sourceIn:0.5,sourceOut:24}],
    [{id:'a',jobId:jobs[0].id,at:0,sourceIn:0,sourceOut:24},{id:'b',jobId:jobs[1].id,at:12,sourceIn:0,sourceOut:24}],
  ])assert.throws(()=>studio.saveTimeline(p.id,0,{...initial,coverage}),/timeline_/);
  assert.equal(studio.getTimeline(p.id).revision,0);
});

test('HTTP editor saves and exports the same ranges without invoking generation',async t=>{
  const {studio,p}=fixture(t);
  const server=createServer({studio,renderer:{submit(){assert.fail('editing must not generate');}}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}/api/productions/${p.id}/timeline`;
  let r=await fetch(url);assert.equal(r.status,200);
  const initial=await r.json();initial.timeline.main[0].sourceIn=24;
  r=await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({baseRevision:0,timeline:initial.timeline})});
  assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.plan.frames,1416);
  assert.equal(saved.plan.videoSegments[1].at,336);
  const manifest=studio.exportProduction(p.id);assert.equal(manifest.timeline.revision,1);
});
