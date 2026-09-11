import {deliveryOptions, deliveryScope} from './delivery-contract.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(value,unit)=>Number.isFinite(value)?`${value.toFixed(1)} ${unit}`:'Not measurable';
const clock=seconds=>{const n=Math.max(0,seconds);return `${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,'0')}`;};
const names={'checks-complete':'Checks completed','review-needed':'Moments to review','technical-issues':'Technical issue found','incomplete':'Some checks unavailable'};

/** Reports describe a saved deliverable. Seeking targets its video, never the editable draft. */
export class DeliveryRoom {
  constructor({getState,getRecord,isDirty,api,action,notify}) {
    Object.assign(this,{getState,getRecord,isDirty,api,action,notify});this.cut=null;this.root=null;this.report=null;
  }
  attach(parent,cut) {
    this.cut=cut;this.report=(this.getState().deliveryChecks||[]).filter(r=>r.cutId===cut.id).at(-1)||null;
    this.root=document.createElement('section');this.root.className='delivery-check';this.root.setAttribute('aria-label','Delivery Check');parent.append(this.root);
    this.render();
  }
  updateScope() {
    if(!this.root?.isConnected)return;
    const label=this.root.querySelector('[data-check-scope]');if(!label)return;
    const scope=deliveryScope(this.report,this.cut,this.getRecord()?.revision,this.isDirty());
    label.textContent=!this.report?'No inspection yet. This action checks the saved render, not the current draft.':
      scope==='wrong-cut'?'This report does not belong to the displayed render.':
      scope==='older-saved-render'?`Historical check for revision ${this.cut.revision}. Your current edit is different; this report does not cover it.`:
      `Checked saved render / revision ${this.cut.revision}. Historical measurement, not a certification.`;
    label.dataset.scope=scope;
  }
  render() {
    const r=this.report,options=r?.options||{};
    this.root.innerHTML=`<div class="section-title"><div><p class="eyebrow">MEASURE, DON’T SECOND-GUESS YOUR MASTER</p><h2>Delivery Check</h2></div><span class="tag">READ ONLY</span></div>
      <p class="small" data-check-scope aria-live="polite"></p>
      <form class="check-options"><label>Loudness target (optional, LUFS)<input name="targetLufs" type="number" min="-60" max="-5" step="0.1" placeholder="Observe only" value="${esc(options.targetLufs??'')}"></label>
      <label>Target tolerance (LU)<input name="toleranceLu" type="number" min="0.1" max="6" step="0.1" value="${esc(options.toleranceLu??1)}"></label>
      <label>True-peak ceiling (optional, dBTP)<input name="truePeakCeilingDbtp" type="number" min="-12" max="0" step="0.1" placeholder="Observe only" value="${esc(options.truePeakCeilingDbtp??'')}"></label>
      <label class="check-toggle"><input name="scanPicture" type="checkbox" ${options.scanPicture===false?'':'checked'}> Scan dark / static picture intervals</label>
      <button type="submit">Inspect this saved render</button></form>
      <p class="small">Local FFmpeg analysis. Blank targets mean observe only—not a platform preset. Near-black, static and quiet moments may be intentional. No remastering, normalization or auto-fixing.</p>
      <div class="check-results" aria-live="polite"></div>`;
    this.root.querySelector('form').onsubmit=e=>{
      e.preventDefault();const form=e.currentTarget,cut=this.cut;
      this.action(async()=>{
        const optional=name=>form.elements[name].value.trim()===''?null:Number(form.elements[name].value);
        const request=deliveryOptions({targetLufs:optional('targetLufs'),toleranceLu:Number(form.elements.toleranceLu.value),
          truePeakCeilingDbtp:optional('truePeakCeilingDbtp'),scanPicture:form.elements.scanPicture.checked});
        this.notify('Inspecting the saved delivery locally. Source files and edit settings remain unchanged…');
        const result=await this.api(`/api/media/cuts/${cut.id}/check`,{method:'POST',body:JSON.stringify(request)});
        const state=this.getState();state.deliveryChecks??=[];state.deliveryChecks.push(result);
        if(this.cut?.id===cut.id&&this.root?.isConnected){this.report=result;this.render();}
        this.notify('Delivery inspection recorded. Review the measurements and flagged moments; no processing was applied.');
      });
    };
    if(r&&deliveryScope(r,this.cut,this.getRecord()?.revision,this.isDirty())!=='wrong-cut')this.renderResults();
    this.updateScope();
  }
  renderResults() {
    const r=this.report,host=this.root.querySelector('.check-results');
    const audioCard=(key,title)=>{
      const a=r.audio?.[key];
      if(a?.status!=='measured')return `<article class="check-metric"><h3>${title}</h3><p>${a?.status==='no-audio-stream'?'No audio stream':a?.status==='not-applicable'?'No aligned audio file expected':'Measurement unavailable'}</p></article>`;
      return `<article class="check-metric"><h3>${title}</h3><strong>${esc(number(a.integratedLufs,'LUFS'))}</strong><dl><dt>Estimated true peak</dt><dd>${esc(number(a.truePeakDbtp,'dBTP'))}</dd><dt>Sample peak</dt><dd>${esc(number(a.samplePeakDbfs,'dBFS'))}</dd><dt>Loudness range</dt><dd>${esc(number(a.loudnessRangeLu,'LU'))}</dd></dl><p class="small">Peak readings rounded to 0.1 dB. Not a conformance certificate.</p></article>`;
    };
    host.innerHTML=`<div class="section-title"><h3>${esc(names[r.status]||'Inspection recorded')}</h3><a class="check-report-link" href="/api/media/checks/${encodeURIComponent(r.id)}" download="shutter-delivery-check.json">Report JSON ↗</a></div>
      <p class="small">${esc(r.finishedAt)} · Output SHA-256 <code>${esc(r.outputSha256)}</code></p>
      <div class="check-metrics">${audioCard('encoded','Encoded MP4 audio')}${audioCard('pcm','Aligned PCM WAV')}</div>
      <div class="check-curve" aria-label="Encoded audio momentary loudness"></div>
      <div class="check-findings"></div>
      <details class="check-details"><summary>Technical checks and measurement limits</summary><ul>${(r.checks||[]).map(c=>`<li><strong>${esc(c.status)}</strong> · ${esc(c.code)}${c.reason?' · '+esc(c.reason):''}</li>`).join('')}</ul><p class="small">${(r.notAssessed||[]).map(esc).join(' ')}</p></details>`;
    const findings=host.querySelector('.check-findings');
    if(!r.findings?.length)findings.innerHTML='<p class="small">No review flags from the checks performed. Watch and listen to the full delivery before sharing.</p>';
    else {
      const heading=document.createElement('h3');heading.textContent='Review moments and observations';findings.append(heading);
      // Keep the first render bounded for long cuts; all findings remain in the JSON report.
      for(const finding of r.findings.slice(0,100)) {
        const item=document.createElement('div');item.className='check-finding';
        const text=document.createElement('p');text.textContent=`${finding.subject}: ${finding.message}`;
        if(finding.authoredStillClipIds?.length){const note=document.createElement('span');note.className='small';note.textContent=' This interval overlaps an authored photograph.';text.append(note);}
        if(Number.isFinite(finding.startSeconds)) {
          const button=document.createElement('button');button.type='button';button.className='secondary mini';
          button.textContent=`Review ${clock(finding.startSeconds)}–${clock(finding.endSeconds)}`;
          button.onclick=()=>{
            const player=this.root.parentElement.querySelector('.viewer video');if(!player)return;
            player.pause();
            try{player.currentTime=finding.startSeconds;this.notify(`Saved render positioned at ${clock(finding.startSeconds)}. Press play to review.`);}catch{this.notify('Load the saved render before seeking to this moment.');}
          };item.append(button);
        }
        item.append(text);findings.append(item);
      }
      if(r.findings.length>100){const p=document.createElement('p');p.className='small';p.textContent=`Showing 100 of ${r.findings.length} findings. The JSON report contains all findings.`;findings.append(p);}
    }
    const curve=r.audio?.encoded?.curve,points=curve?.points||[],canvasHost=host.querySelector('.check-curve');
    if(points.length) {
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 90');svg.setAttribute('role','img');svg.setAttribute('aria-label','Maximum momentary loudness per time bin; not a waveform');
      const span=Math.max(1,points.at(-1).seconds+(curve.binSeconds||0.1));
      // Separate paths across missing/below-gate bins: no invented connecting readings.
      let previous=null,path='';
      for(const point of points){
        const command=previous===null||point.seconds-previous>(curve.binSeconds||0.1)*1.5?'M':'L';
        const x=Math.min(600,Math.max(0,point.seconds/span*600)),y=Math.min(86,Math.max(4,86-(point.lufs+70)/70*82));
        path+=`${command}${x.toFixed(2)},${y.toFixed(2)} `;previous=point.seconds;
      }
      const trace=document.createElementNS(svg.namespaceURI,'path');trace.setAttribute('d',path.trim());svg.append(trace);canvasHost.append(svg);
      const p=document.createElement('p');p.className='small';p.textContent='Encoded audio: maximum momentary loudness in each time bin. Not a waveform or sample-accurate automation.'+(curve.nonfiniteWindows?` ${curve.nonfiniteWindows} nonfinite meter fields were omitted, not replaced with zero.`:'');canvasHost.append(p);
    }
  }
}
