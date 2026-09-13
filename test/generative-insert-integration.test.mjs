/** Actual Studio, reference rendering, H3 adapter, file download and application.
 * Only the remote provider is replaced by a loopback HTTP fixture. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Studio} from '../src/store.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {importMediaFile,runMedia,getMediaProfile} from '../src/media-io.mjs';
import {FalRenderer} from '../src/fal-renderer.mjs';
import {planGenerativeInsert,quoteGenerativeInsert,submitGenerativeInsert,reconcileGenerativeInsert} from '../src/generative-inserts.mjs';
import {applyGeneratedInsert} from '../src/generative-insert-apply.mjs';
import {getTakeStack} from '../src/production-memory.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';

test('real media travels through plan, quote, H3 receipt, take stack and explicit insert without changing the master',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-insert-real-')),studio=new Studio(path.join(root,'studio'));let upstream;
 try{
  const source=path.join(root,'source.mp4'),output=path.join(root,'result.mp4'),song=path.join(root,'song.wav');
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=854x480:r=24:d=5','-c:v','libx264','-threads','1',source]);
  await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=854x480:r=24:d=5','-f','lavfi','-i','sine=f=440:r=48000:d=5','-c:v','libx264','-c:a','aac','-threads','1',output]);
  await fs.writeFile(song,pcm24(192000,(i,c)=>(i%49-c)*100));
  const video=await importMediaFile(studio,source),master=await importMediaFile(studio,song),resultBytes=await fs.readFile(output);
  const {production,timeline}=createMediaProduction(studio,{title:'Full insert integration',fps:'24',width:854,height:480});
  const edit={...timeline.timeline,clips:[{id:'a',assetId:video.id,sourceStart:'0',frames:48,fit:'contain'},{id:'b',assetId:video.id,sourceStart:'2',frames:48,fit:'contain'}],soundtrack:{assetId:master.id,tailPolicy:'pad-silence'},markers:[{id:'cue',frame:48,label:'Song cue',kind:'cue'}]};
  const saved=studio.saveTimeline(production.id,timeline.revision,edit),submitted=[];let base;
  upstream=http.createServer(async(req,res)=>{
   const u=new URL(req.url,base);res.setHeader('content-type','application/json');
   if(u.pathname==='/pricing')return res.end(JSON.stringify({prices:[{endpoint_id:u.searchParams.get('endpoint_id'),unit_price:.0125,unit:'seconds',currency:'USD'}]}));
   if(req.method==='POST'){const chunks=[];for await(const b of req)chunks.push(b);submitted.push(JSON.parse(Buffer.concat(chunks)));return res.end(JSON.stringify({request_id:'fixture_'+submitted.length,status_url:base+'/status',response_url:base+'/result'}));}
   if(u.pathname==='/status')return res.end('{"status":"COMPLETED"}');
   if(u.pathname==='/result'){res.setHeader('x-fal-billable-units','5');return res.end(JSON.stringify({video:{url:base+'/video'},expanded_prompt:'Fixture expansion, no independent continuity claim'}));}
   if(u.pathname==='/video'){res.setHeader('content-type','video/mp4');return res.end(resultBytes);}
   res.writeHead(404).end('{}');
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+upstream.address().port;
  const fal=new FalRenderer(studio,{key:'offline-fixture',queueBase:base,pricingBase:base+'/pricing'});
  const request=kind=>({requestKey:'real_'+kind,baseRevision:saved.revision,clipId:'a',kind,prompt:'Preserve the ongoing action.',duration:5,resolution:'480P',quality:'balanced',maxUsd:.5,acknowledgeUnmanagedColor:true});
  async function ready(kind){
   let record=await planGenerativeInsert(studio,production.id,request(kind));assert.equal(submitted.length,kind==='alternate'?0:1);
   for(const r of record.references){assert.equal(getMediaProfile(studio,r.assetId).kind,r.kind);studio.verifyAsset(r.assetId);}
   record=await quoteGenerativeInsert(studio,production.id,record.id,{baseRevision:record.revision},{fal});assert.equal(record.state,'quoted');assert.equal(record.quote.reservedUsd,.063);
   await assert.rejects(submitGenerativeInsert(studio,production.id,record.id,{baseRevision:record.revision},{fal}),/authorization/);
   record=await submitGenerativeInsert(studio,production.id,record.id,{baseRevision:record.revision,authorize:true,acceptDisclosure:true,acceptedReservedUsd:.063},{fal});assert.equal(record.state,'rendering');
   record=await reconcileGenerativeInsert(studio,production.id,record.id,{baseRevision:record.revision},{fal});
   assert.equal(record.providerEvidence.actualUsd,.0625);assert.equal(record.audioHandling.generatedAudioStreams,1);assert.equal(record.audioHandling.masterChanged,false);
   return record;
  }
  const alternate=await ready('alternate');assert.equal(alternate.state,'ready-candidate');assert.ok(getTakeStack(studio,production.id,'a').candidates.some(c=>c.insertId===alternate.id));assert.deepEqual(studio.getTimeline(production.id).timeline,edit);
  const continuation=await ready('continue');assert.equal(continuation.state,'ready-insert');assert.equal(studio.getTimeline(production.id).plan.frames,96);
  const applied=await applyGeneratedInsert(studio,production.id,continuation.id,{baseRevision:continuation.revision,timelineRevision:saved.revision});
  assert.equal(applied.timeline.plan.frames,216);assert.equal(applied.timeline.timeline.clips[1].assetId,continuation.outputAssetId);
  assert.deepEqual(applied.timeline.timeline.soundtrack,edit.soundtrack);assert.deepEqual(applied.timeline.timeline.markers,edit.markers);
  assert.equal(submitted.length,2);assert.ok(submitted.every(input=>input.image_url?.startsWith('data:image/png;base64,')));
  assert.deepEqual(await fs.readFile(studio.assetPath(master.id)),await fs.readFile(song));
 }finally{if(upstream)await new Promise(r=>upstream.close(r));studio.close();await fs.rm(root,{recursive:true,force:true});}
});
