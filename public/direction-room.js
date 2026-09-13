import {secondsUs} from './memory-contract.mjs';
import {placements} from './music-edit.mjs';
import {ACTION_VERSION} from './action-contract.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({goal:'',continuity:[],query:''});
const seconds=(frame,fps)=>{const [n,d=1]=String(fps).split('/').map(Number);return (frame*d/n).toFixed(2);};

/** Artist intent stays attached to its shot. A proposal never edits by itself. */
export class DirectionRoom {
  constructor(options){
    Object.assign(this,options);this.project=null;this.target=null;this.direction=null;this.proposal=null;this.candidate=null;this.evidence=null;this.evidenceLoading=false;this.pending=false;this.token=0;this.loading=false;
    this.root.innerHTML=`<h2>Direct this shot</h2><p class="direction-intro">Give the scene a purpose. Find a take that serves it.</p>
      <label>Shot<select id="direction-shot"></select></label><p id="direction-clock" class="small"></p>
      <details id="direction-brief" open><summary>Scene intent & continuity</summary>
        <label>Propose<select id="direction-mode"><option value="replace">A different take for this shot</option><option value="coverage">A timed camera cutaway</option></select></label>
        <fieldset id="direction-coverage" hidden><legend>Keep the scene moving</legend><div class="direction-range"><label>Scene in · frame<input id="direction-coverage-at" type="number" min="0" step="1" value="0"></label><label>Scene out · frame<input id="direction-coverage-end" type="number" min="1" step="1" value="24"></label></div>
        <div class="direction-actions"><button id="direction-in-playhead" class="secondary">In at playhead</button><button id="direction-out-playhead" class="secondary">Out at playhead</button></div>
        <label>Advance into each marked source · seconds<input id="direction-source-offset" inputmode="decimal" value="0"></label><p class="small">Align the action in the alternate view with the covered scene time. The main footage keeps advancing underneath.</p></fieldset>
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
    const change=()=>{
      this.pending=JSON.stringify(this.form())!==JSON.stringify(this.direction?.brief||empty());this.token++;this.evidenceLoading=false;this.evidence=null;this.clearAudition();this.renderReview();this.refreshStatus();
    };
    for(const id of ['#direction-goal','#direction-continuity','#direction-query','#direction-mode','#direction-coverage-at','#direction-coverage-end','#direction-source-offset'])this.$(id).oninput=change;
    for(const [button,input] of [['#direction-in-playhead','#direction-coverage-at'],['#direction-out-playhead','#direction-coverage-end']])this.$(button).onclick=()=>{this.$(input).value=this.getFrame();change();};
    this.$('#direction-save').onclick=()=>this.run(()=>this.saveDirection());
    this.$('#direction-plan').onclick=()=>this.run(()=>this.plan());
    this.$('#direction-retry').onclick=()=>this.focusShot(this.target).catch(e=>this.notify(e.message));
    this.root.addEventListener('shutter:focus-shot',e=>this.focusShot(e.detail.clipId).catch(error=>this.notify(error.message)));
    this.update();
  }
  run(fn){if(this.isBusy()||this.loading)return;return this.action(fn);}
  form(){
    const value={goal:this.$('#direction-goal').value.trim(),continuity:this.$('#direction-continuity').value.split('\n').map(s=>s.trim()).filter(Boolean),query:this.$('#direction-query').value.trim()};
    if(this.$('#direction-mode').value==='coverage'){
      const frame=id=>this.$(id).value===''?null:Number(this.$(id).value);let sourceOffsetUs=null;try{sourceOffsetUs=secondsUs(this.$('#direction-source-offset').value);}catch{}
      value.coverage={at:frame('#direction-coverage-at'),end:frame('#direction-coverage-end'),sourceOffsetUs};
    }return value;
  }
  fill(brief){
    this.$('#direction-goal').value=brief.goal;this.$('#direction-continuity').value=brief.continuity.join('\n');this.$('#direction-query').value=brief.query;
    const shot=this.getEdit()?placements(this.getEdit()).find(c=>c.id===this.target):null;
    this.$('#direction-mode').value=brief.coverage?'coverage':'replace';this.$('#direction-coverage-at').value=brief.coverage?.at??shot?.at??0;this.$('#direction-coverage-end').value=brief.coverage?.end??shot?.end??24;this.$('#direction-source-offset').value=(brief.coverage?.sourceOffsetUs||0)/1e6;this.pending=false;
  }
  url(){return `/api/media/productions/${this.project}/direction/${this.target}`;}
  reset(){this.token++;this.project=this.getProject();this.target=null;this.direction=null;this.proposal=null;this.candidate=null;this.evidence=null;this.evidenceLoading=false;this.loading=false;this.loadError=false;this.fill(empty());this.renderProposal();}
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
    this.clearAudition();this.target=target;this.direction=null;this.proposal=null;this.candidate=null;this.evidence=null;this.fill(empty());this.$('#direction-brief').open=true;
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
    for(const input of this.$('#direction-brief').querySelectorAll('input,textarea,select,button'))input.disabled=!!this.$('#direction-brief').inert;
    const coverage=this.form().coverage;this.$('#direction-coverage').hidden=!coverage;
    this.$('#direction-retry').hidden=!this.loadError;
    this.$('#direction-save').disabled=blocked||!saved;
    this.$('#direction-plan').disabled=blocked;
    this.$('#direction-plan').textContent=this.isDirty()?'Save cut & find proposals':'Find shot proposals';
    let at=0;for(const c of edit?.clips||[]){if(c.id===this.target)break;at+=c.frames;}
    this.$('#direction-clock').textContent=clip?`Scene ${seconds(at,edit.fps)}–${seconds(at+clip.frames,edit.fps)}s · ${clip.frames} frames. Replacement keeps this timing.`:'Select a timeline shot to begin.';
    if(clip&&coverage)this.$('#direction-clock').textContent=`Cutaway ${seconds(coverage.at,edit.fps)}–${seconds(coverage.end,edit.fps)}s. Return at scene ${seconds(coverage.end,edit.fps)}s.`;
    this.stale=!!this.proposal&&(this.isDirty()||this.pending||this.proposal.baseRevision!==this.getRecord()?.revision||this.proposal.directionRevision!==this.direction?.revision);
    if(this.stale&&(this.evidence||this.evidenceLoading)){this.token++;this.evidence=null;this.evidenceLoading=false;this.renderEvidence();}
    this.$('#direction-status').textContent=this.loading?'Loading shot direction…':this.loadError?'Direction could not be loaded. Retry to recover the saved notes.':!clip?'Choose a shot.':this.pending?'Direction changed. Find proposals again to use these notes.':this.stale?'The cut or direction changed. Rebuild proposals before applying.':this.isDirty()?'Finding proposals saves your current cut first.':this.proposal?`${this.proposal.candidates.length} proposals from saved moments. Continuity needs your review.`:!saved?'Save the cut to attach direction to this new shot.':'Planning uses local source notes. No generation credits.';
    for(const b of this.root.querySelectorAll('[data-direction-candidate]'))b.disabled=blocked;
    if(this.$('#direction-audition'))this.$('#direction-audition').disabled=blocked||this.stale||!this.candidate?.fits;
    if(this.$('#direction-evidence'))this.$('#direction-evidence').disabled=blocked||this.stale||!this.candidate?.fits;
    this.updateAcceptance();
  }
  updateAcceptance(){
    const button=this.$('#direction-apply');if(!button)return;
    const checks=[...this.root.querySelectorAll('[data-continuity-check]')];
    button.disabled=this.recoveryBlocked()||this.loading||this.stale||!this.candidate?.fits||this.candidate.current||!this.$('#direction-reviewed').checked||checks.some(c=>!c.checked)||(this.proposal?.interval&&!this.$('#direction-aligned').checked);
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
    for(const b of this.root.querySelectorAll('[data-direction-candidate]'))b.onclick=()=>{if(this.isBusy())return;this.clearAudition();this.evidence=null;this.candidate=p.candidates.find(c=>c.momentId===b.dataset.directionCandidate);this.renderReview();this.refreshStatus();};
    this.renderReview();
  }
  renderReview(){
    const c=this.candidate,p=this.proposal,host=this.$('#direction-review');if(!c||!p){host.replaceChildren();return;}
    const interval=p.interval,sourceEnd=interval?(c.startUs/1e6+Number(seconds(interval.frames,p.fps))).toFixed(2):(c.endUs/1e6).toFixed(2);
    const returnSource=interval?.returnTo?interval.returnTo.sourceStart.split('/').map(Number):null;
    host.innerHTML=`<h3>${esc(c.label)}</h3><p class="direction-goal">${esc(p.brief.goal)}</p>
      <p class="small">Source: ${esc(c.assetName)} · ${(c.startUs/1e6).toFixed(2)}–${sourceEnd}s. ${interval?'Covers':'Replaces'} scene ${seconds(interval?.at??p.shot.at,p.fps)}–${seconds(interval?.end??p.shot.end,p.fps)}s.</p>
      ${interval?`<p class="direction-return">${returnSource?`Return at scene ${seconds(interval.end,p.fps)}s to ${interval.returnTo.layer==='main'?'the main view':'existing coverage'}, source ${(returnSource[0]/(returnSource[1]||1)).toFixed(2)}s.`:'This cutaway reaches the end of the scene.'} The main footage and soundtrack stay fixed.</p>`:''}
      <p class="direction-observation"><span>${c.evidence==='director-authored'?'Director-authored source note':'Artist-authored source note'}</span>${esc(c.notes||'No description saved. Review the source picture.')}<small>${esc(c.tags.join(', '))}</small></p>
      ${p.shot.coverage.length?'<p class="small">Camera coverage remains over this interval. Audition includes it; the main view returns at elapsed scene time.</p>':''}
      <div class="direction-actions"><button id="direction-audition" class="secondary">Audition in scene</button><button id="direction-end-audition" class="secondary">End audition</button>${interval?'<button id="direction-evidence" class="secondary">Compare cut boundaries</button>':''}</div><section id="direction-evidence-panel" aria-live="polite"></section>
      <fieldset class="direction-checks"><legend>Continuity to review</legend>${p.brief.continuity.map((s,i)=>`<label class="check"><input type="checkbox" data-continuity-check="${i}">${esc(s)}</label>`).join('')}
      <label class="check"><input type="checkbox" id="direction-reviewed">I reviewed this take in context.</label></fieldset>
      ${interval?'<label class="check direction-alignment"><input type="checkbox" id="direction-aligned">I aligned the alternate action with this scene interval and checked the return.</label>':''}
      <p class="small">These are your review decisions. Shutter has not verified identity or physical continuity.</p>
      <button id="direction-apply" disabled>${interval?'Use this cutaway':'Use this shot · keep timing'}</button>`;
    for(const el of host.querySelectorAll('input[type="checkbox"]'))el.onchange=()=>this.updateAcceptance();
    this.$('#direction-audition').onclick=()=>this.run(()=>{if(this.stale)throw Error('Rebuild changed proposals first.');if(interval)this.auditionCoverage(this.target,c);else this.audition(this.target,c);});
    this.$('#direction-end-audition').onclick=()=>this.run(()=>this.clearAudition());
    if(this.$('#direction-evidence'))this.$('#direction-evidence').onclick=()=>this.run(()=>this.loadEvidence());
    this.$('#direction-apply').onclick=()=>this.run(()=>this.accept());this.refreshStatus();
    this.renderEvidence();
  }
  renderEvidence(){
    const host=this.$('#direction-evidence-panel');if(!host)return;
    if(this.evidenceLoading){host.innerHTML='<p class="small">Extracting boundary pictures…</p>';return;}
    if(!this.evidence){host.replaceChildren();return;}
    const frames=new Map(this.evidence.frames.map(f=>[f.role,f]));
    const groups=[['Entry across cut',['entry-before','entry-alternate']],['Entry at the same scene time',['entry-main','entry-alternate']],['Return at the same scene time',['return-main','return-alternate']],['Returning across cut',['return-alternate','return-after']]];
    const labels={'entry-before':'Before the cut','entry-main':'Main view','entry-alternate':'Alternate view','return-alternate':'Last alternate frame','return-main':'Main at the same time','return-after':'After the cut'};
    const picture=role=>{const f=frames.get(role);return f?`<figure><a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.url)}" width="${f.width}" height="${f.height}" alt="${esc(labels[role])}"></a><figcaption><strong>${esc(labels[role])}</strong><span>scene ${f.sceneFrame} · source ${esc(f.sourceStart)}s</span></figcaption></figure>`:`<p class="direction-evidence-absent">${esc(labels[role])} is absent at the scene edge.</p>`};
    const intent=this.evidence.intent||{};
    host.innerHTML=`<p class="small direction-evidence-note">Compare the cut, then check that both views show the same moment. Open a picture to see it larger.</p>${groups.map(([title,roles])=>`<section class="direction-evidence-group"><h4>${title}</h4><div class="direction-evidence-grid">${roles.map(picture).join('')}</div></section>`).join('')}<details class="direction-evidence-details"><summary>Saved intent & picture notes</summary>${(intent.directions||[]).map(d=>`<div class="direction-evidence-intent"><strong>${d.evidence==='director-authored'?'Director-authored':'Artist-authored'} intent · ${esc(d.clipId)}</strong><p>${esc(d.brief.goal)}</p>${d.brief.continuity.length?`<ul>${d.brief.continuity.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:''}</div>`).join('')}${intent.missingClipIds?.length?'<p class="small">Some shots here have no saved direction.</p>':''}${intent.truncated?'<p class="small">Only the first 16 shot directions are included.</p>':''}${this.evidence.notes?.length?`<p class="small">${this.evidence.notes.map(esc).join(' ')}</p>`:''}</details>`;
  }
  async loadEvidence(){
    if(!this.proposal?.interval||!this.candidate?.command) return;
    if(this.stale||this.isDirty()||this.pending)throw Error('Rebuild changed proposals first.');
    const token=++this.token, project=this.project, target=this.target, proposal=this.proposal, candidate=this.candidate, revision=this.getRecord()?.revision, command=candidate.command;
    this.evidenceLoading=true;this.evidence=null;this.renderEvidence();
    try{
      const body={version:ACTION_VERSION,baseRevision:revision,commands:[command]};
      const preview=await this.api(`/api/media/productions/${this.project}/actions/preview`,{method:'POST',body:JSON.stringify(body)});
      const current=()=>token===this.token&&project===this.getProject()&&project===this.project&&target===this.target&&proposal===this.proposal&&candidate===this.candidate&&revision===this.getRecord()?.revision&&!this.isDirty()&&!this.pending;
      if(!current())return;
      const result=await this.api(`/api/media/productions/${this.project}/actions/evidence`,{method:'POST',body:JSON.stringify({...body,previewHash:preview.previewHash,coverageId:command.coverage.id})});
      if(current()){this.evidence=result;this.notify('Boundary pictures ready. Review the entry and return before accepting.');}
    }finally{if(token===this.token){this.evidenceLoading=false;this.renderEvidence();if(this.evidence)this.$('.direction-evidence-group')?.scrollIntoView({block:'center'});}}
  }
  async accept(){
    if(this.isDirty()||this.pending||this.stale)throw Error('The cut or direction changed. Rebuild proposals first.');
    const checkedContinuity=[...this.root.querySelectorAll('[data-continuity-check]:checked')].map(el=>Number(el.dataset.continuityCheck));
    const coverage=!!this.proposal.interval;
    const record=await this.api(this.url()+'/accept',{method:'POST',body:JSON.stringify({proposalId:this.proposal.id,momentId:this.candidate.momentId,reviewed:this.$('#direction-reviewed').checked,checkedContinuity,...(coverage?{aligned:this.$('#direction-aligned').checked}:{})})});
    this.clearAudition();this.candidate=null;this.evidence=null;this.applySaved(record);this.renderReview();this.refreshStatus();this.notify(coverage?'Cutaway accepted. The main footage keeps its clock. Undo restores the previous cut.':'Shot accepted. Timing and coverage are preserved. Undo restores the previous cut.');
  }
}
