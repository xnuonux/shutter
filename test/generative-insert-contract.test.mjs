import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInsertRequest,insertEdges,insertLanding,insertTargetSnapshot,insertDisclosure,adapterReadiness} from '../public/insert-contract.mjs';
const edit={format:'shutter-media-edit-v1',fps:'24000/1001',width:1920,height:1080,clips:[
 {id:'a',assetId:'asset_a',sourceStart:'1/2',frames:48,fit:'cover',sampling:{origin:'0/1',offsetFrames:12}},
 {id:'b',assetId:'asset_b',sourceStart:'0/1',frames:72,fit:'contain'}
]};
const request={requestKey:'insert_01',baseRevision:7,clipId:'a',kind:'bridge',prompt:'Dissolve naturally into the next shot.',duration:5,resolution:'768P',quality:'balanced',maxUsd:.75,acknowledgeUnmanagedColor:true};
test('normalization is strict and stable',()=>assert.deepEqual(normalizeInsertRequest(request),{schema:'shutter-generative-insert-v1',...request}));
test('unknown settings and implicit color consent fail',()=>{assert.throws(()=>normalizeInsertRequest({...request,secret:true}),/insert_request_invalid/);assert.throws(()=>normalizeInsertRequest({...request,acknowledgeUnmanagedColor:false}),/reference_color_review_required/);});
test('alternate uses first and last frame of one shot',()=>assert.deepEqual(insertEdges(edit,'a','alternate'),[{clipId:'a',edge:'start',role:'opening-frame'},{clipId:'a',edge:'end',role:'ending-frame'}]));
test('continue starts from the accepted ending frame',()=>assert.deepEqual(insertEdges(edit,'a','continue'),[{clipId:'a',edge:'end',role:'opening-frame'}]));
test('bridge is explicitly bounded by both adjacent shots',()=>assert.deepEqual(insertEdges(edit,'a','bridge'),[{clipId:'a',edge:'end',role:'opening-frame'},{clipId:'b',edge:'start',role:'ending-frame'}]));
test('bridge at the end is rejected rather than inventing a destination',()=>assert.throws(()=>insertEdges(edit,'b','bridge'),/insert_bridge_needs_next_shot/));
test('landing policy does not pretend continuation is a replacement take',()=>{assert.deepEqual(insertLanding(edit,'a','alternate'),{kind:'take-stack',clipId:'a'});assert.deepEqual(insertLanding(edit,'a','continue'),{kind:'insert-after',leftClipId:'a',rightClipId:'b'});assert.deepEqual(insertLanding(edit,'a','bridge'),{kind:'insert-between',leftClipId:'a',rightClipId:'b'});});
test('target snapshot carries only fields that affect the reviewed reference composition',()=>assert.deepEqual(insertTargetSnapshot(edit,'a','bridge'),{fps:'24000/1001',width:1920,height:1080,kind:'bridge',clipId:'a',clips:[{...edit.clips[0]},{...edit.clips[1],sampling:null}]}));
test('disclosure says exactly what a future paid submission would send',()=>assert.deepEqual(insertDisclosure(2),{leavesDeviceOnSubmission:['prompt','2 derived PNG reference images'],staysLocal:['camera originals','master soundtrack','sound lanes','finishing text','unselected library media'],providerContacted:false,submissionState:'not-submitted'}));
test('current image-to-video adapter contract carries 1080P and quality without submitting',()=>{assert.equal(adapterReadiness({...request,resolution:'1080P'}).adapterReady,true);assert.equal(adapterReadiness({...request,quality:'quality'}).adapterReady,true);assert.match(adapterReadiness(request).qualification,/no paid live render/);});
test('duration and hard spend limit are bounded',()=>{assert.throws(()=>normalizeInsertRequest({...request,duration:4}),/insert_duration/);assert.throws(()=>normalizeInsertRequest({...request,maxUsd:0}),/insert_spend_limit/);assert.throws(()=>normalizeInsertRequest({...request,maxUsd:101}),/insert_spend_limit/);});
