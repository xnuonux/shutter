import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exact,asText,advanceSource,applyEdit,frameAtBeat,beatGrid,snapFrame,normalizeMusic,normalizeMarkers,placements,totalFrames,clipAt,EditHistory,samplingFor,MUSIC_SCHEMA} from '../public/music-edit.mjs';
import {makeRecovery,inspectRecovery} from '../public/edit-recovery.mjs';
const profiles=new Map([['video',{kind:'video',duration:120}],['alt',{kind:'video',duration:4}],['short',{kind:'video',duration:0.2}],['photo',{kind:'image',duration:null}]]);
const edit=()=>({format:'shutter-media-edit-v1',fps:'24000/1001',width:1920,height:1080,clips:[{id:'a',assetId:'video',sourceStart:'1/3',frames:100,fit:'contain'}],soundtrack:{assetId:'master',tailPolicy:'pad-silence'},markers:[{id:'chorus',frame:80,label:'Chorus',kind:'chorus'}]});
const music=(extra={})=>({schema:MUSIC_SCHEMA,bpm:'123.45',beatsPerBar:4,beatUnit:4,offsetFrames:17,...extra});
const split=(e,frame,id)=>applyEdit(e,{type:'split',clipId:clipAt(e,frame).id,frame,newId:id},profiles);
function samplingOracle(e) {
  const f=exact(e.fps);return placements(e).flatMap(c=>Array.from({length:c.frames},(_,i)=>{
    const s=c.sampling||{origin:c.sourceStart,offsetFrames:0};const r=exact(s.origin,true);
    return asText(exact(advanceSource(asText(r),s.offsetFrames+i,e.fps),true));
  }));
}
test('split preserves exact fractional source clock, total frames, song and absolute cues',()=>{
  const before=edit(),frozen=structuredClone(before),next=split(before,37,'b');assert.deepEqual(before,frozen);assert.equal(next.clips[0].frames,37);assert.equal(next.clips[1].frames,63);
  assert.equal(next.clips[1].sourceStart,'45037/24000');assert.deepEqual(next.soundtrack,before.soundtrack);assert.deepEqual(next.markers,before.markers);assert.deepEqual(samplingOracle(next),samplingOracle(before));
});
test('repeated splits preserve every logical sample address across 150 seeded cases',()=>{
  let seed=31849;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<150;n++){
    let e=edit();e.fps=['24','24000/1001','30000/1001','60'][n%4];e.clips[0].frames=25+Math.floor(rand()*240);const expected=samplingOracle(e);
    for(let j=0;j<8;j++){const cut=1+Math.floor(rand()*(totalFrames(e)-1));if(placements(e).some(c=>c.at===cut))continue;e=split(e,cut,'part_'+j);}
    assert.deepEqual(samplingOracle(e),expected,'case '+n);
  }
});
test('photo split retains zero source time',()=>{const e=edit();e.clips[0]={...e.clips[0],assetId:'photo',sourceStart:'0'};const next=split(e,40,'b');assert.equal(next.clips[1].sourceStart,'0');assert.equal(next.clips[1].sampling,undefined);});
test('rejected split boundaries and duplicate IDs never mutate input',()=>{
  for(const op of [{type:'split',clipId:'a',frame:0,newId:'b'},{type:'split',clipId:'a',frame:100,newId:'b'},{type:'split',clipId:'a',frame:4.5,newId:'b'},{type:'split',clipId:'a',frame:40,newId:'a'}]){const e=edit(),copy=structuredClone(e);assert.throws(()=>applyEdit(e,op,profiles));assert.deepEqual(e,copy);}
});
test('replace preserves the cut length, fit, song and cue positions',()=>{const e=edit();const next=applyEdit(e,{type:'replace',clipId:'a',assetId:'photo'},profiles);assert.equal(next.clips[0].frames,e.clips[0].frames);assert.equal(next.clips[0].fit,e.clips[0].fit);assert.deepEqual(next.soundtrack,e.soundtrack);assert.deepEqual(next.markers,e.markers);});
test('insufficient replacement handles are refused atomically',()=>{const e=edit(),copy=structuredClone(e);assert.throws(()=>applyEdit(e,{type:'replace',clipId:'a',assetId:'short'},profiles),/source_range/);assert.deepEqual(e,copy);});
test('slip changes only source selection, and resets the explicit sampling origin',()=>{let e=split(edit(),20,'b');const before=structuredClone(e);e=applyEdit(e,{type:'slip',clipId:'b',sourceStart:'2'},profiles);assert.equal(e.clips[1].sourceStart,'2/1');assert.equal(e.clips[1].sampling,undefined);assert.equal(e.clips[1].frames,before.clips[1].frames);assert.deepEqual(e.markers,before.markers);});
test('trim and ripple deletion leave master and musical cues fixed',()=>{let e=split(edit(),40,'b');e=applyEdit(e,{type:'trim-end',clipId:'a',frames:20},profiles);e=applyEdit(e,{type:'remove',clipId:'a'},profiles);assert.equal(totalFrames(e),60);assert.equal(e.markers[0].frame,80);assert.equal(e.soundtrack.assetId,'master');});
test('reorder and duplicate preserve source selection',()=>{let e=split(edit(),40,'b');e=applyEdit(e,{type:'move',clipId:'b',toIndex:0},profiles);assert.deepEqual(e.clips.map(c=>c.id),['b','a']);e=applyEdit(e,{type:'duplicate',clipId:'b',newId:'c'},profiles);assert.deepEqual(e.clips[1].sampling,e.clips[0].sampling);assert.deepEqual(e.clips.map(c=>c.id),['b','c','a']);});
test('unsupported commands, negative handles, fractional counts and invalid fit fail',()=>{for(const op of [{type:'magic'},{type:'slip',clipId:'a',sourceStart:'-1'},{type:'trim-end',clipId:'a',frames:0},{type:'trim-end',clipId:'a',frames:5.1},{type:'fit',clipId:'a',fit:'invent-details'},{type:'move',clipId:'a',toIndex:3}])assert.throws(()=>applyEdit(edit(),op,profiles));});
test('sampling metadata cannot contradict the visible source start or output clock',()=>{const e=split(edit(),11,'b');const c=e.clips[1];assert.deepEqual(samplingFor(c,e.fps),c.sampling);assert.throws(()=>samplingFor({...c,sourceStart:'0'},e.fps),/clock_mismatch/);assert.throws(()=>samplingFor(c,'24'),/clock_mismatch/);});
test('beat timestamps are rounded from absolute rational time, without accumulated drift',()=>{
  const m=music(),fps='24000/1001';
  for(const i of [0,1,2,7,999,10000,25000]){
    // Independent numeric oracle; these cases are deliberately away from half-frame ties.
    const expected=17+Math.round(i*60/123.45*24000/1001);assert.equal(frameAtBeat(i,m,fps),expected);
  }
  assert.notEqual(frameAtBeat(10000,m,fps),17+10000*(frameAtBeat(1,m,fps)-17));
});
test('meter denominators are meaningful: 6/8 uses eighth-note beats, BPM stays quarter-note',()=>{const m=music({bpm:'120',beatsPerBar:6,beatUnit:8,offsetFrames:0});assert.equal(frameAtBeat(1,m,'24'),6);assert.equal(frameAtBeat(6,m,'24'),36);const grid=beatGrid(m,'24',0,36);assert.equal(grid.at(-1).bar,2);assert.equal(grid.at(-1).beat,1);});
test('dense grids are bounded and snap has an explicit tolerance',()=>{const m=music({bpm:'400',offsetFrames:0});assert.ok(beatGrid(m,'120',0,1000000,128).length<=129);const e=edit();e.music=music({bpm:'120',offsetFrames:0});assert.equal(snapFrame(e,79,2),80);assert.equal(snapFrame(e,77,0),77);});
test('invalid maps and marker injection are rejected before persistence',()=>{
  for(const value of [music({bpm:'0'}),music({bpm:'NaN'}),music({beatsPerBar:0}),music({beatUnit:3}),music({offsetFrames:-1}),{...music(),command:'execute'}])assert.throws(()=>normalizeMusic(value));
  for(const value of [[{id:'a',frame:2.1,label:'x',kind:'cue'}],[{id:'a',frame:2,label:'x\nformula',kind:'cue'}],[{id:'a',frame:2,label:'x',kind:'cue'},{id:'a',frame:3,label:'y',kind:'cue'}]])assert.throws(()=>normalizeMarkers(value));
});
test('cue commands are reversible and do not mutate the source marker list',()=>{const e=edit();const next=applyEdit(e,{type:'marker-add',marker:{id:'verse',frame:2,label:'Verse',kind:'verse'}},profiles);assert.equal(e.markers.length,1);assert.equal(next.markers[0].id,'verse');assert.equal(applyEdit(next,{type:'marker-remove',markerId:'verse'},profiles).markers.length,1);});
test('local history is bounded, copies values, and forks clear redo',()=>{const h=new EditHistory(edit(),3);for(let i=1;i<=5;i++){const e=edit();e.width=100+i;h.commit(e);e.width=999;}assert.equal(h.past.length,3);assert.equal(h.current.width,105);assert.equal(h.undo().width,104);assert.equal(h.redo().width,105);h.undo();const e=edit();e.width=222;h.commit(e);assert.equal(h.redo(),null);});
test('draft recovery is offered only against the identical saved revision and plan hash',()=>{
  const base={revision:3,plan:{hash:'abc'},timeline:edit()},draft=applyEdit(edit(),{type:'trim-end',clipId:'a',frames:50},profiles),saved=makeRecovery('p',base,draft,'2026-09-11T00:00:00Z');
  assert.equal(inspectRecovery('p',base,saved).status,'recoverable');assert.equal(inspectRecovery('p',{...base,revision:4},saved).status,'conflict');assert.equal(inspectRecovery('p',{...base,plan:{hash:'changed'}},saved).status,'conflict');assert.equal(inspectRecovery('q',base,saved).status,'invalid');assert.equal(inspectRecovery('p',base,makeRecovery('p',base,base.timeline)).status,'redundant');
});
