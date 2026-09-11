import {colorSettings, isPrepared709, MAX_CUBE_BYTES} from './color-contract.mjs';
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Contextual source inspector, not a second timeline or an automatic camera-profile detector. */
export class ColorRoom {
  constructor({getState,api,action,notify,onReady,onSelect,refresh}) {Object.assign(this,{getState,api,action,notify,onReady,onSelect,refresh});}
  attach(root,asset) {
    this.session=(this.session||0)+1;this.root=root;this.asset=asset;this.preview=null;this.input={inputEncoding:'',inputRange:'',lutId:null,description:'',reviewed:false};
    this.frame=0;this.render();
  }
  settings() {return colorSettings(this.input);}
  matches() {try{return this.preview?.sourceAssetId===this.asset.id&&JSON.stringify(this.preview.recipe.settings)===JSON.stringify(this.settings());}catch{return false;}}
  render() {
    if(!this.root)return;
    if(this.asset?.kind!=='video'){this.root.replaceChildren();return;}
    const p=this.asset.media;
    if(isPrepared709(p)) {
      const records=(this.getState().derivations||[]).filter(d=>d.outputAssetId===this.asset.id&&d.recipe?.operation==='color-preparation');
      const sources=[...new Set(records.map(d=>d.recipe.sourceAssetId))];
      this.root.innerHTML=`<section class="color-room"><p class="eyebrow">COLOR PREPARED / PICTURE COPY</p><h3>Keep the look connected.</h3><p class="small">This is a 10-bit ProRes editing copy. Its viewing proxy and reference frames use the prepared color. Original camera sound stays on the original asset.</p><p class="small">To change the conversion, return to the original. A second input LUT is blocked here.</p><div class="action-row">${sources.map((id,i)=>`<button class="secondary" data-color-original="${esc(id)}">Open original${sources.length>1?' '+(i+1):''}</button>`).join('')}</div></section>`;
      for(const button of this.root.querySelectorAll('[data-color-original]'))button.onclick=()=>this.action(()=>this.onSelect(button.dataset.colorOriginal));return;
    }
    const s=this.input,luts=(this.getState().colorLuts||[]).filter(l=>l.inputEncoding===s.inputEncoding),matched=this.matches();
    this.root.innerHTML=`<details class="color-room" open><summary>Color Prep <span class="tag">REVIEW → PREPARE</span></summary>
      <p class="small">Create a separate Rec.709 editing copy. No hidden camera-profile guessing, remastering, or replacement of your cut.</p>
      <p class="color-evidence">File reports: ${esc(p?.color?.transfer||'unknown transfer')} · ${esc(p?.color?.primaries||'unknown primaries')} · ${esc(p?.color?.range||'unknown levels')}. Tags do not prove a log profile.</p>
      <div class="color-settings"><label>Actual input signal<select data-color="inputEncoding"><option value="">Choose deliberately…</option><option value="rec709" ${s.inputEncoding==='rec709'?'selected':''}>Already Rec.709 / SDR</option><option value="custom-log" ${s.inputEncoding==='custom-log'?'selected':''}>Log + my conversion LUT</option></select></label>
      <label>Input data levels<select data-color="inputRange"><option value="">Review camera / export settings…</option><option value="limited" ${s.inputRange==='limited'?'selected':''}>Video / limited</option><option value="full" ${s.inputRange==='full'?'selected':''}>Data / full</option></select></label>
      <label class="color-wide">Input description<input data-color="description" value="${esc(s.description)}" maxlength="200" placeholder="For example: S-Log3 / S-Gamut3.Cine, verified in camera"></label>
      <label class="color-wide">LUT with matching declared input<select data-color="lutId"><option value="">${s.inputEncoding==='custom-log'?'Conversion LUT required':'None — explicit Rec.709 levels only'}</option>${luts.map(l=>`<option value="${esc(l.id)}" ${s.lutId===l.id?'selected':''}>${esc(l.name)} · ${l.size}³</option>`).join('')}</select></label></div>
      <label class="color-upload">Import your .cube LUT<input data-color-lut type="file" accept=".cube" ${s.inputEncoding?'':'disabled'}></label>
      <p class="small">3D-only .cube, 2–65 points per axis, unit domain/output. The LUT must output display-referred Rec.709 / gamma 2.4. No LUT downloads, shapers, HDR tone mapping, or license grants are included.</p>
      <label class="color-review"><input data-color="reviewed" type="checkbox" ${s.reviewed?'checked':''}>I checked the input profile, levels, and LUT output. This creates picture-only copies; original sound remains separate.</label>
      <div class="color-settings"><label>Decoded frame for comparison<input data-color-frame type="number" min="0" max="71999" step="1" value="${this.frame}"></label><div class="color-buttons"><button class="secondary" data-color-preview>Preview this frame</button><button class="secondary" data-color-last>Preview last frame</button></div></div>
      <div class="color-comparison" aria-live="polite">${this.preview?`<p class="color-wide ${matched?'':'color-stale'}">${matched?'Matching recipe preview. Review it before preparing.':'Settings changed. Preview again before preparing.'}</p><figure><img src="/media/${esc(this.preview.beforeAssetId)}" alt="Input code values without LUT"><figcaption>Before / unconverted code values</figcaption></figure><figure><img src="/media/${esc(this.preview.afterAssetId)}" alt="Proposed Rec.709 conversion displayed as sRGB"><figcaption>After / proposed conversion · frame ${this.preview.frame}</figcaption></figure>`:'<p class="small color-wide">No comparison has been rendered. For log input, Before is unconverted code values, not a correct viewing transform.</p>'}</div>
      <button data-color-prepare ${matched?'':'disabled'}>Use this recipe → build editing + viewing copies</button>
      <p class="small">CFR progressive YUV footage only, up to 4K / 10 minutes per source. Full resolution is retained. The ProRes copy is lossy and can be large; it is not a camera-original grading round trip. A prepared copy does not automatically replace a shot.</p>
      </details>`;
    for(const control of this.root.querySelectorAll('[data-color]'))control.onchange=()=>{
      const key=control.dataset.color;this.input[key]=key==='reviewed'?control.checked:key==='lutId'?(control.value||null):control.value;
      if(key==='inputEncoding')this.input.lutId=null;
      this.render();
    };
    this.root.querySelector('[data-color-frame]').onchange=e=>{this.frame=Number(e.target.value);};
    this.root.querySelector('[data-color-lut]').onchange=e=>this.action(async()=>{
      const session=this.session,file=e.target.files?.[0];if(!file)return;
      if(file.size>MAX_CUBE_BYTES)throw Error('color_lut_size');
      const lut=await this.api(`/api/media/color/luts?name=${encodeURIComponent(file.name)}&inputEncoding=${encodeURIComponent(this.input.inputEncoding)}`,{method:'POST',body:file,headers:{'content-type':'application/octet-stream'}});
      await this.refresh();if(session!==this.session)return;this.input.lutId=lut.id;this.render();this.notify('LUT imported with your declared input encoding. Preview before preparing.');
    });
    const preview=frame=>this.action(async()=>{
      const session=this.session,settings=this.settings(),assetId=this.asset.id;this.notify('Rendering the comparison locally. The cut and original remain unchanged…');
      const result=await this.api(`/api/media/assets/${assetId}/color-preview`,{method:'POST',body:JSON.stringify({settings,frame})});
      await this.refresh();if(session!==this.session)return;this.preview=result;this.render();this.notify('Compare the result. Changed settings require a new preview.');
    });
    this.root.querySelector('[data-color-preview]').onclick=()=>preview(this.frame);
    this.root.querySelector('[data-color-last]').onclick=()=>preview('last');
    this.root.querySelector('[data-color-prepare]').onclick=()=>this.action(async()=>{
      if(!this.matches())throw Error('color_matching_preview_required');const session=this.session;
      this.notify('Checking source cadence and building a separate 10-bit editing copy…');
      const result=await this.api(`/api/media/assets/${this.asset.id}/color-prepare`,{method:'POST',body:JSON.stringify({settings:this.settings(),previewId:this.preview.id})});
      // Preparing picture succeeded even if a later optional browser proxy fails.
      let proxyError=null;
      try{this.notify('Editing copy is ready. Building its browser viewing copy…');await this.api(`/api/media/assets/${result.asset.id}/proxy`,{method:'POST',body:JSON.stringify({acknowledgeUnmanagedColor:true})});}
      catch(e){proxyError=e.message;}
      await this.refresh();if(session===this.session)await this.onReady(result.asset.id);
      this.notify(proxyError?`Editing copy saved. Viewing copy unavailable: ${proxyError.replaceAll('_',' ')}. Retry the viewing-copy action; the prepared asset is retained.`:'Prepared picture selected. Append or replace a take explicitly. Original footage, sound, and existing cut are unchanged.');
    });
  }
}
