import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyTextLayer,normalizeTextLayer,plainText,applyTextEdit,activeText,textReview,parseCaptions,exportCaptions,millisecondsToFrame,frameMilliseconds} from '../public/text-edit.mjs';
import {applyEdit,EditHistory} from '../public/music-edit.mjs';
import {makeFrameClockAss,frameClockTextFilter} from '../src/media-text.mjs';
const cue=(id='line',startFrame=24,endFrame=48,kind='caption',text='Your song. Your picture.')=>({id,kind,startFrame,endFrame,text});
const layer=cues=>({...emptyTextLayer(),cues});
const edit=()=>({format:'shutter-media-edit-v1',fps:'24000/1001',clips:[],soundtrack:{assetId:'master'},textLayer:layer([cue()])});
const frozen=object=>{Object.freeze(object);for(const x of Object.values(object))if(x&&typeof x==='object')frozen(x);return object;};
test('old timelines acquire no implicit text or delivery decision',()=>{assert.equal(normalizeTextLayer(undefined),null);assert.equal(normalizeTextLayer(null),null);assert.deepEqual(emptyTextLayer(),{schema:'shutter-text-v1',captionDelivery:'sidecar',cues:[]});});
test('normalization is deterministic and leaves deeply frozen input intact',()=>{const input=frozen(layer([cue('z',5,10),cue('a',0,5)]));assert.deepEqual(normalizeTextLayer(input).cues.map(c=>c.id),['a','z']);assert.equal(input.cues[0].id,'z');});
test('Unicode authored text stays exact, including Polish and Arabic',()=>{const value='Zażółć gęślą jaźń\nمرحبا بالعالم';assert.equal(plainText(value),value);});
for(const [name,bad] of [['ASS override','{\\pos(1,1)}hidden'],['escape','hello\\Nworld'],['NUL','hello\0'],['invalid Unicode','bad\ud800'],['replacement character','bad\ufffd'],['empty',' '],['four explicit lines','a\nb\nc\nd'],['blank subtitle block','one\n\ntwo'],['unbounded','a'.repeat(481)]])test(`reject ${name} without mutating the input`,()=>assert.throws(()=>plainText(bad)));
test('cue identity, schema and unknown fields are validated',()=>{for(const c of [{...cue(),id:'../escape'},{...cue(),startFrame:0.5},{...cue(),endFrame:24},{...cue(),kind:'html'},{...cue(),css:'position:absolute'}])assert.throws(()=>normalizeTextLayer(layer([c])));assert.throws(()=>normalizeTextLayer(JSON.parse('{"schema":"shutter-text-v1","captionDelivery":"sidecar","cues":[],"__proto__":{"x":1}}')));});
test('half-open adjacent caption intervals are valid; overlapping captions are rejected',()=>{normalizeTextLayer(layer([cue('a',0,1),cue('b',1,2)]));assert.throws(()=>normalizeTextLayer(layer([cue('a',0,2),cue('b',1,2)])),/caption_overlap/);});
test('at most four simultaneous layers are accepted',()=>assert.throws(()=>normalizeTextLayer(layer(Array.from({length:5},(_,i)=>cue('x'+i,0,5,'title')))),/overlap_limit/));
test('editor monitoring and exported burn choices remain distinct',()=>{const l=layer([cue('cap',0,3),cue('title',0,3,'title')]);assert.equal(activeText(l,0).length,2);assert.deepEqual(activeText(l,0,{forExport:true}).map(c=>c.id),['title']);assert.equal(activeText(l,3).length,0);l.captionDelivery='burn-and-sidecar';assert.equal(activeText(l,1,{forExport:true}).length,2);});
test('text commands preserve picture, fixed master and caller input',()=>{const e=frozen(edit());const next=applyTextEdit(e,{type:'text-put',cue:cue('title',0,24,'title','MIDNIGHT')});assert.equal(next.textLayer.cues.length,2);assert.deepEqual(next.clips,e.clips);assert.deepEqual(next.soundtrack,e.soundtrack);assert.equal(e.textLayer.cues.length,1);});
test('deletion requires a real identity, and delivery remains explicit',()=>{assert.throws(()=>applyTextEdit(edit(),{type:'text-delete',cueId:'missing'}),/not_found/);assert.equal(applyTextEdit(edit(),{type:'text-delivery',delivery:'burn-and-sidecar'}).textLayer.captionDelivery,'burn-and-sidecar');});
test('failed command and failed import do not partly replace existing text',()=>{const e=edit(),before=structuredClone(e);assert.throws(()=>applyTextEdit(e,{type:'text-import',sourceFormat:'srt',content:'1\n00:00:00,000 --> 00:00:01,000\nHi\n\n2\nbad',mode:'replace-captions',idPrefix:'import'}));assert.deepEqual(e,before);});
test('text history is restored by the existing undo/redo engine',()=>{const e=edit(),history=new EditHistory(e),next=applyTextEdit(e,{type:'text-put',cue:cue('title',0,24,'title')});history.commit(next);assert.deepEqual(history.undo(),e);assert.deepEqual(history.redo(),next);});
test('outside-picture text is retained with a blocking export observation',()=>{const l=layer([cue('late',12,24)]);assert.deepEqual(textReview(l,12,'24').filter(i=>i.blocking),[{id:'late',code:'outside-picture',blocking:true}]);assert.equal(l.cues.length,1);});
test('reading-speed, wrapping and collision notices are advisory',()=>{const issues=textReview(layer([cue('fast',0,1,'caption','A'.repeat(50)),cue('lower',0,20,'lower-third','Name')]),30,'24');assert.ok(issues.some(i=>i.code==='fast-reading'));assert.ok(issues.some(i=>i.code==='long-line'));assert.ok(issues.some(i=>i.code==='check-text-collision'));assert.ok(issues.every(i=>!i.blocking));});
test('SRT import reads BOM, CRLF, explicit lines and upward frame quantization',()=>{const s='\ufeff1\r\n00:00:00,041 --> 00:00:01,000\r\nOne\r\nTwo\r\n';const [c]=parseCaptions(s,'srt','24000/1001','import');assert.equal(c.startFrame,1);assert.equal(c.endFrame,24);assert.equal(c.text,'One\nTwo');});
test('plain WebVTT supports identifiers, NOTE blocks and defined entities',()=>{const [c]=parseCaptions('WEBVTT\n\nNOTE reviewed\nnot spoken\n\nintro\n00:01.000 --> 00:02.000\nYou &amp; me &lt; 3','vtt','24','v');assert.equal(c.text,'You & me < 3');assert.equal(c.startFrame,24);});
for(const [name,format,content] of [
 ['cue positioning','vtt','WEBVTT\n\n00:00.000 --> 00:01.000 align:start\nHi'],
 ['styles','vtt','WEBVTT\n\nSTYLE\n::cue {color:red}'],
 ['HTML markup','srt','1\n00:00:00,000 --> 00:00:01,000\n<b>Hi</b>'],
 ['bad clock','srt','1\n00:80:00,000 --> 00:81:01,000\nHi'],
 ['same clock','srt','1\n00:00:01,000 --> 00:00:01,000\nHi'],
 ['unrepresented subframe cue','srt','1\n00:00:00,001 --> 00:00:00,002\nHi'],
 ['unknown entities','vtt','WEBVTT\n\n00:00.000 --> 00:01.000\nYou &#123; me'],
 ['header metadata','vtt','WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00.000 --> 00:01.000\nHi']
])test(`import rejects ${name} instead of silently dropping semantics`,()=>assert.throws(()=>parseCaptions(content,format,'24','bad')));
test('replacing captions preserves all title cues',()=>{const e=edit();e.textLayer.cues.push(cue('title',0,10,'title'));const next=applyTextEdit(e,{type:'text-import',mode:'replace-captions',sourceFormat:'srt',content:'1\n00:00:00,000 --> 00:00:01,000\nNew',idPrefix:'new'});assert.deepEqual(next.textLayer.cues.map(c=>c.id),['new_1','title']);});
test('sidecar export excludes titles and carries literal text safely in VTT',()=>{const l=layer([cue('cap',0,24,'caption','You & me < 3'),cue('title',0,24,'title','Do not caption this')]);const srt=exportCaptions(l,'24','srt'),vtt=exportCaptions(l,'24','vtt');assert.ok(!srt.includes('Do not'));assert.ok(vtt.includes('You &amp; me &lt; 3'));assert.equal(parseCaptions(vtt,'vtt','24','back')[0].text,'You & me < 3');});
test('millisecond sidecars round-trip exact authored frame boundaries across six rates',()=>{
 for(const fps of ['24','25','24000/1001','30000/1001','60000/1001','120'])for(let f=0;f<10000;f+=17){
   // Independent integer-rational oracle; no use of production frame conversion to form expected values.
   const [num,den='1']=fps.split('/').map(String),expectedMs=Math.floor(f*Number(den)*1000/Number(num));
   assert.equal(frameMilliseconds(f,fps),expectedMs);assert.equal(millisecondsToFrame(expectedMs,fps),f);
   const l=layer([cue('c',f,f+1)]);for(const fmt of ['srt','vtt']){const c=parseCaptions(exportCaptions(l,fps,fmt),fmt,fps,'back')[0];assert.equal(c.startFrame,f);assert.equal(c.endFrame,f+1);}
 }
});
test('internal ASS uses output frames as whole seconds, not rounded real subtitle timestamps',()=>{const plan={width:1920,height:1080,frames:40,fps:'24000/1001',textLayer:{...layer([cue('c',2,3)]),captionDelivery:'burn-and-sidecar'}};const ass=makeFrameClockAss(plan);assert.match(ass,/Dialogue: 2,0:00:02\.00,0:00:03\.00/);assert.match(frameClockTextFilter(plan.fps),/setpts=N\*1001\/24000\/TB$/);assert.match(makeFrameClockAss(plan,{offset:2,count:1}),/Dialogue: 2,0:00:00\.00,0:00:01\.00/);});

test('Unicode noncharacters and inherited schemas cannot become invisible authored text',()=>{assert.throws(()=>plainText('\u{10ffff}'),/text_noncharacter/);assert.throws(()=>normalizeTextLayer(Object.create(emptyTextLayer())),/text_layer_invalid/);});
