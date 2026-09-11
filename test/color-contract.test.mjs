import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCube,colorSettings,isPrepared709,COLOR_VERSION,PREPARED_REFERENCE_FILTER} from '../public/color-contract.mjs';
import {colorFilter} from '../src/media-color.mjs';
const cube = (n=2,fn=(r,g,b)=>[r,g,b]) => `TITLE "Fixture"\nLUT_3D_SIZE ${n}\n`+Array.from({length:n**3},(_,i)=>fn((i%n)/(n-1),(Math.floor(i/n)%n)/(n-1),Math.floor(i/n**2)/(n-1)).join(' ')).join('\n')+'\n';
const settings={inputEncoding:'rec709',inputRange:'limited',reviewed:true};
test('cube ordering, canonicalization and BOM/comments are explicit',()=>{
 const a=parseCube(cube()),b=parseCube('\uFEFF# comment\r\n'+cube().replaceAll('\n','\r\n'));
 assert.equal(a.canonical,b.canonical);assert.deepEqual(a.rows[1],[1,0,0]);assert.deepEqual(a.rows[2],[0,1,0]);assert.deepEqual(a.rows[4],[0,0,1]);
});
test('33-grid LUT parses without imposing the 1 MiB JSON-body limit',()=>assert.equal(parseCube(cube(33)).rows.length,35937));
for(const [name,text] of [
 ['missing rows',cube().split('\n').slice(0,-2).join('\n')],['extra rows',cube()+'0 0 0\n'],
 ['shaper LUT','LUT_1D_SIZE 2\n0 0 0\n1 1 1'],['duplicate grid',cube().replace('LUT_3D_SIZE 2','LUT_3D_SIZE 2\nLUT_3D_SIZE 2')],
 ['excessive grid','LUT_3D_SIZE 66'],['nonfinite',cube().replace('0 0 0','NaN 0 0')],['infinity',cube().replace('0 0 0','1e999 0 0')],
 ['non-unit domain',cube().replace('LUT_3D_SIZE 2','LUT_3D_SIZE 2\nDOMAIN_MIN -1 0 0')],['out-of-range output',cube().replace('0 0 0','-0.1 0 0')],
 ['file include',cube()+'INCLUDE /etc/passwd'],['binary control',cube()+'\0'],['commands after table',cube()+'TITLE "late"'],
 ['unknown format',cube()+'SCRIPT some-command']])test('rejects '+name,()=>assert.throws(()=>parseCube(text),/color_lut_/));
test('source declaration is mandatory and unknown controls fail closed',()=>{
 assert.throws(()=>colorSettings({...settings,reviewed:false}),/color_review/);
 assert.throws(()=>colorSettings({...settings,exposure:4}),/color_settings/);
 assert.throws(()=>colorSettings({...settings,inputRange:'auto'}),/color_input_range/);
 assert.throws(()=>colorSettings({...settings,inputEncoding:'custom-log'}),/conversion_lut/);
 assert.throws(()=>colorSettings({...settings,inputEncoding:'custom-log',lutId:'lut_'+'a'.repeat(64)}),/description/);
});
test('color filter never consumes user paths or arbitrary FFmpeg expressions',()=>{
 const s={...settings,lutId:'lut_'+'a'.repeat(64)};
 assert.throws(()=>colorFilter(s,{lutFilename:'/tmp/look.cube'}),/color_lut_path/);
 assert.throws(()=>colorFilter(s,{lutFilename:"look.cube:interp=nearest;null"}),/color_lut_path/);
 assert.throws(()=>colorFilter(s),/color_lut_required/);
 assert.match(colorFilter(s,{lutFilename:'a'.repeat(64)+'.cube'}),/interp=tetrahedral/);
});
test('reference conversion includes sRGB transfer, not just RGB pixel format',()=>assert.match(colorFilter(settings,{reference:true}),/transfer=iec61966-2-1/));
test('metadata alone is not enough to label arbitrary camera material prepared',()=>{
 const p={color:{primaries:'bt709',transfer:'bt709',space:'bt709',range:'tv'}};
 assert.equal(isPrepared709(p),false);p.colorPreparation={schema:COLOR_VERSION};assert.equal(isPrepared709(p),true);
 p.color.range='pc';assert.equal(isPrepared709(p),false);
});
