export const h3Modes=['text-to-video','image-to-video','reference-to-video'];
export const isH3=job=>job.snapshot.workflow.startsWith('minimax/h3-max/');
export function validateH3(studio,shot,cast) {
 if(!shot.generation)return;
 const g=shot.generation;
 if(g.model!=='h3-max'||!h3Modes.includes(g.mode))throw Error('h3_mode');
 if(!Number.isInteger(g.duration)||g.duration<5||g.duration>15)throw Error('h3_duration');
 if(!['480P','768P','1080P'].includes(g.resolution))throw Error('h3_resolution');
 if(!['balanced','quality'].includes(g.promptExpansionMode||'balanced'))throw Error('h3_prompt_expansion');
 // The existing reference-token estimator has measured/documented coefficients only for 480P/768P.
 if(g.mode==='reference-to-video'&&g.resolution==='1080P')throw Error('h3_reference_1080_unqualified');
 if(!['16:9','21:9','4:3','1:1','3:4','9:16','adaptive'].includes(g.aspectRatio||'16:9')||(g.mode==='text-to-video'&&g.aspectRatio==='adaptive'))throw Error('h3_aspect_ratio');
 const seen=new Set();
 for(const state of shot.characterStates||[]) {
  if(!cast.some(c=>c.id===state.castId)||(shot.cast||[]).includes(state.castId)===false||seen.has(state.castId))throw Error('character_state');
  seen.add(state.castId);
  if(state.reference&&studio.read(state.reference,'asset').kind!=='image')throw Error('image_required');
 }
 for(const id of [shot.location?.reference,shot.endReference].filter(Boolean))if(studio.read(id,'asset').kind!=='image')throw Error('image_required');
 if(!Array.isArray(shot.extraReferences||[])||(shot.extraReferences||[]).length>12)throw Error('h3_reference_limit');
 for(const ref of shot.extraReferences||[]) {
  studio.read(ref.assetId,'asset');
  if(!ref.role?.trim()||ref.role.length>1000)throw Error('reference_role_required');
 }
}
export function h3Snapshot(studio,p,shot) {
 const g=shot.generation;validateH3(studio,shot,p.cast||[]);
 if(!shot.action?.trim())throw Error('action_required');
 const bindings=[];
 const add=(assetId,role)=>{if(!assetId)return;const existing=bindings.find(b=>b.assetId===assetId);if(existing)existing.role+='; '+role;else bindings.push({assetId,role});};
 const place=shot.location?.reference||shot.location?.name?.trim()?shot.location:p.place||{};
 if(g.mode==='image-to-video') {
  if(!shot.reference&&!shot.endReference)throw Error('reference_required');
  add(shot.reference,'opening frame');add(shot.endReference,'ending frame');
 } else if(g.mode==='reference-to-video') {
  for(const c of (p.cast||[]).filter(c=>(shot.cast||[]).includes(c.id))) {
   add(c.reference,c.name+' original identity only; ignore its background and other people; current clothing follows the current-state reference when supplied');
   const state=(shot.characterStates||[]).find(s=>s.castId===c.id);
   if(state?.reference)add(state.reference,c.name+' current appearance: '+(state.description||c.cues||''));
  }
  add(place.reference,'location '+(place.name||'')+'; use layout and lighting');
  add(shot.reference,'intended shot composition and opening state');
  for(const ref of shot.extraReferences||[])add(ref.assetId,ref.role);
  if(!bindings.length)throw Error('reference_required');
 }
 const references=bindings.map(b=>studio.verifyAsset(b.assetId));
 if(references.length>12||references.filter(a=>a.kind==='image').length>9||references.filter(a=>a.kind==='video').length>3||references.filter(a=>a.kind==='audio').length>3)throw Error('h3_reference_limit');
 if(references.length&&references.every(a=>a.kind==='audio'))throw Error('audio_needs_visual');
 return {workflow:'minimax/h3-max/'+g.mode,bindings,references,place};
}
export function h3Input(job,urlFor) {
 const s=job.snapshot,g=s.shot.generation,counts={image:0,video:0,audio:0};
 const refs=s.bindings.map(b=>{const asset=s.references.find(a=>a.id===b.assetId);return {...b,kind:asset.kind,label:asset.kind[0].toUpperCase()+asset.kind.slice(1)+' '+(++counts[asset.kind])};});
 const prompt=[s.style,g.mode==='reference-to-video'?refs.map(r=>r.label+' controls '+r.role+'.').join('\n'):'',
  ...(s.shot.characterStates||[]).map(c=>(s.cast.find(x=>x.id===c.castId)?.name||c.castId)+' current condition: '+(c.description||'')),
  s.place.name?'Location: '+s.place.name:'',s.shot.before?'Opening state: '+s.shot.before:'',s.shot.action,s.shot.camera?'Camera: '+s.shot.camera:'',s.shot.after?'Visible ending state: '+s.shot.after:'',s.shot.sound?'Sound and dialogue: '+s.shot.sound:'Natural scene sound. No music or captions.'].filter(Boolean).join('\n');
 if(prompt.length>50000)throw Error('h3_prompt_limit');
 const input={prompt,duration:g.duration,resolution:g.resolution,prompt_expansion_mode:g.promptExpansionMode||'balanced',enable_safety_checker:true,sync_mode:false};
 if(Number.isInteger(s.shot.seed))input.seed=s.shot.seed;
 if(g.mode==='image-to-video') {
  if(s.shot.reference)input.image_url=urlFor(s.shot.reference);
  if(s.shot.endReference)input.end_image_url=urlFor(s.shot.endReference);
 }else {
  input.aspect_ratio=g.aspectRatio||'16:9';
  if(g.mode==='reference-to-video')for(const kind of ['image','video','audio']){const r=refs.filter(r=>r.kind===kind);if(r.length)input['reference_'+kind+'_urls']=r.map(r=>urlFor(r.assetId));}
 }
 return input;
}
