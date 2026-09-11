/** Shared, provider-free Production Memory and Take Stack contracts. */
import {exact,asText,samplingFor} from './music-edit.mjs';
export const MEMORY_LIMITS=Object.freeze({notes:5000,takes:24,query:240,rangeUs:86400e6,scoutUs:120e6,scenes:200,thumbnails:12});
export function memoryId(v){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))throw Error('memory_identity');return v;}
export function memoryText(v,max,required=false){
  if(typeof v!=='string'||[...v].length>max||/[\u0000-\u0008\u000b-\u001f\u007f\ud800-\udfff]/u.test(v)||required&&!v.trim())throw Error('memory_text');
  return v.trim();
}
export function secondsUs(value){
  if(!/^\d{1,5}(?:\.\d{1,6})?$/.test(String(value)))throw Error('memory_time');
  const [whole,part='']=String(value).split('.'),us=Number(whole)*1e6+Number(part.padEnd(6,'0'));
  if(!Number.isSafeInteger(us)||us>MEMORY_LIMITS.rangeUs)throw Error('memory_time');return us;
}
export function memoryRange(startUs,endUs){
  if(![startUs,endUs].every(Number.isSafeInteger)||startUs<0||endUs<=startUs||endUs>MEMORY_LIMITS.rangeUs)throw Error('memory_range');
  return {startUs,endUs};
}
export function normalizeMoment(input){
  if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Object.keys(input).some(k=>!['id','assetId','startUs','endUs','label','notes','tags','favorite'].includes(k)))throw Error('memory_moment');
  if(!/^asset_[a-f0-9]{64}$/.test(input.assetId))throw Error('memory_asset');
  const tags=input.tags??[];if(!Array.isArray(tags)||tags.length>16)throw Error('memory_tags');
  if(input.favorite!==undefined&&typeof input.favorite!=='boolean')throw Error('memory_favorite');
  return {id:memoryId(input.id),assetId:input.assetId,...memoryRange(input.startUs,input.endUs),label:memoryText(input.label,160,true),
    notes:memoryText(input.notes??'',2000),tags:[...new Set(tags.map(t=>memoryText(t,60,true)))],favorite:input.favorite??false};
}
/** Literal Unicode terms; no arbitrary FTS operators, SQL, prompts or execution. */
export function searchExpression(value){
  const query=memoryText(value,MEMORY_LIMITS.query);
  const terms=query.match(/[\p{L}\p{N}\p{M}_]+/gu)||[];
  if(terms.length>16)throw Error('memory_query_terms');
  return {query,match:terms.map(t=>'"'+t+'"*').join(' AND '),empty:!terms.length};
}
export function rangeFitsTake(candidate,clip,fps,profile){
  try {
    const source=exact(candidate.sourceStart,true),rate=exact(fps);
    if(!Number.isSafeInteger(clip.frames)||clip.frames<1)throw Error('take_frames');
    if(profile.kind==='image')return source.n===0n?{fits:true}:{fits:false,reason:'image_source_start'};
    if(profile.kind!=='video')return {fits:false,reason:'visual_media_required'};
    const endUs=Math.min(candidate.endUs,Math.floor(profile.duration*1e6));
    if(!Number.isSafeInteger(endUs)||endUs<0)throw Error('take_end');
    const needed=(source.n*rate.n+BigInt(clip.frames)*rate.d*source.d)*1000000n;
    return needed<=BigInt(endUs)*source.d*rate.n?{fits:true}:{fits:false,reason:'marked_range_too_short'};
  }catch{return {fits:false,reason:'take_range_invalid'};}
}
export function sourceSelection(clip,fps){return {assetId:clip.assetId,sourceStart:asText(exact(clip.sourceStart??'0',true)),sampling:samplingFor(clip,fps)};}
export function sameSelection(a,b,fps){try{return JSON.stringify(sourceSelection(a,fps))===JSON.stringify(sourceSelection(b,fps));}catch{return false;}}
/** Replace only source selection. The output duration, placement, fit, song, text and cues stay intact. */
export function takeProposal(edit,clipId,candidate,profile){
  const next=structuredClone(edit),clip=next.clips.find(c=>c.id===clipId);if(!clip)throw Error('take_shot_not_found');
  const fit=rangeFitsTake(candidate,clip,next.fps,profile);if(!fit.fits)throw Error(fit.reason);
  clip.assetId=candidate.assetId;clip.sourceStart=asText(exact(candidate.sourceStart,true));
  if(candidate.sampling)clip.sampling=structuredClone(candidate.sampling);else delete clip.sampling;
  samplingFor(clip,next.fps);return next;
}
