import {takeProposal} from './memory-contract.mjs';
import {paintDraftText} from './text-room.js';
import {soundIdentity} from './sound-edit.mjs';
import {applyEdit, placements, totalFrames, clipAt, beatGrid, snapFrame, formatPosition, normalizeMarkers, asNumber, exact, MUSIC_SCHEMA} from './music-edit.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=prefix=>prefix+'_'+crypto.randomUUID();
/** Artist-facing picture timeline. Browser monitoring is not a frame-certified export. */
export class MusicRoom {
  constructor({root,program,getEdit,getState,getSource,onEdit,notify,api,action,isBusy}) {
    Object.assign(this,{root,program,getEdit,getState,getSource,onEdit,notify,api,action,isBusy});
    this.frame=0;this.selected=null;this.playing=false;this.zoom=1;this.wave=null;this.waveAsset=null;this.signature='';this.projectKey=null;this.request=0;
    root.innerHTML=`<div class="transport"><div class="transport-buttons"><button id="cut-home" class="secondary" title="Go to start" aria-label="Go to start">|◀</button><button id="cut-prev" class="secondary" aria-label="Previous frame">−1f</button><button id="cut-play" title="Space: play / pause">Play</button><button id="cut-next" class="secondary" aria-label="Next frame">+1f</button></div><output id="cut-position">00:00.000</output><span id="cut-frame" class="small">frame 0</span><label class="check"><input id="cut-loop" type="checkbox">Loop selected shot</label><label>Zoom<select id="cut-zoom"><option value="1">Fit song</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label></div>
      <div id="cut-scroll" class="timeline-scroll"><canvas id="cut-canvas" height="224" tabindex="0" aria-label="Picture and soundtrack timeline. Arrow keys move one frame; S splits; M adds a cue."></canvas></div>
      <div class="timeline-legend"><span>Picture · drag to reorder</span><span id="wave-label">MASTER · unchanged</span><label class="check"><input id="cut-snap" type="checkbox" checked>Snap to beats / cues</label><button id="build-waveform" class="secondary mini">Build waveform</button></div>
      <div class="editing-tools"><button id="cut-split" class="secondary">Split <kbd>S</kbd></button><button id="cut-duplicate" class="secondary">Duplicate</button><button id="cut-replace" class="secondary">Replace take</button><button id="cut-delete" class="secondary">Remove</button><button id="add-cue" class="secondary">Cue <kbd>M</kbd></button><button id="cut-takes" class="secondary">Compare takes</button><button id="cut-generate">Generate</button></div>
      <details class="shot-settings"><summary>Shot settings</summary><div id="cut-inspector" class="cut-inspector"><p class="small">Select a shot to trim, slip or reframe. Picture edits do not move the song or its cues.</p></div></details>
      <details class="coverage-room"><summary>Camera coverage · same scene time</summary><p class="small">Cover an interval with the selected material. The main footage keeps advancing underneath; removing coverage reveals it again. The scene and soundtrack keep their duration.</p><div class="coverage-fields"><label>Scene in · frame<input id="coverage-at" type="number" min="0" step="1" value="0"></label><button id="coverage-in-playhead" class="secondary mini">In at playhead</button><label>Scene out · frame<input id="coverage-end" type="number" min="1" step="1" value="24"></label><button id="coverage-out-playhead" class="secondary mini">Out at playhead</button><label>Source in · seconds<input id="coverage-source" value="0" inputmode="decimal"></label><button id="coverage-place" class="secondary">Cover with selected material</button></div><div id="coverage-list"></div></details>
      <details class="music-map"><summary>Song map · tempo, bars & cues</summary><div class="music-map-fields"><label>Tempo (quarter-note BPM)<input id="song-bpm" inputmode="decimal" value="120"></label><label>Beats per bar<input id="song-meter" type="number" min="1" max="12" value="4"></label><label>Beat unit<select id="song-unit"><option value="2">Half note</option><option value="4" selected>Quarter note</option><option value="8">Eighth note</option><option value="16">Sixteenth note</option></select></label><label>First beat (output frame)<input id="song-offset" type="number" min="0" value="0"></label><button id="song-apply" class="secondary">Apply song map</button><button id="song-align" class="secondary">First beat at playhead</button><button id="song-clear" class="secondary">Clear grid</button></div><p class="small">Use your FL Studio tempo or place the first beat by ear. The grid is explicit—not automatic beat detection. Cues stay on the song clock when picture moves.</p><div id="song-cues" class="cue-list"></div></details>
      <p class="small timeline-help">Space play/pause · ← → one frame · Shift+← → one second · S split · M cue. Source-rate browser preview is approximate; render the saved revision for export review.</p>`;
    program.innerHTML=`<div class="section-title"><h2>Program</h2><span class="tag">Draft preview</span></div><div class="program-view viewer"><video id="cut-video" muted playsinline preload="metadata" hidden></video><img id="cut-image" alt="Selected picture in the cut" hidden><div id="cut-empty" class="small">Place your first shot. Keep your song.</div></div><audio id="cut-audio" preload="metadata"></audio><p id="program-note" class="small">Playback uses the original or a viewing proxy. Draft text layout is approximate; use Finish to check an actual compositor frame.</p>`;
    this.$=s=>root.querySelector(s);this.video=program.querySelector('#cut-video');this.image=program.querySelector('#cut-image');this.audio=program.querySelector('#cut-audio');this.empty=program.querySelector('#cut-empty');this.canvas=this.$('#cut-canvas');
    const bind=(id,fn)=>this.$(id).addEventListener('click',()=>{if(!this.isBusy())this.safely(fn);});
    bind('#cut-play',()=>this.playing?this.pause():this.play());bind('#cut-home',()=>this.seek(0));bind('#cut-prev',()=>this.seek(this.frame-1));bind('#cut-next',()=>this.seek(this.frame+1));
    bind('#cut-split',()=>this.command({type:'split',clipId:this.selected,frame:this.frame,newId:uid('shot')}));
    bind('#cut-duplicate',()=>this.command({type:'duplicate',clipId:this.selected,newId:uid('shot')}));
    bind('#cut-delete',()=>this.command({type:'remove',clipId:this.selected}));
    bind('#cut-replace',()=>{
      const a=this.getState().assets.find(a=>a.id===this.getSource());if(!a||!['video','image'].includes(a.kind))throw Error('Select footage or a photo in Material first.');
      this.command({type:'replace',clipId:this.selected,assetId:a.id,sourceStart:'0'});this.notify('Take replaced. Placement, shot length, master and cues are unchanged. Undo restores the prior take.');
    });
    bind('#coverage-in-playhead',()=>{this.$('#coverage-at').value=this.frame;});
    bind('#coverage-out-playhead',()=>{this.$('#coverage-end').value=this.frame;});
    bind('#coverage-place',()=>{
      const a=this.getState().assets.find(a=>a.id===this.getSource());
      if(!a||!['video','image'].includes(a.kind))throw Error('Select the alternate view in Material first.');
      const at=Number(this.$('#coverage-at').value),end=Number(this.$('#coverage-end').value);
      this.command({type:'coverage-add',coverage:{id:uid('coverage'),assetId:a.id,at,frames:end-at,sourceStart:this.$('#coverage-source').value,fit:'contain'}});
      this.notify('Coverage placed. The main footage resumes at elapsed scene time.');
    });
    bind('#add-cue',()=>this.addCue());bind('#song-apply',()=>this.applyMusic());bind('#song-align',()=>{this.$('#song-offset').value=this.frame;this.applyMusic();});bind('#song-clear',()=>this.command({type:'music',music:null}));
    bind('#build-waveform',()=>this.action(async()=>{
      const id=this.getEdit()?.soundtrack?.assetId;if(!id)throw Error('Select your mastered song first.');
      this.pause();this.notify('Reading the song into a bounded waveform cache. The master is not changed.');
      const wave=await this.api(`/api/media/assets/${id}/waveform`,{method:'POST',body:'{}'});
      if(this.getEdit()?.soundtrack?.assetId===id){this.wave=wave;this.waveAsset=id;this.draw();this.$('#wave-label').textContent='MASTER · channel-separated waveform';}
      this.notify('Waveform ready. Set your song tempo or add cues while listening.');
    }));
    this.$('#cut-zoom').onchange=e=>{this.zoom=Number(e.target.value);this.resize();};
    this.canvas.addEventListener('pointerdown',e=>{
      if(this.isBusy())return;this.canvas.focus();this.pause();const point=this.point(e),edit=this.getEdit();if(!edit)return;
      const c=placements(edit).find(c=>c.at<=point.frame&&point.frame<c.end);
      this.drag={x:e.clientX,id:point.y>=30&&point.y<=70?c?.id:null,frame:point.frame};this.canvas.setPointerCapture(e.pointerId);
      if(point.y>=30&&point.y<=70&&c)this.selected=c.id;
      this.seek(point.frame);this.inspector();
    });
    this.canvas.addEventListener('pointermove',e=>{if(this.drag){this.drag.target=this.point(e).frame;this.draw();}});
    this.canvas.addEventListener('pointerup',e=>{
      const drag=this.drag;this.drag=null;if(!drag)return;
      if(drag.id&&Math.abs(e.clientX-drag.x)>8){const list=placements(this.getEdit()),at=this.point(e).frame;let target=list.findIndex(c=>at<c.at+c.frames/2);if(target<0)target=list.length;const from=list.findIndex(c=>c.id===drag.id);if(from<target)target--;this.safely(()=>this.command({type:'move',clipId:drag.id,toIndex:Math.max(0,target)}));}
      this.draw();
    });
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null;this.draw();});
    this.onKey=e=>{
      if(!this.getEdit()||this.isBusy()||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,a,summary,[role="tab"],[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
      const actions={' ':()=>this.playing?this.pause():this.play(),ArrowLeft:()=>this.seek(this.frame-(e.shiftKey?Math.round(this.fps()):1)),ArrowRight:()=>this.seek(this.frame+(e.shiftKey?Math.round(this.fps()):1)),s:()=>this.command({type:'split',clipId:this.selected,frame:this.frame,newId:uid('shot')}),m:()=>this.addCue()};
      if(actions[e.key]){e.preventDefault();this.safely(actions[e.key]);}
    };document.addEventListener('keydown',this.onKey);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    this.audio.addEventListener('ended',()=>{if(this.playing)this.anchor={seconds:this.audio.duration,wall:performance.now()};});
    this.audio.addEventListener('error',()=>{if(this.playing){this.pause();this.notify('This browser could not play the selected audio. The source is unchanged; use a supported WAV for monitoring.');}});
    this.video.addEventListener('error',()=>{program.querySelector('#program-note').textContent=(this.audition?'AUDITION ONLY — ':'')+'Picture playback unavailable in this browser. Make a viewing proxy from the source; no source file was changed.';});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.$('#cut-scroll'));
  }
  safely(fn){try{Promise.resolve(fn()).catch(e=>this.notify(e.message.replaceAll('_',' ')));}catch(e){this.notify(e.message.replaceAll('_',' '));}}
  profiles(){return new Map(this.getState().assets.filter(a=>a.media).map(a=>[a.id,a.media]));}
  command(command){this.pause();const next=applyEdit(this.getEdit(),command,this.profiles());this.onEdit(next);}
  fps(){return asNumber(exact(this.getEdit()?.fps||'24'));}
  duration(){return totalFrames(this.getEdit())/this.fps();}
  monitorId(){const e=this.getEdit();return e?.soundStage?this.getState().listeningMixes?.findLast(m=>m.projectId===this.projectKey&&m.identity===soundIdentity(e))?.assetId||null:e?.soundtrack?.assetId||null;}
  playEnd(){if(this.getEdit().soundStage)return totalFrames(this.getEdit());const song=this.getState().assets.find(a=>a.id===this.getEdit().soundtrack?.assetId);return Math.max(totalFrames(this.getEdit()),Math.ceil((song?.media?.duration||0)*this.fps()));}
  point(e){const r=this.canvas.getBoundingClientRect(),f=Math.round(Math.max(0,Math.min(r.width,e.clientX-r.left))/r.width*this.extent());return {frame:this.$('#cut-snap').checked?snapFrame(this.getEdit(),f,Math.max(1,Math.round(6/r.width*this.extent()))>120?120:Math.max(1,Math.round(6/r.width*this.extent()))):f,y:e.clientY-r.top};}
  extent(){const edit=this.getEdit();if(!edit)return 120;const song=this.getState().assets.find(a=>a.id===edit.soundtrack?.assetId);return Math.min(120*14400,Math.max(totalFrames(edit),Math.ceil((song?.media?.duration||0)*this.fps()),Math.ceil(5*this.fps())));}
  update(projectKey){
    const edit=this.getEdit();if(!edit)return;
    if(this.projectKey!==projectKey){this.pause();this.frame=0;this.selected=null;this.projectKey=projectKey;}
    const signature=JSON.stringify(edit);if(signature!==this.signature){this.pause();if(this.audition){this.audition=null;delete this.program.dataset.audition;this.program.querySelector('#program-note').textContent='Current draft. Source-rate playback and browser text are approximate.';}this.signature=signature;}
    this.frame=Math.min(this.frame,this.playEnd());if(!edit.clips.some(c=>c.id===this.selected))this.selected=edit.clips[0]?.id||null;
    const m=edit.music;
    this.$('#song-bpm').value=m?asNumber(exact(m.bpm)):120;this.$('#song-meter').value=m?.beatsPerBar||4;this.$('#song-unit').value=m?.beatUnit||4;this.$('#song-offset').value=m?.offsetFrames||0;
    this.$('#song-cues').innerHTML=normalizeMarkers(edit.markers).map(m=>`<div class="cue"><button class="secondary mini" data-cue="${esc(m.id)}">${esc(m.label)} · ${formatPosition(m.frame,edit.fps)}</button><span class="small">${esc(m.kind)}${m.frame>=totalFrames(edit)?' · beyond picture':''}</span><button class="secondary mini" data-delete-cue="${esc(m.id)}" aria-label="Delete cue ${esc(m.label)}">×</button></div>`).join('')||'<p class="small">No cues yet. Press M at a verse, chorus or visual hit.</p>';
    for(const b of this.root.querySelectorAll('[data-cue]'))b.onclick=()=>{const m=edit.markers.find(m=>m.id===b.dataset.cue);this.seek(m.frame);};
    for(const b of this.root.querySelectorAll('[data-delete-cue]'))b.onclick=()=>this.safely(()=>this.command({type:'marker-remove',markerId:b.dataset.deleteCue}));
    const id=edit.soundtrack?.assetId||null;
    const monitor=this.monitorId();
    if(this.audio.dataset.asset!==String(monitor)){this.audio.pause();this.audio.dataset.asset=String(monitor);if(monitor)this.audio.src='/media/'+monitor;else{this.audio.removeAttribute('src');this.audio.load();}}
    if(this.waveAsset!==id){this.waveAsset=id;this.wave=null;const token=++this.request;this.$('#wave-label').textContent=id?'MASTER · build waveform to see the song':'MASTER · no song selected';if(id)this.api(`/api/media/assets/${id}/waveform`).then(w=>{if(token===this.request){this.wave=w;this.draw();this.$('#wave-label').textContent='MASTER · channel-separated waveform';}}).catch(()=>{});}
    this.$('#build-waveform').disabled=!id;this.inspector();this.resize();this.showPicture();this.positionLabel();
  }
  inspector(){
    const covers=this.getEdit()?.coverage||[];
    this.$('#coverage-list').innerHTML=covers.map(c=>`<div class="coverage-entry"><button type="button" class="secondary mini" data-view-coverage="${esc(c.id)}">${esc(this.getState().assets.find(a=>a.id===c.assetId)?.name||'Alternate view')} · ${formatPosition(c.at,this.getEdit().fps)}–${formatPosition(c.at+c.frames,this.getEdit().fps)}</button><button type="button" class="secondary mini" data-remove-coverage="${esc(c.id)}">Reveal main view</button></div>`).join('');
    for(const b of this.$('#coverage-list').querySelectorAll('[data-view-coverage]'))b.onclick=()=>{const c=covers.find(c=>c.id===b.dataset.viewCoverage);this.pause();this.seek(c.at);};
    for(const b of this.$('#coverage-list').querySelectorAll('[data-remove-coverage]'))b.onclick=()=>{if(!this.isBusy())this.safely(()=>this.command({type:'coverage-remove',coverageId:b.dataset.removeCoverage}));};
    const c=this.getEdit()?.clips.find(c=>c.id===this.selected),el=this.$('#cut-inspector');
    for(const id of ['cut-split','cut-duplicate','cut-delete','cut-replace','cut-generate','cut-takes'])this.$('#'+id).disabled=!c;
    if(!c){el.innerHTML='<p class="small">Select a shot to trim, slip or reframe. Picture edits do not move the song or its cues.</p>';return;}
    const a=this.getState().assets.find(a=>a.id===c.assetId);
    el.innerHTML=`<strong>${esc(a?.name||'Shot')}</strong><label>Source in (seconds / fraction)<input id="inspect-in" value="${esc(c.sourceStart)}"></label><label>Duration (output frames)<input id="inspect-frames" type="number" min="1" value="${c.frames}"></label><label>Framing<select id="inspect-fit"><option value="contain" ${c.fit==='contain'?'selected':''}>Fit / letterbox</option><option value="cover" ${c.fit==='cover'?'selected':''}>Fill / crop</option></select></label><span class="small">${(c.frames/this.fps()).toFixed(3)}s · original retained</span>`;
    this.$('#inspect-in').onchange=e=>this.safely(()=>this.command({type:'slip',clipId:c.id,sourceStart:e.target.value}));
    this.$('#inspect-frames').onchange=e=>this.safely(()=>this.command({type:'trim-end',clipId:c.id,frames:Number(e.target.value)}));
    this.$('#inspect-fit').onchange=e=>this.safely(()=>this.command({type:'fit',clipId:c.id,fit:e.target.value}));
  }
  applyMusic(){this.command({type:'music',music:{schema:MUSIC_SCHEMA,bpm:this.$('#song-bpm').value,beatsPerBar:Number(this.$('#song-meter').value),beatUnit:Number(this.$('#song-unit').value),offsetFrames:Number(this.$('#song-offset').value)}});}
  addCue(){
    const label=prompt('Name this cue (for example: First chorus, vocal entrance, final line).','Chorus');if(!label?.trim())return;
    const kind=/chorus/i.test(label)?'chorus':/verse/i.test(label)?'verse':/hit/i.test(label)?'hit':'cue';
    this.command({type:'marker-add',marker:{id:uid('cue'),frame:this.frame,label:label.trim(),kind}});this.$('.music-map').open=true;
  }
  resize(){if(!this.getEdit())return;const width=Math.min(12000,Math.max(280,this.$('#cut-scroll').clientWidth)*this.zoom);this.cssWidth=width;const dpr=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(224*dpr);this.canvas.style.width=width+'px';this.canvas.style.height='224px';this.draw();}
  draw(){
    const edit=this.getEdit();if(!edit||!this.cssWidth)return;
    const ctx=this.canvas.getContext('2d'),w=this.cssWidth,h=224,dpr=this.canvas.width/w,extent=this.extent(),x=f=>f/extent*w;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#19212b';ctx.fillRect(0,0,w,h);ctx.font='11px system-ui';
    ctx.fillStyle='#1d2028';ctx.fillRect(0,105,w,103);
    const tickSeconds=Math.max(1,Math.ceil(extent/this.fps()/Math.max(2,w/95)));
    for(let sec=0;sec*this.fps()<=extent;sec+=tickSeconds){const px=x(sec*this.fps());ctx.strokeStyle='#394857';ctx.beginPath();ctx.moveTo(px,22);ctx.lineTo(px,209);ctx.stroke();ctx.fillStyle='#a6a7b5';ctx.fillText(formatPosition(sec*this.fps(),edit.fps),px+4,220);}
    if(edit.music)for(const b of beatGrid(edit.music,edit.fps,0,extent,Math.max(16,Math.floor(w/5)))){const px=x(b.frame);ctx.strokeStyle=b.beat===1?'#685063':'#302833';ctx.beginPath();ctx.moveTo(px,21);ctx.lineTo(px,104);ctx.stroke();if(b.beat===1&&w/extent*(this.fps()*60/asNumber(exact(edit.music.bpm))*edit.music.beatsPerBar)>35){ctx.fillStyle='#cba6bb';ctx.fillText(String(b.bar),px+3,20);}}
    for(const c of placements(edit)){
      const px=x(c.at),cw=Math.max(1,x(c.frames));ctx.fillStyle=c.id===this.selected?'#68533a':'#354452';ctx.fillRect(px+1,32,Math.max(1,cw-2),38);ctx.strokeStyle=c.id===this.selected?'#e1bc7d':'#626879';ctx.strokeRect(px+1.5,32.5,Math.max(1,cw-3),37);
      ctx.save();ctx.beginPath();ctx.rect(px+4,34,Math.max(0,cw-8),34);ctx.clip();ctx.fillStyle='#f3eff1';ctx.font='12px system-ui';ctx.fillText(this.getState().assets.find(a=>a.id===c.assetId)?.name||'Shot',px+8,48);ctx.fillStyle='#c1cbd7';ctx.font='10px system-ui';ctx.fillText(`${c.frames}f · ${(c.frames/this.fps()).toFixed(2)}s`,px+8,63);ctx.restore();
    }
    ctx.fillStyle='#1b2827';ctx.fillRect(0,74,w,26);
    for(const c of edit.coverage||[]){const px=x(c.at),cw=Math.max(1,x(c.frames));ctx.fillStyle='#385b52';ctx.fillRect(px+1,75,Math.max(1,cw-2),24);ctx.save();ctx.beginPath();ctx.rect(px+4,75,Math.max(0,cw-8),24);ctx.clip();ctx.fillStyle='#d5e9dc';ctx.fillText('COVERAGE · '+(this.getState().assets.find(a=>a.id===c.assetId)?.name||'Alternate'),px+6,91);ctx.restore();}
    if(this.audition?.coverage){const c=this.audition.coverage,px=x(c.at),cw=x(c.frames);ctx.save();ctx.strokeStyle='#e6bc7a';ctx.setLineDash([5,3]);ctx.strokeRect(px+1,76,Math.max(1,cw-2),22);ctx.beginPath();ctx.rect(px+4,76,Math.max(0,cw-8),22);ctx.clip();ctx.fillStyle='#e6bc7a';ctx.fillText('AUDITION',px+6,91);ctx.restore();}
    if(this.wave){
      const wave=this.wave;for(let c=0;c<wave.channels;c++){const y=126+c*42,amp=18;ctx.strokeStyle=c?'#71a398':'#9db4cc';ctx.beginPath();const peaks=wave.peaks[c];
        for(let px=0;px<w;px++){const a=Math.floor(px/w*extent/this.fps()*wave.sampleRate/wave.samplesPerBin),b=Math.min(peaks.length/2-1,Math.floor((px+1)/w*extent/this.fps()*wave.sampleRate/wave.samplesPerBin));if(a>=peaks.length/2)break;let min=1,max=-1;for(let i=a;i<=Math.max(a,b);i++){min=Math.min(min,peaks[i*2]);max=Math.max(max,peaks[i*2+1]);}ctx.moveTo(px,y-Math.max(-1,Math.min(1,max))*amp);ctx.lineTo(px,y-Math.max(-1,Math.min(1,min))*amp);}ctx.stroke();ctx.fillStyle='#9babb8';ctx.fillText(wave.channels===1?'MONO':c?'R':'L',4,y-20);}
    }else{ctx.fillStyle='#a6a7b5';ctx.font='12px system-ui';ctx.fillText(edit.soundtrack?'Build the waveform to see your master. No normalization is applied.':'Choose your finished song. Picture can also play in silence.',14,154);}
    for(const m of normalizeMarkers(edit.markers)){if(m.frame>extent)continue;const px=x(m.frame);ctx.fillStyle=m.kind==='chorus'?'#e9b687':'#d99eae';ctx.beginPath();ctx.moveTo(px,1);ctx.lineTo(px+5,7);ctx.lineTo(px,13);ctx.lineTo(px-5,7);ctx.fill();}
    if(this.drag?.id&&this.drag.target!==undefined){ctx.strokeStyle='#f1d6b8';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(x(this.drag.target),30);ctx.lineTo(x(this.drag.target),100);ctx.stroke();ctx.setLineDash([]);}
    ctx.strokeStyle='#ffe0e8';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x(this.frame),0);ctx.lineTo(x(this.frame),210);ctx.stroke();ctx.lineWidth=1;
  }
  positionLabel(){this.$('#cut-position').textContent=formatPosition(this.frame,this.getEdit().fps);this.$('#cut-frame').textContent=`frame ${this.frame} / ${totalFrames(this.getEdit())}`;this.$('#cut-play').textContent=this.playing?'Pause':'Play';}
  seek(frame){
    const edit=this.getEdit();if(!edit)return;this.frame=Math.max(0,Math.min(this.extent(),Math.round(frame)));const sec=this.frame/this.fps();this.anchor={seconds:sec,wall:performance.now()};
    if(this.monitorId()){try{this.audio.currentTime=Math.min(sec,Number.isFinite(this.audio.duration)?this.audio.duration:sec);}catch{}if(this.playing&&sec<this.audio.duration)this.audio.play().catch(()=>this.pause());else this.audio.pause();}
    this.showPicture(true);this.positionLabel();this.draw();
  }
  async play(){
    if(this.getEdit().soundStage&&!this.monitorId())throw Error('Save & build the current listening mix in Sound Stage before playback.');
    if(!totalFrames(this.getEdit())&&!this.getEdit().soundtrack)throw Error('Add your song or a shot before playing.');
    if(this.frame>=this.playEnd())this.seek(0);
    const loop=this.loopSelection();if(this.$('#cut-loop').checked&&loop&&(this.frame<loop.at||this.frame>=loop.end))this.seek(loop.at);
    const source=this.program.ownerDocument.querySelector('#source-view video, #source-view audio');source?.pause();
    this.anchor={seconds:this.frame/this.fps(),wall:performance.now()};
    if(this.monitorId()&&(!Number.isFinite(this.audio.duration)||this.anchor.seconds<this.audio.duration)){
      this.audio.currentTime=this.anchor.seconds;
      try{await this.audio.play();}catch{throw Error('Sound playback unavailable. Try a supported WAV or check browser audio permissions.');}
    }
    this.playing=true;this.showPicture();this.positionLabel();this.tick();
  }
  pause(){this.playing=false;this.audio.pause();this.video.pause();cancelAnimationFrame(this.animation);if(this.getEdit())this.positionLabel();}
  tick(){
    if(!this.playing)return;
    const seconds=this.monitorId()&&!this.audio.ended&&!this.audio.paused?this.audio.currentTime:this.anchor.seconds+(performance.now()-this.anchor.wall)/1000;
    this.frame=Math.floor(seconds*this.fps()+1e-7);
    const selected=this.loopSelection();
    if(this.$('#cut-loop').checked&&selected&&this.frame>=selected.end){this.seek(selected.at);}
    else if(this.frame>=this.playEnd()){this.frame=this.playEnd();this.pause();this.showPicture();this.draw();return;}
    this.showPicture();this.positionLabel();this.draw();this.animation=requestAnimationFrame(()=>this.tick());
  }
  setTakeAudition(clipId,candidate){
    const edit=this.getEdit(),profile=this.getState().assets.find(a=>a.id===candidate.assetId)?.media;
    if(!profile)throw Error('source_unavailable');const proposal=takeProposal(edit,clipId,candidate,profile),selection=proposal.clips.find(c=>c.id===clipId);
    this.pause();this.selected=clipId;this.audition={clipId,selection};this.program.dataset.audition='true';
    this.program.querySelector('#program-note').textContent='AUDITION ONLY — '+candidate.label+'. The saved cut and sound are unchanged.';
    this.seek(placements(edit).find(c=>c.id===clipId).at);
  }
  setCoverageAudition(clipId,candidate){
    const edit=this.getEdit();if(candidate.command?.type!=='coverage-add'||!edit.clips.some(c=>c.id===clipId))throw Error('coverage_audition_invalid');
    const profiles=new Map(this.getState().assets.filter(a=>a.media).map(a=>[a.id,a.media]));
    applyEdit(edit,candidate.command,profiles);
    this.pause();this.selected=clipId;this.audition={clipId,coverage:structuredClone(candidate.command.coverage)};this.program.dataset.audition='true';
    this.program.querySelector('#program-note').textContent='CUTAWAY AUDITION · '+candidate.label+'. Main footage and sound stay fixed.';
    this.seek(Math.max(0,this.audition.coverage.at-Math.round(this.fps()/2)));
  }
  loopSelection(){const c=this.audition?.coverage;return c?{at:Math.max(0,c.at-Math.round(this.fps()/2)),end:Math.min(totalFrames(this.getEdit()),c.at+c.frames+Math.round(this.fps()/2))}:placements(this.getEdit()).find(c=>c.id===this.selected);}
  clearTakeAudition(){this.pause();this.audition=null;delete this.program.dataset.audition;this.program.querySelector('#program-note').textContent='Current draft. Source-rate playback and browser text are approximate.';this.showPicture(true);if(this.getEdit())this.draw();}
  showPicture(force=false){
    const edit=this.getEdit();if(!edit)return;
    paintDraftText(this.program.querySelector('.program-view'),edit,this.frame);
    const viewing=this.audition?.coverage?{...edit,coverage:[...(edit.coverage||[]),this.audition.coverage]}:edit;
    let c=this.frame<totalFrames(edit)?clipAt(viewing,this.frame):null;
    if(c&&this.audition?.clipId===c.id)c={...c,...this.audition.selection};
    if(!c){this.video.hidden=true;this.video.pause();this.image.hidden=true;this.empty.hidden=false;this.empty.textContent=edit.soundtrack?'No picture here. Your song continues.':'Place a shot to start the picture.';return;}
    const a=this.getState().assets.find(a=>a.id===c.assetId);if(!a)return;
    this.empty.hidden=true;const fit=c.fit==='contain'?'contain':'cover';this.video.style.objectFit=fit;this.image.style.objectFit=fit;
    if(a.kind==='image'){this.video.hidden=true;this.video.pause();this.image.hidden=false;if(this.image.dataset.asset!==a.id){this.image.dataset.asset=a.id;this.image.src='/media/'+a.id;}return;}
    this.image.hidden=true;this.video.hidden=false;
    const proxy=this.getState().derivations?.findLast(d=>d.recipe?.operation==='browser-proxy'&&d.recipe.sourceAssetId===a.id),id=proxy?.outputAssetId||a.id;
    const time=asNumber(exact(c.sourceStart,true))+Math.min(c.frames-1,Math.max(0,this.frame-c.at))/this.fps();
    const changed=this.video.dataset.clip!==c.id||this.video.dataset.asset!==id;
    const position=()=>{try{this.video.currentTime=time;}catch{}if(this.playing)this.video.play().catch(()=>{});};
    // A source may finish loading after the playhead has moved further into it.
    if(this.video.dataset.asset!==id){this.video.dataset.asset=id;this.video.src='/media/'+id;this.video.onloadedmetadata=()=>{if(this.video.dataset.asset===id)this.showPicture(true);};}
    this.video.dataset.clip=c.id;
    if(changed||force||!this.playing||Math.abs(this.video.currentTime-time)>0.2)position();
    else if(this.playing&&this.video.paused)this.video.play().catch(()=>{});
  }
}
