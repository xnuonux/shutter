/** Saved-cut file evidence, kept separate from draft approval or creative-quality judgments. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class MediaHealthRoom {
  constructor({root,getProject,getRecord,isDirty,hasPending,isBusy,api,action,notify,afterRestore}) {
    Object.assign(this,{root,getProject,getRecord,isDirty,hasPending,isBusy,api,action,notify,afterRestore});
    this.report=null;this.project=null;this.request=0;this.restored=false;
    root.innerHTML=`<details class="media-health"><summary>Media health & recovery</summary><p class="small">Check files used by the saved cut and its viewing copies. This reads their full checksums, not just filenames. It does not judge picture, color or sound quality.</p><button id="media-check" class="secondary">Check saved cut's media</button><p id="media-check-scope" class="small"></p><div id="media-check-results"></div><button id="media-check-download" class="secondary" hidden>Export check report</button></details>`;
    this.$=s=>root.querySelector(s);
    this.$('#media-check').onclick=()=>{if(!this.isBusy())this.action(()=>this.scan());};
    this.$('#media-check-download').onclick=()=>this.download();
    this.update();
  }
  requireSaved() {
    if(!this.getRecord()||!this.getProject())throw Error('Open a saved camera/music production first.');
    if(this.isDirty()||this.hasPending())throw Error('Save or discard the unfinished edit before checking or restoring its media.');
  }
  historical() {
    const record=this.getRecord();
    return !this.report||!record||this.report.projectId!==this.getProject()||this.report.revision!==record.revision||this.isDirty()||this.hasPending()||this.restored;
  }
  async scan() {
    this.requireSaved();const project=this.getProject(),revision=this.getRecord().revision,token=++this.request;
    this.restored=true;this.update();
    this.notify('Reading checksums for the saved cut. Originals and edit settings are unchanged.');
    const report=await this.api(`/api/media/productions/${encodeURIComponent(project)}/media-health`,{method:'POST',body:JSON.stringify({baseRevision:revision})});
    if(token!==this.request||project!==this.getProject())return;
    this.report=report;this.restored=false;this.update();
    this.notify(report.allVerified?'All files in this saved-cut scan matched. This is file integrity, not playback certification.':'Media check completed. Review missing, changed or unassessed files below.');
  }
  update() {
    if(this.project!==this.getProject()){this.project=this.getProject();this.report=null;this.restored=false;this.request++;}
    const record=this.getRecord();
    this.$('#media-check').disabled=!record;
    this.$('#media-check-download').hidden=!this.report;
    this.$('#media-check-scope').textContent=this.report?
      `${this.historical()?'HISTORICAL — check again after changes. ':''}Saved revision ${this.report.revision} · checked ${this.report.completedAt}. ${this.report.complete?'Every scoped file was assessed.':'Some files remain unassessed; this is not an all-clear.'}`:
      record?`Saved revision ${record.revision}. Save unfinished changes before checking. Muted sound sources are included.`:'Open a saved camera/music production to check its files.';
    const box=this.$('#media-check-results');box.replaceChildren();if(!this.report)return;
    const summary=document.createElement('p');summary.className='small';const c=this.report.counts;
    summary.textContent=`${c.verified} verified · ${c.missing} missing · ${c.changed} changed · ${c.unassessed} unassessed`;box.append(summary);
    for(const row of this.report.assets){
      const el=document.createElement('div');el.className='media-health-asset';
      el.innerHTML=`<strong>${esc(row.name||row.assetId)}</strong><p class="small"><b>${esc(row.status.toUpperCase())}</b> · ${esc(row.reason)}<br>${esc(row.roles.join(', '))}</p>`;
      if(row.status==='missing'&&row.restoreEligible&&!this.historical()){
        const label=document.createElement('label');label.textContent='Choose the original file (a renamed copy is fine)';
        const input=document.createElement('input');input.type='file';input.setAttribute('aria-label','Original file for '+(row.name||row.assetId));label.append(input);el.append(label);
        const button=document.createElement('button');button.className='secondary';button.textContent='Verify & restore missing file';button.disabled=true;el.append(button);
        const note=document.createElement('p');note.className='small';note.textContent='Only identical bytes can restore this identity. Existing files are never overwritten.';el.append(note);
        input.onchange=()=>{const file=input.files?.[0];button.disabled=!file||file.size!==row.expectedBytes;note.textContent=!file?'No file selected.':file.size!==row.expectedBytes?'Size differs from the original. Nothing will be uploaded.':`${file.name} selected. Full checksum must match before installation.`;};
        button.onclick=()=>{if(!this.isBusy())this.action(()=>this.restore(row,input.files?.[0]));};
      } else if(row.status==='changed'){
        const warning=document.createElement('p');warning.className='small';warning.textContent='Changed files are protected, not overwritten. Preserve the damaged copy for investigation; this tool only fills missing originals.';el.append(warning);
      }
      box.append(el);
    }
  }
  async restore(row,file) {
    this.requireSaved();if(this.historical())throw Error('Check the current saved cut again before restoring.');
    if(!file||file.size!==row.expectedBytes||row.status!=='missing'||!row.restoreEligible)throw Error('Choose the exact missing original file.');
    const project=this.getProject(),token=++this.request;
    this.notify('Verifying the supplied file. A matching filename alone cannot replace an original.');
    const receipt=await this.api(`/api/media/assets/${encodeURIComponent(row.assetId)}/restore?recordKey=${encodeURIComponent(row.recordKey)}`,{
      method:'POST',body:file,headers:{'content-type':'application/octet-stream'}});
    if(token!==this.request||project!==this.getProject())return;
    this.restored=true;this.update();await this.afterRestore();
    this.notify(receipt.status==='restored'?'Exact original restored. Edit, song, text and asset identity are unchanged. Check media again for fresh evidence.':'The exact original was already present. No file was overwritten. Check again for fresh evidence.');
  }
  download() {
    if(!this.report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(this.report,null,2)+'\n'],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='shutter-media-health.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
