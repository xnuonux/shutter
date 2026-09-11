import {secondsUs,normalizeMoment,rangeFitsTake} from './memory-contract.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=us=>(us/1e6).toFixed(3);
const exactTime=us=>(us/1e6).toFixed(6);
/** One connected notebook/search/shot-shelf. Network results remain bound to their original context. */
export class MemoryRoom {
  constructor({root,getEdit,getRecord,getState,getSource,getProject,isDirty,isBusy,api,action,notify,saveCut,applySaved,audition,clearAudition,openSource,getSourceTime}){
    Object.assign(this,{root,getEdit,getRecord,getState,getSource,getProject,isDirty,isBusy,api,action,notify,saveCut,applySaved,audition,clearAudition,openSource,getSourceTime});
    this.project=null;this.searchToken=0;this.stackToken=0;this.scoutToken=0;this.results=[];this.pending=false;this.note=null;this.formAsset=null;this.stack=null;this.scout=null;this.nextOffset=null;
    root.innerHTML=`<details class="memory-room"><summary>Production Memory <span>Find a moment. Compare a take. Keep your song.</span></summary>
      <p class="small">Local words, source ranges and a visual scout. Search matches your labels, notes, tags and filenames—not automatic subject recognition.</p>
      <div class="memory-columns"><section><div class="memory-bar"><input id="memory-query" type="search" placeholder="Night close-up, red light, chorus…" aria-label="Search production memory"><label class="check"><input id="memory-favorites" type="checkbox">Favorites</label><button id="memory-search" class="secondary">Find moments</button></div><p id="memory-count" class="small">Open a production to begin.</p><div id="memory-results" class="memory-results"></div><button id="memory-more" class="secondary" hidden>More results</button>
      <details class="memory-author"><summary>Mark a useful source range</summary><button id="memory-new" class="secondary">New moment from selected material</button><p id="memory-source" class="small"></p><div class="memory-range"><label>Source in · seconds<input id="memory-in" value="0" inputmode="decimal"></label><label>Source out · seconds<input id="memory-out" value="3" inputmode="decimal"></label></div><div class="memory-bar"><button id="memory-in-now" class="secondary">In at source playhead</button><button id="memory-out-now" class="secondary">Out at source playhead</button><button id="memory-scout" class="secondary">Scout this range</button></div><label>Name the moment<input id="memory-label" maxlength="160" placeholder="The close-up before the chorus"></label><label>What makes it useful?<textarea id="memory-notes" rows="2" maxlength="2000" placeholder="Your observation, not a machine's guess."></textarea></label><label>Tags · comma separated<input id="memory-tags" placeholder="night, close-up, performance"></label><label class="check"><input id="memory-favorite" type="checkbox">Favorite</label><div class="memory-bar"><button id="memory-save">Save moment</button><button id="memory-discard" class="secondary">Discard form</button></div><p id="memory-form-status" class="small"></p></details><div id="memory-scout-results" class="memory-scout-grid"></div></section>
      <section class="memory-takes"><p class="eyebrow">TAKE STACK</p><label>Shot to compare<select id="memory-shot"></select></label><button id="memory-load-stack" class="secondary">Save cut & load takes</button><p id="memory-stack-status" class="small">Collect a found moment without changing the cut. Audition before choosing.</p><div id="memory-stack"></div><button id="memory-original" class="secondary">End audition · hear/see current cut</button><p class="small">Using a take preserves shot duration, framing, music, sound and text. Too-short marked ranges are not stretched. Audition playback is approximate.</p><button id="memory-export" class="secondary">Export memory notebook JSON</button></section></div></details>`;
    this.$=q=>root.querySelector(q);const bind=(id,fn)=>this.$(id).onclick=()=>this.run(fn);
    this.$('details').addEventListener('toggle',()=>{if(this.$('details').open){this.update();this.search().catch(e=>notify(e.message));}});
    bind('#memory-search',()=>this.search());bind('#memory-more',()=>this.search(true));
    this.$('#memory-query').oninput=()=>{clearTimeout(this.timer);this.searchToken++;this.timer=setTimeout(()=>this.search().catch(e=>notify(e.message)),200);};
    this.$('#memory-favorites').onchange=()=>this.run(()=>this.search());
    this.$('#memory-shot').onchange=()=>{this.stackToken++;this.stack=null;this.clearAudition();this.renderStack();};
    bind('#memory-new',()=>{this.assertForm();this.fill(null,this.getSource());this.$('.memory-author').open=true;});
    bind('#memory-discard',()=>{this.pending=false;this.fill(null,this.getSource());});
    for(const id of ['#memory-in','#memory-out','#memory-label','#memory-notes','#memory-tags','#memory-favorite'])this.$(id).addEventListener('input',()=>{this.pending=true;this.formStatus();});
    for(const [button,input] of [['#memory-in-now','#memory-in'],['#memory-out-now','#memory-out']])bind(button,()=>{if(this.getSource()!==this.formAsset)throw Error('Select the material attached to this form first.');const t=this.getSourceTime();if(!Number.isFinite(t))throw Error('Choose a playable source first.');this.$(input).value=t.toFixed(6);this.pending=true;this.formStatus();});
    bind('#memory-save',()=>this.save());bind('#memory-scout',()=>this.scoutRange());bind('#memory-load-stack',()=>this.loadStack(true));
    bind('#memory-original',()=>{this.clearAudition();this.$('#memory-stack-status').textContent='Audition ended. Your authored cut is unchanged.';});
    bind('#memory-export',async()=>{this.assertForm();const data=await api(`/api/media/productions/${this.getProject()}/memory-export`);this.download(JSON.stringify(data,null,2),'shutter-production-memory.json');});
  }
  run(fn){if(this.isBusy())return;return this.action(fn);}
  assertForm(){if(this.pending)throw Error('Save or discard the unfinished moment form first.');}
  formStatus(){this.$('#memory-form-status').textContent=this.pending?'Moment form not saved. Save it to make these words searchable.':'';}
  update(){
    const project=this.getProject(),edit=this.getEdit();if(!project||!edit)return;
    if(project!==this.project){this.project=project;this.searchToken++;this.stackToken++;this.scoutToken++;this.pending=false;this.note=null;this.stack=null;this.results=[];this.scout=null;this.$('#memory-results').replaceChildren();this.$('#memory-scout-results').replaceChildren();this.$('#memory-more').hidden=true;this.fill(null,this.getSource());}
    const chosen=this.$('#memory-shot').value;
    this.$('#memory-shot').innerHTML=edit.clips.map((c,i)=>`<option value="${esc(c.id)}">${i+1}. ${esc(this.getState().assets.find(a=>a.id===c.assetId)?.name||c.id)} · ${c.frames}f</option>`).join('');
    if(edit.clips.some(c=>c.id===chosen))this.$('#memory-shot').value=chosen;
    if(!this.formAsset&&!this.pending)this.fill(null,this.getSource());this.renderStack();
  }
  fill(note,assetId){
    this.note=note;this.formAsset=note?.assetId||assetId||null;const asset=this.getState().assets.find(a=>a.id===this.formAsset);
    this.$('#memory-source').textContent=asset?`Attached to ${asset.name}. Saved words are artist-authored.`:'Select source material, then choose New moment.';
    this.$('#memory-in').value=note?exactTime(note.startUs):'0';this.$('#memory-out').value=note?exactTime(note.endUs):String(Math.min(asset?.media?.duration||3,3));
    this.$('#memory-label').value=note?.label||'';this.$('#memory-notes').value=note?.notes||'';this.$('#memory-tags').value=note?.tags.join(', ')||'';this.$('#memory-favorite').checked=note?.favorite||false;this.pending=false;this.formStatus();
  }
  async save(){
    const project=this.getProject();if(!project||!this.formAsset)throw Error('Select a production and source material.');
    const moment=normalizeMoment({id:this.note?.id||'moment_'+crypto.randomUUID(),assetId:this.formAsset,startUs:secondsUs(this.$('#memory-in').value),endUs:secondsUs(this.$('#memory-out').value),
      label:this.$('#memory-label').value,notes:this.$('#memory-notes').value,tags:this.$('#memory-tags').value.split(',').map(s=>s.trim()).filter(Boolean),favorite:this.$('#memory-favorite').checked});
    const snapshot=this.formSnapshot(),saved=await this.api(`/api/media/productions/${project}/memory`,{method:'POST',body:JSON.stringify({moment,baseRevision:this.note?.revision||0})});
    if(project!==this.getProject())return;if(snapshot===this.formSnapshot())this.fill(saved);else if(this.formAsset===saved.assetId)this.note=saved;await this.search();this.notify('Moment saved. Its exact source range is now searchable; the cut is unchanged.');
  }
  formSnapshot(){return JSON.stringify([this.formAsset,...['#memory-in','#memory-out','#memory-label','#memory-notes','#memory-tags'].map(id=>this.$(id).value),this.$('#memory-favorite').checked]);}
  async search(more=false){
    const project=this.getProject();if(!project)return;const token=++this.searchToken,q=this.$('#memory-query').value,favorite=this.$('#memory-favorites').checked;
    this.$('#memory-count').textContent='Searching locally… prior results remain visible.';
    let result;try{result=await this.api(`/api/media/productions/${project}/memory?q=${encodeURIComponent(q)}&favorite=${favorite}&offset=${more?this.nextOffset||0:0}`);}catch(e){if(token===this.searchToken)this.$('#memory-count').textContent='Search failed; previous results have not been refreshed.';throw e;}
    if(token!==this.searchToken||project!==this.getProject())return;
    this.results=more?[...this.results,...result.results]:result.results;this.nextOffset=result.nextOffset;
    this.$('#memory-count').textContent=`${result.total} matching moments · local word/prefix search · artist-authored evidence`;
    this.$('#memory-more').hidden=result.nextOffset===null;this.renderResults();
  }
  renderResults(){
    this.$('#memory-results').innerHTML=this.results.map(m=>`<article class="memory-card"><span class="memory-badge">${m.favorite?'FAVORITE · ':''}ARTIST NOTE</span><strong>${esc(m.label)}</strong><p>${esc(m.notes)}</p><small>${esc(m.assetName)} · ${time(m.startUs)}–${time(m.endUs)}s<br>${esc(m.tags.join(' / '))}</small><div class="memory-bar"><button class="secondary" data-peek="${esc(m.id)}">View range</button><button class="secondary" data-collect="${esc(m.id)}">Collect for shot</button><button class="secondary" data-note="${esc(m.id)}">Edit note</button><button class="secondary" data-delete="${esc(m.id)}">Delete note</button></div></article>`).join('')||'<p class="small">No moments found. Mark a useful range, give it words, and it becomes part of this production’s memory.</p>';
    for(const b of this.root.querySelectorAll('[data-peek]'))b.onclick=()=>this.run(()=>{const m=this.results.find(m=>m.id===b.dataset.peek);return this.openSource(m.assetId,m.startUs/1e6,m.endUs/1e6);});
    for(const b of this.root.querySelectorAll('[data-note]'))b.onclick=()=>this.run(()=>{this.assertForm();this.fill(this.results.find(m=>m.id===b.dataset.note));this.$('.memory-author').open=true;});
    for(const b of this.root.querySelectorAll('[data-delete]'))b.onclick=()=>this.run(async()=>{this.assertForm();const m=this.results.find(m=>m.id===b.dataset.delete);if(!confirm('Delete this searchable note? Collected take snapshots and media stay intact.'))return;await this.api(`/api/media/productions/${this.getProject()}/memory/${m.id}`,{method:'DELETE',body:JSON.stringify({baseRevision:m.revision})});if(this.note?.id===m.id)this.fill(null,this.getSource());await this.search();});
    for(const b of this.root.querySelectorAll('[data-collect]'))b.onclick=()=>this.run(()=>this.collect(this.results.find(m=>m.id===b.dataset.collect)));
  }
  async loadStack(save=false){
    const project=this.getProject(),shot=this.$('#memory-shot').value,token=++this.stackToken;if(!shot)throw Error('Add a picture shot before collecting alternatives.');
    if(save){this.assertForm();await this.saveCut();}
    const stack=await this.api(`/api/media/productions/${project}/takes/${encodeURIComponent(shot)}`);
    if(token!==this.stackToken||project!==this.getProject()||shot!==this.$('#memory-shot').value)return null;this.stack=stack;this.renderStack();return stack;
  }
  async collect(moment){
    this.assertForm();const project=this.getProject(),shot=this.$('#memory-shot').value;const stack=await this.loadStack(true);if(!stack)return;
    const requestToken=this.stackToken;const next=await this.api(`/api/media/productions/${project}/takes/${encodeURIComponent(shot)}`,{method:'POST',body:JSON.stringify({baseRevision:this.getRecord().revision,stackRevision:stack.revision,momentId:moment.id,momentRevision:moment.revision})});
    if(requestToken!==this.stackToken||project!==this.getProject()||shot!==this.$('#memory-shot').value)return;this.stack=next;this.renderStack();this.notify('Take collected with the original retained. Audition it before changing the cut.');
  }
  renderStack(){
    const stack=this.stack,shot=this.$('#memory-shot').value;
    const stale=!stack||stack.clipId!==shot||stack.timelineRevision!==this.getRecord()?.revision||this.isDirty();
    this.$('#memory-stack-status').textContent=!stack?'Load a saved shot, then collect a found moment.':stale?'Saved cut or draft changed. Reload takes before auditioning or accepting.':`${stack.candidates.length} alternatives · ${stack.shotFrames} output frames locked · original retained`;
    this.$('#memory-stack').innerHTML=stack?.clipId===shot?stack.candidates.map(c=>`<article class="memory-take ${c.current?'current':''}"><span class="memory-badge">${c.current?'CURRENT CUT':c.evidence==='saved-shot'?'PRESERVED SELECTION':'ALTERNATIVE'}</span><strong>${esc(c.label)}</strong><small>${time(Number(c.sourceStart.split('/')[0])/Number(c.sourceStart.split('/')[1]||1)*1e6)}s source in ${c.fits?'· fits':'· '+esc(c.reason||'unavailable')}</small><div class="memory-bar"><button class="secondary" data-audition="${esc(c.id)}" ${stale||!c.fits?'disabled':''}>Audition</button><button data-accept="${esc(c.id)}" ${stale||!c.fits||c.current?'disabled':''}>Use take · keep timing</button></div></article>`).join(''):'';
    for(const b of this.root.querySelectorAll('[data-audition]'))b.onclick=()=>this.run(()=>{this.assertForm();const c=stack.candidates.find(c=>c.id===b.dataset.audition),clip=this.getEdit().clips.find(c=>c.id===shot),profile=this.getState().assets.find(a=>a.id===c.assetId)?.media;if(!profile||!rangeFitsTake(c,clip,this.getEdit().fps,profile).fits)throw Error('Take no longer fits this shot.');this.audition(shot,c);this.$('#memory-stack-status').textContent=`AUDITIONING ${c.label} · not saved · song unchanged`;});
    for(const b of this.root.querySelectorAll('[data-accept]'))b.onclick=()=>this.run(async()=>{
      this.assertForm();const project=this.getProject();if(this.isDirty()||stack.timelineRevision!==this.getRecord().revision)throw Error('Reload takes for the current cut first.');
      const accepted=await this.api(`/api/media/productions/${project}/takes/${encodeURIComponent(shot)}/accept`,{method:'POST',body:JSON.stringify({baseRevision:stack.timelineRevision,stackRevision:stack.revision,candidateId:b.dataset.accept})});
      if(project!==this.getProject())return;this.clearAudition();this.applySaved(accepted);await this.loadStack();this.notify('Take selected. The song, sound lanes, text, framing and cut duration stayed fixed. Undo restores the previous selection.');
    });
  }
  async scoutRange(){
    const project=this.getProject(),assetId=this.formAsset,startUs=secondsUs(this.$('#memory-in').value),endUs=secondsUs(this.$('#memory-out').value),token=++this.scoutToken;
    if(!assetId)throw Error('Choose source footage first.');this.notify('Scouting the selected range locally. No media leaves this computer.');
    const scout=await this.api(`/api/media/assets/${assetId}/scout`,{method:'POST',body:JSON.stringify({startUs,endUs})});
    if(token!==this.scoutToken||project!==this.getProject()||assetId!==this.formAsset||startUs!==secondsUs(this.$('#memory-in').value)||endUs!==secondsUs(this.$('#memory-out').value))return;this.scout=scout;
    this.$('#memory-scout-results').innerHTML=`<p class="small">${scout.sampledRanges} / ${scout.totalRanges} browsing ranges pictured. Scene changes are visual observations, not story labels. Thumbnails are unmanaged-color previews.</p>`+scout.images.map(i=>`<button class="scout-tile secondary" data-range="${i.index}"><img loading="lazy" src="/api/media/scouts/${scout.id}/images/${i.index}" alt="Source sample at ${time(i.timeUs)} seconds"><span>${time(i.startUs)}–${time(i.endUs)}s</span></button>`).join('');
    for(const b of this.root.querySelectorAll('[data-range]'))b.onclick=()=>this.run(()=>{const i=scout.images.find(i=>i.index===Number(b.dataset.range));this.$('#memory-in').value=exactTime(i.startUs);this.$('#memory-out').value=exactTime(i.endUs);this.pending=true;this.formStatus();return this.openSource(assetId,i.startUs/1e6,i.endUs/1e6);});
    this.notify('Scout ready. Choose a range and describe what you actually see.');
  }
  download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
