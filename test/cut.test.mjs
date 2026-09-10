import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {Studio} from '../src/store.mjs';import {exportCut} from '../src/cut.mjs';
const python=process.env.SHUTTER_PROBE_PYTHON||'D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe';

test('actual export selects coverage frames and resumes elapsed main footage while retaining main audio',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-coverage-'));
 execFileSync(python,['-s','test/timeline_media.py',root],{windowsHide:true});
 const studio=new Studio(root);t.after(()=>{studio.close();fs.rmSync(root,{recursive:true,force:true});});
 const ref=studio.importAsset(fs.readFileSync(path.join(root,'still.png')));
 const p=studio.createProduction({title:'Coverage',shots:[0,1,2].map(i=>({id:'s'+i,title:'take '+i,reference:ref.id,action:'move',frames:24,fps:24,width:64,height:48}))});
 const jobs=p.shots.map((s,i)=>{const j=studio.prepareJob(p.id,s.id,s.id),a=studio.importAsset(fs.readFileSync(path.join(root,i+'.mp4')));studio.updateJob(j.id,{state:'ready',output:a.id,media:{frames:24,fps:24,width:64,height:48,audioStreams:i===1?0:1}});studio.selectTake(p.id,studio.getProduction(p.id).revision,s.id,j.id);return j;});
 const edit=studio.getTimeline(p.id).timeline;edit.coverage=[{id:'reaction',jobId:jobs[2].id,at:18,sourceIn:6,sourceOut:18}];studio.saveTimeline(p.id,0,edit);
 const cut=await exportCut(studio,p.id);
 const result=JSON.parse(execFileSync(python,['-s','test/timeline_media.py','inspect',studio.assetPath(cut.output)],{encoding:'utf8',windowsHide:true}));
 assert.equal(result.frames,72);
 const expected=[[111,0,0],[0,0,78],[0,0,111],[0,78,0]];
 for(let i=0;i<4;i++)for(let c=0;c<3;c++)assert.ok(Math.abs(result.pixels[i][c]-expected[i][c])<7,`frame ${[17,18,29,30][i]} channel ${c}: ${result.pixels[i]}`);
 assert.ok(result.rms[0]>.1);assert.ok(result.rms[1]<.005);assert.ok(result.rms[2]>.1);
 assert.equal((await exportCut(studio,p.id)).id,cut.id);
});
test('the actual cut exporter fits unequal canvases and keeps sound on both sides of a silent shot',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shutter-cut-'));
 execFileSync(python,['-s','test/media_fixture.py',root],{windowsHide:true});
 const studio=new Studio(root);t.after(()=>{studio.close();fs.rmSync(root,{recursive:true,force:true});});const image=studio.importAsset(fs.readFileSync(path.join(root,'still.png')));
 const p=studio.createProduction({title:'Sound continuity',shots:['first','silent','last'].map(id=>({id,title:id,action:'hold',reference:image.id,cast:[],fps:24,frames:24,width:64,height:48}))});
 for(const [index,shot]of p.shots.entries()){
  const job=studio.prepareJob(p.id,shot.id,shot.id),asset=studio.importAsset(fs.readFileSync(path.join(root,shot.id+'.mp4')));
  studio.updateJob(job.id,{state:'ready',output:asset.id,media:{width:index===1?48:64,height:48,fps:24,frames:24,audioStreams:index===1?0:1}});
  studio.selectTake(p.id,studio.getProduction(p.id).revision,shot.id,job.id);
 }
 const cut=await exportCut(studio,p.id);assert.equal(cut.media.frames,72);assert.equal(cut.media.width,64);assert.equal(cut.media.height,48);assert.equal(cut.media.audioStreams,1);
 const inspection=JSON.parse(execFileSync(python,['-s','test/media_fixture.py','inspect',studio.assetPath(cut.output)],{encoding:'utf8',windowsHide:true}));
 assert.ok(inspection.rms[0]>.1);assert.ok(inspection.rms[1]<.005);assert.ok(inspection.rms[2]>.1);assert.ok(Math.abs(inspection.duration-3)<.04);
 assert.ok(inspection.middleEdge<5);assert.ok(inspection.middleCenter>80);
 assert.equal((await exportCut(studio,p.id)).id,cut.id);
});
