/** Optional reproducible screenshot media: generated test pattern, not camera footage. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {fileURLToPath} from 'node:url';
import {Studio} from '../../src/store.mjs';
import {runMedia,importMediaFile} from '../../src/media-io.mjs';
import {importColorLut,previewColor} from '../../src/media-color.mjs';
const out=fileURLToPath(new URL('../../verification/',import.meta.url));await fs.mkdir(out,{recursive:true});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'color-demo-')),studio=new Studio(path.join(root,'studio'));
try{
 const file=path.join(root,'test-pattern.mp4');
 await runMedia('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=640x360:r=24:d=1','-vf','eq=contrast=0.65:brightness=0.04:saturation=0.7','-c:v','libx264','-threads','1','-filter_threads','1','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',file]);
 const asset=await importMediaFile(studio,file,{name:'Synthetic low-contrast test pattern'}),n=17,rows=Array.from({length:n**3},(_,i)=>[i%n,Math.floor(i/n)%n,Math.floor(i/n/n)].map(v=>Math.max(0,Math.min(1,(v/16-0.15)/0.7))).map(v=>v.toFixed(7)).join(' '));
 const lut=await importColorLut(studio,Readable.from(['TITLE "Synthetic contrast only"\nLUT_3D_SIZE 17\n'+rows.join('\n')+'\n']),{name:'Synthetic contrast only',inputEncoding:'rec709'});
 const preview=await previewColor(studio,asset.id,{settings:{inputEncoding:'rec709',inputRange:'limited',reviewed:true,lutId:lut.id,description:'Synthetic test pattern; not a camera-profile conversion'},frame:23});
 for(const [key,name] of [['beforeAssetId','color-demo-before.png'],['afterAssetId','color-demo-after.png']])await fs.copyFile(studio.assetPath(preview[key]),path.join(out,name));
 await fs.writeFile(path.join(out,'color-demo.json'),JSON.stringify({scope:'FFmpeg-generated synthetic pattern and original synthetic contrast LUT. Not Sony footage or grading certification.',sourceSha256:asset.sha256,preview,lut},null,2)+'\n');
}finally{studio.close();await fs.rm(root,{recursive:true,force:true});}
