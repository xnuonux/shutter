// Source-frame ranges follow Lunari Cinema's non-destructive edit model.
// Coverage is resolved on scene time before either preview or export.
export function compileTimeline(studio, projectId, timeline) {
  if(!timeline || !Number.isInteger(timeline.fps) || timeline.fps<1 || timeline.fps>120 ||
    !Array.isArray(timeline.main) || !timeline.main.length || timeline.main.length>1000 ||
    !Array.isArray(timeline.coverage) || timeline.coverage.length>1000)
    throw Error('timeline_invalid');
  const ids=new Set(), takes=new Map();
  function segment(clip,at) {
    if(!clip || typeof clip.id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(clip.id) || ids.has(clip.id))throw Error('timeline_clip_identity');
    ids.add(clip.id);
    const job=studio.getJob(clip.jobId), m=job.media;
    if(job.projectId!==projectId || job.state!=='ready' || !job.output || !m)throw Error('timeline_ready_take_required');
    if(m.fps!==timeline.fps)throw Error('timeline_frame_rate_mismatch');
    if(!Number.isSafeInteger(m.frames) || !Number.isSafeInteger(clip.sourceIn) || !Number.isSafeInteger(clip.sourceOut) ||
       clip.sourceIn<0 || clip.sourceOut<=clip.sourceIn || clip.sourceOut>m.frames || !Number.isSafeInteger(at) || at<0)
      throw Error('timeline_source_range');
    if(!takes.has(job.id)){
      const asset=studio.verifyAsset(job.output);
      takes.set(job.id,{jobId:job.id,shotId:job.shotId,assetId:asset.id,sha256:asset.sha256,width:m.width,height:m.height,fps:m.fps,frames:m.frames,audioStreams:m.audioStreams||0});
    }
    return {clipId:clip.id,jobId:job.id,assetId:job.output,at,sourceIn:clip.sourceIn,sourceOut:clip.sourceOut,frames:clip.sourceOut-clip.sourceIn};
  }
  let frames=0;
  const main=timeline.main.map(c=>{const s=segment(c,frames);frames+=s.frames;return s;});
  const coverage=timeline.coverage.map(c=>segment(c,c.at)).sort((a,b)=>a.at-b.at);
  for(let i=0;i<coverage.length;i++) {
    if(coverage[i].at+coverage[i].frames>frames)throw Error('timeline_coverage_outside_scene');
    if(i && coverage[i-1].at+coverage[i-1].frames>coverage[i].at)throw Error('timeline_coverage_overlap');
  }
  const boundaries=[...new Set([0,frames,...main.flatMap(s=>[s.at,s.at+s.frames]),...coverage.flatMap(s=>[s.at,s.at+s.frames])])].sort((a,b)=>a-b);
  const videoSegments=[];
  for(let i=0;i<boundaries.length-1;i++) {
    const at=boundaries[i],end=boundaries[i+1];
    const selected=coverage.find(s=>at>=s.at&&at<s.at+s.frames)||main.find(s=>at>=s.at&&at<s.at+s.frames);
    const sourceIn=selected.sourceIn+at-selected.at;
    const last=videoSegments.at(-1);
    if(last && last.clipId===selected.clipId && last.sourceOut===sourceIn){last.sourceOut+=end-at;last.frames+=end-at;}
    else videoSegments.push({...selected,at,sourceIn,sourceOut:sourceIn+end-at,frames:end-at});
  }
  return {projectId,title:studio.getProduction(projectId).title,takes:[...takes.values()],fps:timeline.fps,frames,
    width:Math.max(...[...takes.values()].map(t=>t.width)),height:Math.max(...[...takes.values()].map(t=>t.height)),
    audioStreams:main.some(s=>takes.get(s.jobId).audioStreams>0)?1:0,
    videoSegments,audioSegments:main,audioPolicy:'main-scene',version:3};
}
