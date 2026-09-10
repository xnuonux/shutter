import fs from 'node:fs';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),inflight=new Map();
export async function reviewFrames(studio,id){
 const job=studio.getJob(id);if(job.state!=='ready'||!job.output)throw Error('ready_take_required');
 const source=studio.verifyAsset(job.output),cached=job.reviewFrames;
 if(cached?.sourceDigest===source.sha256){studio.verifyAsset(cached.first);studio.verifyAsset(cached.last);return cached;}
 const key=studio.root+id;if(inflight.has(key))return inflight.get(key);
 const task=(async()=>{
  const folder=path.join(studio.root,'review-frames',id);fs.mkdirSync(folder,{recursive:true});
  const {stdout}=await execute(process.env.SHUTTER_PROBE_PYTHON||'D:/LunariRender/runtime/comfy/ComfyUI_windows_portable/python_embeded/python.exe',['-s',fileURLToPath(new URL('../tools/extract_review_frames.py',import.meta.url)),studio.assetPath(job.output),folder],{windowsHide:true,timeout:60000,maxBuffer:10000});
  const {frameCount}=JSON.parse(stdout),result={sourceDigest:source.sha256,frameCount};
  for(const name of ['first','last'])result[name]=studio.importAsset(fs.readFileSync(path.join(folder,name+'.png')),{name:job.snapshot.shot.title+' '+name+' frame.png',origin:'Decoded '+name+' frame of '+job.id+'; source '+source.sha256}).id;
  studio.updateJob(id,{reviewFrames:result});return result;
 })();inflight.set(key,task);try{return await task;}finally{inflight.delete(key);}
}
