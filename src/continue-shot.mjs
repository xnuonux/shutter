import crypto from 'node:crypto';
import {reviewFrames} from './review-frames.mjs';

// A rendered take's frozen brief is the source; later editor changes are not footage.
export async function continueShot(studio,projectId,input){
 const p=studio.getProduction(projectId);
 if(p.revision!==input.baseRevision)throw Error('revision_conflict');
 if(!['continue','new'].includes(input.composition))throw Error('composition_required');
 if(input.composition==='new'&&!input.reference)throw Error('composition_image_required');
 if(input.composition==='new'&&studio.verifyAsset(input.reference).kind!=='image')throw Error('image_required');
 const job=studio.getJob(input.sourceJobId),index=p.shots.findIndex(s=>s.id===job.shotId);
 if(job.projectId!==p.id||index<0||p.shots[index].selectedTake!==job.id)throw Error('selected_source_required');
 if(job.state!=='ready'||!job.output||studio.verifyAsset(job.output).kind!=='video')throw Error('ready_video_required');
 const text=(key,max=4000)=>String(input[key]||'').trim().slice(0,max);
 if(!text('title',200)||!text('action')||!text('after')||!text('camera'))throw Error('next_shot_brief_required');
 const frames=await reviewFrames(studio,job.id),source=job.snapshot.shot;
 const shot={
  id:'shot_'+crypto.randomUUID(),title:text('title',200),cast:(source.cast||[]).filter(id=>(p.cast||[]).some(c=>c.id===id)),
  reference:input.composition==='new'?input.reference:frames.last,endReference:null,extraReferences:[],selectedTake:null,
  before:source.after||'',after:text('after'),action:text('action'),camera:text('camera'),sound:'',
  location:structuredClone(job.snapshot.place||{}),
  characterStates:structuredClone(source.characterStates||[]).filter(c=>(p.cast||[]).some(x=>x.id===c.castId)&&(source.cast||[]).includes(c.castId)),
  generation:{model:'h3-max',mode:'image-to-video',resolution:'480P',duration:5,aspectRatio:'16:9'},
  fps:24,frames:120,width:job.media?.width||832,height:job.media?.height||480,seed:Math.floor(Math.random()*1000000),
  continuitySource:{jobId:job.id,shotId:job.shotId,output:job.output,frame:frames.last,after:source.after||'',composition:input.composition},
 };
 // Revision checked again after asynchronous extraction to avoid overwriting concurrent work.
 const production=studio.saveProduction(p.id,input.baseRevision,{...p,shots:[...p.shots.slice(0,index+1),shot,...p.shots.slice(index+1)]});
 return {production,shotId:shot.id};
}
