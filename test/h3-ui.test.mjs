import test from 'node:test';import assert from 'node:assert/strict';
import {createH3UI} from '../public/h3-ui.js';

test('saving a shot retains text-only character condition in the generation prompt',async t=>{
 // DOM input values at the UI boundary; no network or renderer is involved.
 const values={'generation-mode':'image-to-video','h3-duration':'5','h3-resolution':'480P','h3-aspect':'16:9','before-state':'Sol holds sphere','after-state':'Sol retains sphere','shot-sound':'Quiet hum','ending-reference':'','location-reference':'','location-name':'','state-sol':'','note-sol':'Dry coat; holds the sphere in both hands','extra-image':'','extra-video':'','extra-audio':''};
 const previous=globalThis.document;t.after(()=>{globalThis.document=previous;});
 globalThis.document={getElementById:id=>({value:values[id]}),querySelectorAll:()=>[{value:'sol'}]};
 const ui=createH3UI({});const saved=ui.values({cast:[{id:'sol'}]});
 assert.deepEqual(saved.characterStates,[{castId:'sol',reference:null,description:'Dry coat; holds the sphere in both hands'}]);
 const {h3Input}=await import('../src/h3-spec.mjs');const input=h3Input({snapshot:{shot:saved,cast:[{id:'sol',name:'Sol'}],bindings:[],references:[],place:{}}},()=>{});
 assert.match(input.prompt,/Sol current condition: Dry coat; holds the sphere in both hands/);
});

test('shot settings preserve additional canvas references when editing the first input of a kind',t=>{
 const fields={'generation-mode':'reference-to-video','h3-duration':'5','h3-resolution':'480P','h3-aspect':'16:9','before-state':'','after-state':'','shot-sound':'','ending-reference':'','location-reference':'','location-name':'','extra-image':'replacement','role-image':'New opening look','extra-video':'','extra-audio':''};
 const previous=globalThis.document;t.after(()=>{globalThis.document=previous;});
 globalThis.document={getElementById:id=>({value:fields[id]}),querySelectorAll:()=>[]};
 const ui=createH3UI({asset:()=>({kind:'image'})});
 const saved=ui.values({cast:[]},{extraReferences:[{assetId:'first',role:'First prop'},{assetId:'second',role:'Second prop'},{assetId:'third',role:'Third prop'}]});
 assert.deepEqual(saved.extraReferences,[{assetId:'replacement',role:'New opening look'},{assetId:'second',role:'Second prop'},{assetId:'third',role:'Third prop'}]);
});
