const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({goal:'',continuity:[],query:''});
const seconds=(frame,fps)=>{const [n,d=1]=String(fps).split('/').map(Number);return (frame*d/n).toFixed(2);};

/** Artist intent stays attached to its shot. A proposal never edits by itself. */
export class DirectionRoom {
  constructor(options){
    Object.assign(this,options);this.project=null;this.target=null;this.direction=null;this.proposal=null;this.candidate=null;this.pending=false;this.token=0;this.loading=false;
    this.root.innerHTML=`<h2>Direct this shot</h2><p class="direction-intro">Give the scene a purpose. Find a take that serves it.</p>
      <label>Shot<select id="direction-shot"></select></label><p id="direction-clock" class="small"></p>
      <details id="direction-brief" open><summary>Scene intent & continuity</summary>
        <label>What should this shot do?<textarea id="direction-goal" rows="3" maxlength="2000" placeholder="Let the hesitation land before Sol releases the orb."></textarea></label>
        <label>What must carry through? <span>One requirement per line</span><textarea id="direction-continuity" rows="3" placeholder="Orb in the left hand\nRain and blue coat continue"></textarea></label>
        <label>Find footage by your words<input id="direction-query" maxlength="240" placeholder="orb, close-up…"></label>
        <p class="small">Matches saved moment names, notes, tags and filenames. Leave blank to browse moments. Scene intent guides your review.</p>
        <button id="direction-save" class="secondary">Save direction</button>
      </details>
      <button id="direction-plan">Find shot proposals</button><p id="direction-status" class="small" role="status"></p><button id="direction-retry" class="secondary" hidden>Retry loading direction</button>
      <div id="direction-results"></div><section id="direction-review" aria-label="Review selected shot proposal"></section>`;
    this.$=q=>this.root.querySelector(q);
    this.$('#direction-shot').onchange=()=>this.focusShot(this.$('#direction-shot').value).catch(e=>this.notify(e.message));
    for(const id of ['#direction-goal','#direction-continuity','#direction-query'])this.$(id).oninput=()=>{
      this.pending=JSON.stringify(this.form())!==JSON.stringify(this.direction?.brief||empty());this.renderReview();this.refreshStatus();
    };
    this.$('#direction-save').onclick=()=>this.run(()=>this.saveDirection());
    this.$('#direction-plan').onclick=()=>this.run(()=>this.plan());
    this.$('#direction-retry').onclick=()=>this.focusShot(this.target).catch(e=>this.notify(e.message));
    this.root.addEventListener('shutter:focus-shot',e=>this.focusShot(e.detail.clipId).catch(error=>this.notify(error.message)));
    this.update();
  }
  run(fn){if(this.isBusy()||this.loading)return;return this.action(fn);}
  form(){return {goal:this.$('#direction-goal').value.trim(),continuity:this.$('#direction-continuity').value.split('\n').map(s=>s.trim()).filter(Boolean),query:this.$('#direction-query').value.trim()};}
  fill(brief){this.$('#direction-goal').value=brief.goal;this.$('#direction-continuity').value=brief.continuity.join('\n');this.$('#direction-query').value=brief.query;this.pending=false;}
  url(){return `/api/media/productions/${this.project}/direction/${this.target}`;}
  reset(){this.token++;this.project=this.getProject();this.target=null;this.direction=null;this.proposal=null;this.candidate=null;this.loading=false;this.loadError=false;this.fill(empty());this.renderProposal();}
  update(){
    if(this.project!==this.getProject())this.reset();
    const edit=this.getEdit(),clips=edit?.clips||[];
    this.$('#direction-shot').innerHTML=clips.map((c,i)=>`<option value="${esc(c.id)}">${i+1}. ${esc(this.getState().assets.find(a=>a.id===c.assetId)?.name||c.id)}</option>`).join('');
    if(this.target&&!clips.some(c=>c.id===this.target))this.$('#direction-shot').insertAdjacentHTML('beforeend',`<option value="${esc(this.target)}">Removed shot · ${esc(this.target)}</option>`);
    this.$('#direction-shot').value=this.target||'';this.refreshStatus();
  }
  async focusShot(id){
    if(this.project!==this.getProject())this.reset();
    const target=id||this.getEdit()?.clips[0]?.id;if(!target){this.update();return;}
    if(target===this.target&&!this.loadError){this.update();return;}
    if(this.pending&&!confirm('Discard unfinished direction and switch shots?')){this.$('#direction-shot').value=this.target;return;}
    this.clearAudition();this.target=target;this.direction=null;this.proposal=null;this.candidate=null;this.fill(empty());this.$('#direction-brief').open=true;
    const token=++this.token,project=this.project;this.loading=true;this.loadError=false;this.renderProposal();this.update();
    try{
      if(!this.getRecord()?.timeline.clips.some(c=>c.id===target))return;
      const value=await this.api(this.url());
      if(token!==this.token||project!==this.getProject())return;
      this.direction=value.direction;this.proposal=value.proposal;this.fill(value.direction?.brief||empty());this.renderProposal();this.$('#direction-brief').open=!this.proposal;
    }catch(error){if(token===this.token)this.loadError=true;throw error;}
    finally{if(token===this.token){this.loading=false;this.update();}}
  }
  refreshStatus(){
    const edit=this.getEdit(),clip=edit?.clips.find(c=>c.id===this.target),saved=this.getRecord()?.timeline.clips.some(c=>c.id===this.target);
    const blocked=!this.project||!clip||this.loading||this.loadError||this.recoveryBlocked();
    this.$('#direction-brief').inert=this.loading||this.loadError||this.recoveryBlocked();
    this.$('#direction-retry').hidden=!this.loadError;
    this.$('#direction-save').disabled=blocked||!saved;
    this.$('#direction-plan').disabled=blocked;
    this.$('#direction-plan').textContent=this.isDirty()?'Save cut & find proposals':'Find shot proposals';
    let at=0;for(const c of edit?.clips||[]){if(c.id===this.target)break;at+=c.frames;}
    this.$('#direction-clock').textContent=clip?`Scene ${seconds(at,edit.fps)}–${seconds(at+clip.frames,edit.fps)}s · ${clip.frames} frames. Replacement keeps this timing.`:'Select a timeline shot to begin.';
    this.stale=!!this.proposal&&(this.isDirty()||this.pending||this.proposal.baseRevision!==this.getRecord()?.revision||this.proposal.directionRevision!==this.direction?.revision);
    this.$('#direction-status').textContent=this.loading?'Loading shot direction…':this.loadError?'Direction could not be loaded. Retry to recover the saved notes.':!clip?'Choose a shot.':this.pending?'Direction changed. Find proposals again to use these notes.':this.stale?'The cut or direction changed. Rebuild proposals before applying.':this.isDirty()?'Finding proposals saves your current cut first.':this.proposal?`${this.proposal.candidates.length} proposals from saved moments. Continuity needs your review.`:!saved?'Save the cut to attach direction to this new shot.':'Planning uses local source notes. No generation credits.';
    for(const b of this.root.querySelectorAll('[data-direction-candidate]'))b.disabled=blocked;
    if(this.$('#direction-audition'))this.$('#direction-audition').disabled=blocked||this.stale||!this.candidate?.fits;
    this.updateAcceptance();
  }
  updateAcceptance(){
    const button=this.$('#direction-apply');if(!button)return;
    const checks=[...this.root.querySelectorAll('[data-continuity-check]')];
    button.disabled=this.recoveryBlocked()||this.loading||this.stale||!this.candidate?.fits||this.candidate.current||!this.$('#direction-reviewed').checked||checks.some(c=>!c.checked);
  }
  async saveDirection(){
    if(!this.getRecord()?.timeline.clips.some(c=>c.id===this.target))throw Error('Save the cut before attaching direction to this shot.');
    const result=await this.api(this.url(),{method:'PUT',body:JSON.stringify({baseRevision:this.direction?.revision||0,brief:this.form()})});
    this.direction=result;this.fill(result.brief);this.renderReview();this.refreshStatus();this.notify('Direction saved. The cut is unchanged.');
  }
  async plan(){
    if(!this.form().goal)throw Error('Write what this shot should do first.');
    this.clearAudition();await this.saveCut();
    if(this.pending||!this.direction)await this.saveDirection();
    this.proposal=await this.api(this.url()+'/proposals',{method:'POST',body:JSON.stringify({baseRevision:this.getRecord().revision,directionRevision:this.direction.revision})});
    this.candidate=null;this.renderProposal();this.$('#direction-brief').open=false;this.refreshStatus();this.notify('Shot proposals ready. Review a source against your intent and continuity notes.');
  }
  renderProposal(){
    const p=this.proposal;
    this.$('#direction-results').innerHTML=!p?'':!p.candidates.length?'<p class="direction-empty">No matching visual moments yet. Open Moments to mark and describe a useful source range, or try fewer words.</p>':
      `<p class="small">${p.search.shown} shown of ${p.search.total} matching moments</p>`+p.candidates.map(c=>`<button class="direction-candidate secondary" data-direction-candidate="${esc(c.momentId)}"><span class="direction-thumb">${c.mediaKind==='image'?`<img src="/media/${c.assetId}" alt="">`:`<video src="/media/${c.assetId}#t=${c.startUs/1e6}" muted playsinline preload="metadata" aria-hidden="true"></video>`}</span><span><strong>${esc(c.label)}</strong><small>${(c.startUs/1e6).toFixed(2)}–${(c.endUs/1e6).toFixed(2)}s source · ${c.current?'Current selection':c.fits?'Fits shot':esc((c.reason||'Unavailable').replaceAll('_',' '))}</small></span></button>`).join('');
    for(const b of this.root.querySelectorAll('[data-direction-candidate]'))b.onclick=()=>{if(this.isBusy())return;this.clearAudition();this.candidate=p.candidates.find(c=>c.momentId===b.dataset.directionCandidate);this.renderReview();this.refreshStatus();};
    this.renderReview();
  }
  renderReview(){
    const c=this.candidate,p=this.proposal,host=this.$('#direction-review');if(!c||!p){host.replaceChildren();return;}
    host.innerHTML=`<h3>${esc(c.label)}</h3><p class="direction-goal">${esc(p.brief.goal)}</p>
      <p class="small">Source: ${esc(c.assetName)} · ${(c.startUs/1e6).toFixed(2)}–${(c.endUs/1e6).toFixed(2)}s. Replaces scene ${seconds(p.shot.at,p.fps)}–${seconds(p.shot.end,p.fps)}s.</p>
      <p class="direction-observation"><span>Artist-authored source note</span>${esc(c.notes||'No description saved. Review the source picture.')}<small>${esc(c.tags.join(', '))}</small></p>
      ${p.shot.coverage.length?'<p class="small">Camera coverage remains over this interval. Audition includes it; the main view returns at elapsed scene time.</p>':''}
      <div class="direction-actions"><button id="direction-audition" class="secondary">Audition in scene</button><button id="direction-end-audition" class="secondary">End audition</button></div>
      <fieldset class="direction-checks"><legend>Continuity to review</legend>${p.brief.continuity.map((s,i)=>`<label class="check"><input type="checkbox" data-continuity-check="${i}">${esc(s)}</label>`).join('')}
      <label class="check"><input type="checkbox" id="direction-reviewed">I reviewed this take in context.</label></fieldset>
      <p class="small">These are your review decisions. Shutter has not verified identity or physical continuity.</p>
      <button id="direction-apply" disabled>Use this shot · keep timing</button>`;
    for(const el of host.querySelectorAll('input[type="checkbox"]'))el.onchange=()=>this.updateAcceptance();
    this.$('#direction-audition').onclick=()=>this.run(()=>{if(this.stale)throw Error('Rebuild changed proposals first.');this.audition(this.target,c);});
    this.$('#direction-end-audition').onclick=()=>this.run(()=>this.clearAudition());
    this.$('#direction-apply').onclick=()=>this.run(()=>this.accept());this.refreshStatus();
  }
  async accept(){
    if(this.isDirty()||this.pending||this.stale)throw Error('The cut or direction changed. Rebuild proposals first.');
    const checkedContinuity=[...this.root.querySelectorAll('[data-continuity-check]:checked')].map(el=>Number(el.dataset.continuityCheck));
    const record=await this.api(this.url()+'/accept',{method:'POST',body:JSON.stringify({proposalId:this.proposal.id,momentId:this.candidate.momentId,reviewed:this.$('#direction-reviewed').checked,checkedContinuity})});
    this.clearAudition();this.candidate=null;this.applySaved(record);this.renderReview();this.refreshStatus();this.notify('Shot accepted. Timing and coverage are preserved. Undo restores the previous cut.');
  }
}
