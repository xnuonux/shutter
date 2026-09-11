/** Reproducible, entirely synthetic render for inspection. No external media or font is bundled. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Studio} from '../src/store.mjs';
import {runMedia,importMediaFile,fileDigest} from '../src/media-io.mjs';
import {createMediaProduction} from '../src/media-api.mjs';
import {renderMediaEdit,renderMediaTextFrame} from '../src/media-edit.mjs';
import {emptyTextLayer} from '../public/text-edit.mjs';
import {pcm24} from './helpers/sound-fixtures.mjs';
const out=path.resolve('verification/demo');await fs.mkdir(out,{recursive:true});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'shutter-finish-demo-')),studio=new Studio(path.join(root,'studio'));
try {
  const w=1280,h=720,pixels=Buffer.alloc(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const d=Math.hypot((x-w*.75)/w,(y-h*.33)/h),glow=Math.exp(-d*d*18),a=(x+y*.45)/w;
    const wave=Math.max(0,1-Math.abs(y/h-(.64+.04*Math.sin(x/w*9)))*160);
    const rgb=[10+glow*66+a*5+wave*30,12+glow*22+a*9+wave*37,21+glow*80+a*16+wave*56];
    for(let c=0;c<3;c++)pixels[(y*w+x)*3+c]=Math.round(rgb[c]);
  }
  const ppm=path.join(root,'source.ppm');await fs.writeFile(ppm,Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),pixels]));
  const video=path.join(root,'source.mp4');await runMedia('ffmpeg',['-v','error','-loop','1','-framerate','24000/1001','-i',ppm,'-frames:v','144','-c:v','libx264','-threads','2','-pix_fmt','yuv420p',video]);
  const picture=await importMediaFile(studio,video,{name:'Synthetic light field.mp4'}),wav=path.join(root,'master.wav');
  await fs.writeFile(wav,pcm24(288288,(i,c)=>Math.round(240000*Math.sin(2*Math.PI*(c?330:220)*i/48000)*Math.sin(Math.PI*Math.min(1,i/96000))**2)));
  const song=await importMediaFile(studio,wav,{name:'Synthetic tone master.wav'}),p=createMediaProduction(studio,{title:'Make the cut yours · synthetic demo',fps:'24000/1001',width:w,height:h}).production;
  const edit=studio.getTimeline(p.id).timeline;edit.clips=[{id:'opening',assetId:picture.id,sourceStart:'0',frames:72,fit:'contain'},{id:'ending',assetId:picture.id,sourceStart:'0',frames:72,fit:'contain'}];
  edit.soundtrack={assetId:song.id,tailPolicy:'pad-silence'};
  edit.textLayer={...emptyTextLayer(),captionDelivery:'burn-and-sidecar',cues:[
    {id:'opening-title',kind:'title',startFrame:18,endFrame:96,text:'SHUTTER\nMAKE THE CUT YOURS'},
    {id:'lyric-one',kind:'caption',startFrame:48,endFrame:96,text:'Keep the performance. Shape the story.'},
    {id:'lyric-two',kind:'caption',startFrame:96,endFrame:144,text:'Your song. Your picture. Your words.'}
  ]};
  const record=studio.saveTimeline(p.id,1,edit),proof=await renderMediaTextFrame(studio,p.id,{baseRevision:record.revision,frame:60,acknowledgeUnmanagedColor:true}),cut=await renderMediaEdit(studio,p.id,{baseRevision:record.revision,acknowledgeUnmanagedColor:true});
  await fs.copyFile(studio.assetPath(proof.imageAssetId),path.join(out,'compositor-frame.png'));
  await fs.copyFile(studio.assetPath(cut.output),path.join(out,'finish-demo.mp4'));
  const folder=path.join(studio.root,'media-renders',cut.bridgeFolder);
  for(const name of ['captions.srt','captions.vtt','text-layer.json','manifest.json'])await fs.copyFile(path.join(folder,name),path.join(out,name));
  await fs.writeFile(path.join(out,'demo-record.json'),JSON.stringify({scope:'Synthetic generated color field and simple synthesized tones, not camera footage or an actual artist song. Compositor frame and final video are actual local outputs.',timeline:edit,proof,cut,sourceHashes:{picture:await fileDigest(studio.assetPath(picture.id)),master:await fileDigest(studio.assetPath(song.id))}},null,2)+'\n');
  console.log(JSON.stringify({frames:cut.plan.frames,fps:cut.plan.fps,audioSamples:cut.plan.audioSamples,output:out},null,2));
} finally {studio.close();await fs.rm(root,{recursive:true,force:true});}
