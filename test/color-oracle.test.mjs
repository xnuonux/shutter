/** Independent numeric oracle: raw YUV planes + hand-written 709/sRGB and tetrahedra.
 * This is a bounded synthetic pixel test, not a display or manufacturer certification. */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runMedia} from '../src/media-io.mjs';
import {colorFilter} from '../src/media-color.mjs';
let root;
before(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'color-oracle-'));});
after(()=>fs.rm(root,{recursive:true,force:true}));
const samples=[[.12,.34,.72],[.75,.18,.32],[.24,.84,.41],[.81,.69,.13],[.27,.49,.62],[0,0,0],[1,1,1],[.5,.5,.5]];
const width=16*samples.length,height=16,clamp=x=>Math.min(1,Math.max(0,x));
const encode=(rgb,range)=>{const [r,g,b]=rgb,y=.2126*r+.7152*g+.0722*b,cb=(b-y)/1.8556,cr=(r-y)/1.5748;
 return range==='limited'?[64+876*y,512+896*cb,512+896*cr].map(Math.round):[1023*y,512+1023*cb,512+1023*cr].map(Math.round);};
const decode=(v,range)=>{const y=range==='limited'?(v[0]-64)/876:v[0]/1023,cb=(v[1]-512)/(range==='limited'?896:1023),cr=(v[2]-512)/(range==='limited'?896:1023),r=y+1.5748*cr,b=y+1.8556*cb;return [r,(y-.2126*r-.0722*b)/.7152,b].map(clamp);};
// Display-referred BT.1886 ideal black, not inverse camera OETF. See zimg gamma.cpp.
const srgb=v=>{const x=Math.pow(clamp(v),2.4);return clamp(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055)*255;};
const lutRows=Array.from({length:8},(_,i)=>{const r=i%2,g=Math.floor(i/2)%2,b=Math.floor(i/4);return [.1+.55*r+.2*g*b,.12+.5*g+.23*r*b,.08+.6*b+.2*r*g];});
function tetra(rgb,rows){const order=[0,1,2].sort((a,b)=>rgb[b]-rgb[a]),weights=[1-rgb[order[0]],rgb[order[0]]-rgb[order[1]],rgb[order[1]]-rgb[order[2]],rgb[order[2]]],idx=[0,1<<order[0],(1<<order[0])+(1<<order[1]),7];return [0,1,2].map(c=>weights.reduce((s,w,i)=>s+w*rows[idx[i]][c],0));}
async function check(range,useLut){
 const pixels=width*height,raw=Buffer.alloc(pixels*6),values=samples.map(s=>encode(s,range));
 for(let plane=0;plane<3;plane++)for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw.writeUInt16LE(values[Math.floor(x/16)][plane],(plane*pixels+y*width+x)*2);
 const input=path.join(root,range+'-'+useLut+'.yuv'),output=input+'.rgb';await fs.writeFile(input,raw);
 const name='a'.repeat(64)+'.cube';if(useLut)await fs.writeFile(path.join(root,name),'LUT_3D_SIZE 2\n'+lutRows.map(r=>r.join(' ')).join('\n')+'\n');
 const filter=colorFilter({inputEncoding:'rec709',inputRange:range,reviewed:true,...(useLut?{lutId:'lut_'+'a'.repeat(64)}:{})},{lutFilename:useLut?name:null,reference:true});
 // runMedia does not expose a process cwd, so the oracle invokes a child with only its own fixture cwd.
 const {execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 await promisify(execFile)('ffmpeg',['-v','error','-nostdin','-f','rawvideo','-pixel_format','yuv444p10le','-video_size',`${width}x${height}`,'-i',input,'-vf',filter,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','-threads','1','-filter_threads','1',output],{cwd:root,timeout:20000});
 const result=await fs.readFile(output);assert.equal(result.length,pixels*3);
 let max=0;for(let i=0;i<samples.length;i++){let rgb=decode(values[i],range);if(useLut)rgb=tetra(rgb,lutRows);
  const expected=rgb.map(srgb),offset=((height/2)*width+i*16+8)*3;
  for(let c=0;c<3;c++){const error=Math.abs(result[offset+c]-expected[c]);max=Math.max(max,error);assert.ok(error<=3,JSON.stringify({range,useLut,patch:i,channel:c,actual:result[offset+c],expected:expected[c],error}));}}
 console.log(JSON.stringify({oracle:'BT1886-to-sRGB plus independent tetrahedra',range,useLut,maxCodeError:max,tolerance:3,comparedChannels:samples.length*3}));return max;
}
for(const range of ['limited','full'])for(const lut of [false,true])test(`${range} YUV and ${lut?'nonseparable tetrahedral LUT':'identity'} match independent sRGB oracle within 3/255`,()=>check(range,lut));
