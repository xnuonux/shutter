import test from 'node:test';
import assert from 'node:assert/strict';
import {ACTIONS, ACTION_VERSION, COMMAND_SCHEMA, validateCommand, validateSchema} from '../public/action-contract.mjs';

test('catalog exposes every deterministic picture, sound, and text action', () => {
  assert.equal(ACTION_VERSION, 'shutter-actions-v1');
  assert.equal(ACTIONS.length, 31);
  assert.deepEqual(new Set(ACTIONS.map(a => a.type)).size, ACTIONS.length);
  for (const action of ACTIONS) {
    assert.equal(action.inputSchema.additionalProperties, false);
    assert.ok(action.description && action.examples.length);
    for (const example of action.examples) assert.deepEqual(validateCommand(example), example);
    assert.equal(Object.hasOwn(action.effects, 'examples'), false);
  }
});

test('replace sourceStart is optional and defaults to zero in the command contract', () => {
  assert.deepEqual(validateCommand({type:'replace',clipId:'clip_a',assetId:'asset_'+'a'.repeat(64)}).type, 'replace');
});

test('command validation rejects unknown and malformed nested fields', () => {
  assert.throws(() => validateCommand({type:'fit', clipId:'clip_a', fit:'cover', extra:true}), /action_arguments: arguments\.extra/);
  assert.throws(() => validateCommand({type:'sound-master', value:{mute:true, solo:false, nope:1}}), /action_arguments: arguments\.value\.nope/);
  assert.throws(() => validateCommand({type:'text-put', cue:{id:'c',kind:'caption',startFrame:0,endFrame:2,text:'x',bad:1}}), /action_arguments: arguments\.cue\.bad/);
  assert.throws(() => validateCommand({type:'split',clipId:'c',frame:1.5,newId:'r'}), /action_arguments: arguments\.frame/);
  assert.throws(() => validateCommand({type:'replace',clipId:'c',assetId:'asset_bad',sourceStart:'0'}), /action_arguments: arguments\.assetId/);
  assert.throws(() => validateCommand({type:'unknown'}), /action_arguments: arguments/);
});

test('schema validator rejects unsupported schema vocabulary', () => {
  assert.throws(() => validateSchema({type:'string', format:'date'}, 'x'), /unsupported schema keyword/);
});

test('oneOf requires exactly one match and preserves schema errors', () => {
  assert.throws(() => validateSchema({oneOf:[{type:'string'},{type:'string'}]}, 'x'), /must_match_exactly_one/);
  assert.throws(() => validateSchema({oneOf:[{format:'nope'},{type:'number'}]}, 2), /unsupported schema keyword: format/);
  assert.throws(() => validateCommand({type:'sound-output',gainDb:Infinity}), /action_arguments: arguments\.gainDb/);
  assert.throws(() => validateCommand({type:'text-delivery',delivery:'burn'}), /action_arguments: arguments\.delivery/);
});

test('the advertised command bounds reject impossible scene lengths and invalid rational seconds',()=>{
  const example=ACTIONS.find(a=>a.type==='insert').examples[0];
  assert.throws(()=>validateCommand({...example,clip:{...example.clip,frames:1728001}}),/arguments\.clip\.frames/);
  assert.throws(()=>validateCommand({type:'slip',clipId:'one',sourceStart:'1/0'}),/arguments\.sourceStart/);
  assert.throws(()=>validateCommand({type:'slip',clipId:'one',sourceStart:'1234567890123'}),/arguments\.sourceStart/);
});

test('text schema length counts unicode characters consistently with authored text',()=>{
  const command={type:'text-put',cue:{id:'title',kind:'title',startFrame:0,endFrame:24,text:'🌙'.repeat(480)}};
  assert.deepEqual(validateCommand(command),command);
  assert.throws(()=>validateCommand({...command,cue:{...command.cue,text:command.cue.text+'a'}}),/arguments\.cue\.text/);
});
