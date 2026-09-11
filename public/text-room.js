import {TEXT_LIMITS,normalizeTextLayer,emptyTextLayer,applyTextEdit,parseCaptions,exportCaptions,textReview,activeText} from './text-edit.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pictureFrames=edit=>edit.clips.reduce((n,c)=>n+c.frames,0);
const uid=()=> 'text_'+crypto.randomUUID();
/** Draft monitoring only. Browser fonts/layout are not a replacement for the saved compositor frame. */
export function paintDraftText(host,edit,frame) {
  let overlay=host.querySelector('.text-preview-layer');
  if(!overlay){overlay=document.createElement('div');overlay.className='text-preview-layer';overlay.setAttribute('aria-label','Approximate draft text');host.append(overlay);}
  host.style.setProperty('--text-aspect',String(edit.width/edit.height));
  const w=host.clientWidth,h=host.clientHeight,layer=normalizeTextLayer(edit.textLayer),cues=frame<pictureFrames(edit)?activeText(layer,frame):[];
  const signature=JSON.stringify([w,h,layer?.captionDelivery,cues]);
  if(overlay.dataset.signature===signature)return;overlay.dataset.signature=signature;overlay.replaceChildren();
  for(const c of cues) {
    const node=document.createElement('div');node.className='draft-text '+c.kind;node.textContent=c.text;
    const ratios={caption:[.046,.05],title:[.075,.085],'lower-third':[.055,.052]}[c.kind];
    node.style.fontSize=Math.max(4,Math.min(w*ratios[0],h*ratios[1]))+'px';overlay.append(node);
  }
  if(layer?.captionDelivery==='sidecar'&&cues.some(c=>c.kind==='caption')){const label=document.createElement('span');label.className='text-sidecar-note';label.textContent='CAPTIONS · SIDECAR ONLY';overlay.append(label);}
}
export class TextRoom {
  constructor({root,getEdit,getFrame,getProject,onEdit,seek,notify,isBusy,reviewFrame}) {
    Object.assign(this,{root,getEdit,getFrame,getProject,onEdit,seek,notify,isBusy,reviewFrame});
    this.pending=false;this.selected=null;this.project=null;this.importCandidate=null;this.request=0;this.review=null;
    root.innerHTML=`<details class="text-room"><summary>Finish · titles, lyrics & captions</summary><p class="small">Frame-anchored words that stay with your production. Titles are burned into the final video; captions can stay optional. No transcription or generation is submitted.</p>
    <div class="text-toolbar"><button id="text-new" class="secondary">New text at playhead</button><label>Caption delivery<select id="text-delivery"><option value="sidecar">Separate SRT / VTT only</option><option value="burn-and-sidecar">Burn into video + keep sidecars</option></select></label><button id="text-srt" class="secondary">Export SRT</button><button id="text-vtt" class="secondary">Export VTT</button></div>
    <div class="text-layout"><div><div class="text-fields"><label>Text treatment<select id="text-kind"><option value="caption">Caption / lyric</option><option value="title">Centered title</option><option value="lower-third">Lower-third label</option></select></label><label>Start frame<input id="text-start" type="number" min="0" step="1" value="0"></label><label>End frame · exclusive<input id="text-end" type="number" min="1" step="1" value="1"></label></div><label>Your words<textarea id="text-words" rows="3" maxlength="480" placeholder="A lyric, a line of dialogue, a title…"></textarea></label><p class="small">Plain text, up to three explicit lines. Braces and backslashes are not supported; imported subtitle styling/settings are rejected rather than discarded.</p><div class="action-row"><button id="text-apply">Add text cue</button><button id="text-start-now" class="secondary">Start at playhead</button><button id="text-end-now" class="secondary">End after this frame</button><button id="text-discard" class="secondary">Discard form changes</button></div><p id="text-form-status" class="small"></p></div><div><label>Find words<input id="text-find" type="search" placeholder="Search captions or titles…"></label><div id="text-cues" class="text-cue-list"></div><p id="text-review-notes" class="small"></p></div></div>
    <details class="text-import"><summary>Bring subtitle files</summary><label>UTF-8 SRT or plain WebVTT<input id="text-file" type="file" accept=".srt,.vtt"></label><label>Import action<select id="text-import-mode"><option value="append">Append captions</option><option value="replace-captions">Replace captions · keep titles</option></select></label><div id="text-import-preview" class="small">Choose a file to inspect before applying it.</div><button id="text-import-apply" class="secondary" disabled>Apply reviewed import</button></details>
    <div class="text-proof"><button id="text-proof" class="secondary">Save & check compositor frame</button><p class="small">Program text is an approximate browser layout. This check renders the selected frame using the export text engine. Review source color first; this is still an unmanaged SDR composition.</p><div id="text-proof-result"></div></div></details>`;
    this.$=selector=>root.querySelector(selector);
    const bind=(selector,fn)=>this.$(selector).addEventListener('click',()=>{if(!this.isBusy())this.attempt(fn);});
    for(const selector of ['#text-kind','#text-start','#text-end','#text-words'])this.$(selector).addEventListener('input',()=>{this.pending=true;this.formStatus();});
    this.$('#text-delivery').onchange=()=>this.attempt(()=>this.commit({type:'text-delivery',delivery:this.$('#text-delivery').value}));
    this.$('#text-find').oninput=()=>this.list();
    bind('#text-new',()=>{this.assertApplied();this.selected=null;this.fill({kind:'caption',startFrame:this.getFrame(),endFrame:Math.min(pictureFrames(this.getEdit()),this.getFrame()+Math.max(1,Math.round(this.fps()*2))),text:''});});
    bind('#text-apply',()=>this.applyForm());
    bind('#text-start-now',()=>{this.$('#text-start').value=this.getFrame();this.pending=true;this.formStatus();});
    bind('#text-end-now',()=>{this.$('#text-end').value=this.getFrame()+1;this.pending=true;this.formStatus();});
    bind('#text-discard',()=>{this.pending=false;this.selected=null;this.fill(null);});
    for(const format of ['srt','vtt'])bind('#text-'+format,()=>{this.assertApplied();this.download(exportCaptions(this.getEdit().textLayer,this.getEdit().fps,format),'captions.'+format,format==='vtt'?'text/vtt':'text/plain');});
    this.$('#text-file').onchange=()=>this.attempt(()=>this.readImport(this.$('#text-file').files?.[0]));
    bind('#text-import-apply',()=>this.acceptImport());bind('#text-proof',()=>this.proof());
  }
  fps(){const [n,d='1']=String(this.getEdit().fps).split('/');return Number(n)/Number(d);}
  async attempt(fn){try{await fn();}catch(e){this.notify(e.message.replaceAll('_',' '));}}
  assertApplied(){if(this.pending)throw Error('Apply or discard the unfinished text form before saving, importing, or selecting another cue.');}
  formStatus(){this.$('#text-form-status').textContent=this.pending?'Text form not yet applied. Add/update this cue before saving the cut.':'';}
  fill(cue){const c=cue||{kind:'caption',startFrame:this.getFrame(),endFrame:Math.max(this.getFrame()+1,Math.min(pictureFrames(this.getEdit()),this.getFrame()+Math.round(this.fps()*2))),text:''};this.$('#text-kind').value=c.kind;this.$('#text-start').value=c.startFrame;this.$('#text-end').value=c.endFrame;this.$('#text-words').value=c.text;this.$('#text-apply').textContent=this.selected?'Update text cue':'Add text cue';this.pending=false;this.formStatus();}
  applyForm(){
    const cue={id:this.selected||uid(),kind:this.$('#text-kind').value,startFrame:Number(this.$('#text-start').value),endFrame:Number(this.$('#text-end').value),text:this.$('#text-words').value};
    const next=applyTextEdit(this.getEdit(),{type:'text-put',cue});this.selected=cue.id;this.pending=false;this.onEdit(next);this.notify('Text applied to the unsaved cut. Picture and sound are unchanged.');
  }
  commit(command){if(this.isBusy())return;const next=applyTextEdit(this.getEdit(),command);this.onEdit(next);}
  update(){
    const edit=this.getEdit();if(!edit)return;
    if(this.project!==this.getProject()){this.project=this.getProject();this.pending=false;this.selected=null;this.importCandidate=null;this.review=null;this.request++;this.fill(null);this.$('#text-import-apply').disabled=true;this.$('#text-import-preview').textContent='Choose a file to inspect before applying it.';}
    const layer=normalizeTextLayer(edit.textLayer)||emptyTextLayer();this.$('#text-delivery').value=layer.captionDelivery;
    if(!this.pending){const cue=layer.cues.find(c=>c.id===this.selected);if(!cue)this.selected=null;this.fill(cue);}
    if(this.importCandidate&&this.importCandidate.fps!==edit.fps){this.importCandidate=null;this.$('#text-import-apply').disabled=true;this.$('#text-import-preview').textContent='Frame rate changed. Read the subtitle file again.';}
    this.list();this.showProof();
  }
  list(){const edit=this.getEdit();if(!edit)return;const layer=normalizeTextLayer(edit.textLayer)||emptyTextLayer(),query=this.$('#text-find').value.toLowerCase(),matching=layer.cues.filter(c=>c.text.toLowerCase().includes(query));
    this.$('#text-cues').innerHTML=matching.slice(0,100).map(c=>`<div class="text-cue ${c.id===this.selected?'selected':''}"><button class="secondary" data-text-select="${c.id}"><span>${esc(c.kind)} · ${c.startFrame}–${c.endFrame}</span><strong>${esc(c.text)}</strong></button><button class="secondary" data-text-delete="${c.id}" aria-label="Delete text cue">×</button></div>`).join('')||'<p class="small">No matching text cues yet.</p>';
    for(const b of this.root.querySelectorAll('[data-text-select]'))b.onclick=()=>this.attempt(()=>{if(this.isBusy())return;this.assertApplied();this.selected=b.dataset.textSelect;const c=layer.cues.find(c=>c.id===this.selected);this.fill(c);this.seek(c.startFrame);this.list();});
    for(const b of this.root.querySelectorAll('[data-text-delete]'))b.onclick=()=>this.attempt(()=>{if(this.isBusy())return;this.assertApplied();this.commit({type:'text-delete',cueId:b.dataset.textDelete});});
    const issues=textReview(layer,pictureFrames(edit),edit.fps),counts={};for(const i of issues)counts[i.code]=(counts[i.code]||0)+1;
    this.$('#text-review-notes').textContent=`${layer.cues.length} text cues. ${matching.length>100?'Showing the first 100 matches; narrow the search. ':''}`+Object.entries(counts).map(([k,v])=>`${v} ${k.replaceAll('-',' ')}${k==='outside-picture'?' (export blocked)':''}`).join(' · ');
  }
  async readImport(file){
    const token=++this.request;this.importCandidate=null;this.$('#text-import-apply').disabled=true;
    if(!file){this.$('#text-import-preview').textContent='Choose a file to inspect before applying it.';return;}
    const project=this.getProject(),fps=this.getEdit().fps,format=file.name.toLowerCase().endsWith('.vtt')?'vtt':file.name.toLowerCase().endsWith('.srt')?'srt':null;
    this.$('#text-import-preview').textContent='Reading subtitle file…';
    try {
      if(file.size>TEXT_LIMITS.importBytes)throw Error('text_import_too_large');
      const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()),prefix=uid(),cues=parseCaptions(content,format,fps,prefix);
      if(token!==this.request||project!==this.getProject()||fps!==this.getEdit().fps)return;
      this.importCandidate={content,format,prefix,fps,project,cues};this.$('#text-import-preview').textContent=`${file.name}: ${cues.length} cues. Starts and ends round upward to the next output frame. First cue: ${cues[0].text}`;this.$('#text-import-apply').disabled=false;
    } catch(e) {
      if(token===this.request&&project===this.getProject())this.$('#text-import-preview').textContent='Import not applied: '+e.message.replaceAll('_',' ');
      throw e;
    }
  }
  acceptImport(){this.assertApplied();const candidate=this.importCandidate;if(!candidate||candidate.fps!==this.getEdit().fps||candidate.project!==this.getProject())throw Error('text_import_stale');
    const next=applyTextEdit(this.getEdit(),{type:'text-import',sourceFormat:candidate.format,content:candidate.content,idPrefix:candidate.prefix,mode:this.$('#text-import-mode').value});
    this.importCandidate=null;this.$('#text-import-apply').disabled=true;this.$('#text-import-preview').textContent='Import applied to the draft. Undo restores the previous text.';this.onEdit(next);
  }
  async proof(){this.assertApplied();const signature=JSON.stringify(this.getEdit()),project=this.getProject(),frame=this.getFrame(),token=++this.request,result=await this.reviewFrame(frame);
    if(!result||token!==this.request||project!==this.getProject()||signature!==JSON.stringify(this.getEdit()))return;
    this.review={...result,signature};this.showProof();
  }
  showProof(){const box=this.$('#text-proof-result');if(!this.review){box.replaceChildren();return;}const stale=this.review.signature!==JSON.stringify(this.getEdit());
    box.innerHTML=`<p class="small ${stale?'dirty':''}">${stale?'HISTORICAL — the draft changed. ':'SAVED COMPOSITOR FRAME · '}Revision ${this.review.revision}, output frame ${this.review.frame}. Caption delivery follows the saved settings.</p><img alt="Saved compositor text review frame" src="/media/${encodeURIComponent(this.review.imageAssetId)}">`;
  }
  download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
