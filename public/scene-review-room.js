const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class SceneReviewRoom{
 constructor({root,getProject,getEdit,getRecord,isDirty,hasPending,api,action,onPlay}){
  Object.assign(this,{root,getProject,getEdit,getRecord,isDirty,hasPending,api,action,onPlay});this.token=0;this.review=null;this.project=null;this.identity=null;root.hidden=true;
  root.innerHTML=`<details class="scene-review-shell"><summary><span>Review scene</span><small>Picture, titles & sound</small></summary><div class="scene-review-body">
   <p class="small">Play a saved section of your cut, with its camera coverage and sound mix. Local review, up to 30 seconds.</p>
   <div class="scene-review-range"><label>In frame<input id="scene-review-in" type="number" min="0" step="1" value="0"></label>
   <label>Out frame <span class="small">exclusive</span><input id="scene-review-out" type="number" min="2" step="1" value="48"></label>
   <button id="scene-review-run">Review saved range</button></div><p id="scene-review-status" class="small" role="status"></p><div id="scene-review-output"></div></div></details>`;
  this.$=q=>root.querySelector(q);
  for(const field of ['in','out'])this.$('#scene-review-'+field).addEventListener('input',()=>{this.invalidate('Range changed. Review this saved section again.');this.update();});
  this.$('#scene-review-run').onclick=()=>action(()=>this.run());
  this.$('details').addEventListener('toggle',()=>{if(!this.$('details').open)this.pause();});
 }
 pause(){this.$('video')?.pause();}
 stamp(){return JSON.stringify([this.getProject(),this.getRecord()?.revision,this.getRecord()?.plan?.hash,this.isDirty(),Boolean(this.hasPending())]);}
 invalidate(message){this.token++;this.review=null;const video=this.$('video');if(video){video.pause();video.removeAttribute('src');video.load();}this.$('#scene-review-output').replaceChildren();if(message)this.$('#scene-review-status').textContent=message;}
 update(){
  const project=this.getProject(),record=this.getRecord(),edit=this.getEdit();this.root.hidden=!project||!record||!edit;
  if(this.root.hidden){this.invalidate();this.project=null;this.identity=null;return;}
  const identity=this.stamp(),frames=record.plan?.frames??0,[n,d=1]=String(record.plan?.fps||edit.fps).split('/').map(Number),fps=n/d;
  if(this.project!==project){this.invalidate();this.$('#scene-review-in').value=0;this.$('#scene-review-out').value=Math.min(frames,Math.floor(30*fps));this.$('#scene-review-status').textContent='Choose an interval on the saved scene clock.';}
  else if(this.identity!==identity)this.invalidate('The cut or its draft changed. Review the saved version again.');
  this.project=project;this.identity=identity;this.$('#scene-review-in').max=Math.max(0,frames-2);this.$('#scene-review-out').max=frames;
  const start=Number(this.$('#scene-review-in').value),end=Number(this.$('#scene-review-out').value),pending=this.isDirty()||this.hasPending();
  const valid=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end-start>=2&&end<=frames&&(end-start)/fps<=30;
  this.$('#scene-review-run').disabled=Boolean(pending)||!valid;
  if(pending)this.$('#scene-review-status').textContent='Apply pending text or direction changes and save the cut before reviewing.';
  else if(!valid)this.$('#scene-review-status').textContent=`Choose at least 2 frames inside this ${frames}-frame cut, up to 30 seconds.`;
 }
 async run(){
  this.update();if(this.$('#scene-review-run').disabled)throw Error('Save the cut and choose a valid scene range first.');
  const project=this.getProject(),record=this.getRecord(),identity=this.stamp(),start=Number(this.$('#scene-review-in').value),end=Number(this.$('#scene-review-out').value);
  this.invalidate();const token=this.token;this.$('#scene-review-status').textContent='Building this saved section locally…';
  try{
   const out=await this.api(`/api/media/productions/${encodeURIComponent(project)}/review`,{method:'POST',body:JSON.stringify({baseRevision:record.revision,startFrame:start,endFrame:end,frameCount:8})});
   if(token!==this.token||identity!==this.stamp()||start!==Number(this.$('#scene-review-in').value)||end!==Number(this.$('#scene-review-out').value))return;
   if(out.projectId!==project||out.baseRevision!==record.revision||out.startFrame!==start||out.endFrame!==end)throw Error('scene_review_context_conflict');
   this.review=out;this.render();
  }catch(error){if(token===this.token)this.$('#scene-review-status').textContent=`Review unavailable: ${error.message.replaceAll('_',' ')}.`;throw error;}
 }
 render(){
  const r=this.review;this.$('#scene-review-status').textContent=`Saved revision ${r.baseRevision} · scene frames [${r.startFrame}, ${r.endFrame}) · ${r.preview.durationSeconds.toFixed(2)}s · ${r.preview.audio==='mixed'?'authored sound mix':'no authored sound'}`;
  this.$('#scene-review-output').innerHTML=`<video id="scene-review-video" controls playsinline preload="metadata" src="${esc(r.preview.url)}" aria-label="Saved scene review"></video>
   <div class="scene-review-frames">${r.frames.map(f=>`<button class="scene-review-frame" data-review-frame="${f.previewFrame}" aria-label="Seek to scene frame ${f.sceneFrame}"><img src="${esc(f.url)}" alt="Composite scene frame ${f.sceneFrame}"><span>Frame ${f.sceneFrame}</span></button>`).join('')}</div>
   <p class="small">${r.frames.length} sampled frames, up to ${r.sampling.maxGapFrames} frames between samples. Play the section to judge motion${r.audio?' and sound':''}. ${r.audio?`<a href="${esc(r.audio.waveUrl)}" download="scene-review.wav">Exact mix WAV</a>`:''}</p>
   <p class="small scene-review-note">Unmanaged SDR review. Sidecar-only captions remain separate. This preview belongs to the saved revision above.</p>`;
  this.$('#scene-review-video').addEventListener('play',()=>this.onPlay?.());
  for(const button of this.root.querySelectorAll('[data-review-frame]'))button.onclick=()=>{const video=this.$('#scene-review-video'),[n,d=1]=r.fps.split('/').map(Number),time=Number(button.dataset.reviewFrame)*d/n;const seek=()=>{if(video.isConnected){video.pause();video.currentTime=time;}};if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});};
 }
}
