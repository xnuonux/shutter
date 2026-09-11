import {applySoundEdit, normalizeSoundStage, SOUND_ROLES, samplesAtFrame, samplesAtSeconds, SAMPLE_RATE, soundIdentity, soundAudibility} from './sound-edit.mjs';
import {totalFrames} from './music-edit.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=prefix=>prefix+'_'+crypto.randomUUID();
const seconds=n=>(n/SAMPLE_RATE).toFixed(6).replace(/\.?0+$/,'')||'0';
/** Explicit authoring, saved-revision listening mixes, no hidden realtime fallback. */
export class SoundRoom {
  constructor(options){Object.assign(this,options);this.selected=null;}
  safely(fn){if(this.isBusy())return;try{Promise.resolve(fn()).catch(e=>this.notify(e.message));}catch(e){this.notify(e.message.replaceAll('_',' '));}}
  command(command){this.onEdit(applySoundEdit(this.getEdit(),command));}
  update(){
    const edit=this.getEdit();if(!edit)return;
    const stage=normalizeSoundStage(edit.soundStage);
    if(!stage){this.root.innerHTML='<div class="section-title"><h2>Sound Stage</h2><span class="tag">OPTIONAL</span></div><p>Add voice, camera sound, ambience or effects around your finished song. Originals stay untouched.</p><button id="sound-enable" class="secondary">Open sound lanes</button>';this.root.querySelector('#sound-enable').onclick=()=>this.safely(()=>this.command({type:'sound-enable'}));return;}
    const state=this.getState(),source=state.assets.find(a=>a.id===this.getSource());
    const audioStreams=(source?.media?.audio||[]).filter(s=>[1,2].includes(s.channels));
    const selectedMix=state.listeningMixes?.findLast(m=>m.projectId===this.getProject()&&m.identity===soundIdentity(edit));
    const peak=selectedMix?Math.max(...selectedMix.report.samplePeak):null;
    const end=Math.max(samplesAtFrame(totalFrames(edit),edit.fps),SAMPLE_RATE);
    const audition=soundAudibility(stage,Boolean(edit.soundtrack));
    this.root.innerHTML=`<div class="section-title"><h2>Sound Stage</h2><span class="tag">48 kHz · SAMPLE CLOCK</span></div>
      <div class="sound-controls"><label>Mix output gain (dB)<input id="sound-output" type="number" min="-60" max="0" step="0.1" value="${stage.outputGainDb}"></label><label class="check"><input id="sound-master-mute" type="checkbox" ${stage.master.mute?'checked':''}>Mute song</label><label class="check"><input id="sound-master-solo" type="checkbox" ${stage.master.solo?'checked':''}>Solo song</label><button id="sound-build">Save & build listening mix</button></div>
      <p id="sound-monitor-status" class="small">${selectedMix?`Current audio mix · sample peak ${peak? (20*Math.log10(peak)).toFixed(1)+' dBFS':'silence'} · Program plays this mix.`:'Listening mix needs building. Program will not substitute an older mix or play only the song.'}</p>
      <p class="small">The song stays at zero. Sound does not ripple with picture. No automatic ducking, normalization or limiter. Output gain is an explicit mix-volume adjustment, not a change to your original WAV.</p>
      <div class="sound-controls"><label>New lane<select id="sound-role">${SOUND_ROLES.map(r=>`<option value="${r}">${r[0].toUpperCase()+r.slice(1)}</option>`).join('')}</select></label><button id="sound-add-track" class="secondary" ${stage.tracks.length>=8?'disabled':''}>Add lane</button><label>Selected material / audio stream<select id="sound-stream">${audioStreams.length?audioStreams.map(s=>`<option value="${s.index}">${esc(source.name)} · stream ${s.index} · ${s.channels} ch</option>`).join(''):'<option value="">Select audio or camera footage in Material</option>'}</select></label></div>
      <div class="sound-tracks">${stage.tracks.map(t=>`<section class="sound-track" data-track="${esc(t.id)}"><div class="sound-track-header"><strong>${esc(t.name)}</strong><span class="small">${esc(t.role)} · ${audition.tracks.find(a=>a.id===t.id).audible?'in mix':'excluded from mix'}</span><label>Lane gain dB<input data-gain type="number" min="-60" max="12" step="0.1" value="${t.gainDb}"></label><label class="check"><input data-mute type="checkbox" ${t.mute?'checked':''}>Mute</label><label class="check"><input data-solo type="checkbox" ${t.solo?'checked':''}>Solo</label><button data-add class="secondary mini" ${audioStreams.length?'':'disabled'}>Add selected at playhead</button><button data-remove-track class="secondary mini" aria-label="Remove lane ${esc(t.name)}">Remove lane</button></div><div class="sound-strip" aria-label="${esc(t.name)} placement overview">${t.clips.filter(c=>c.atSample<end).map(c=>`<button data-select="${esc(c.id)}" class="sound-block ${c.id===this.selected?'selected':''}" style="left:${c.atSample/end*100}%;width:${Math.min(c.samples,end-c.atSample)/end*100}%" title="${esc(state.assets.find(a=>a.id===c.assetId)?.name)} at ${seconds(c.atSample)} seconds">${esc(state.assets.find(a=>a.id===c.assetId)?.name||'Sound')}</button>`).join('')}</div><div class="sound-clip-list">${t.clips.map(c=>`<button data-select="${esc(c.id)}" class="secondary mini">${esc(state.assets.find(a=>a.id===c.assetId)?.name||'Sound')} · ${seconds(c.atSample)}s + ${seconds(c.samples)}s${c.atSample>=end?' · beyond picture':''}</button>`).join('')||'<span class="small">Choose material, move the playhead, then add it here.</span>'}</div></section>`).join('')}</div><div id="sound-inspector"></div>
      <p class="small">Overlaps sum. Mute takes precedence over solo. Stems in the handoff are aligned 32-bit float, before mute/solo and output gain; the delivered mix follows the selected controls. Camera audio uses an explicit stream and source-in, not automatic synchronization.</p>`;
    const $=q=>this.root.querySelector(q);
    $('#sound-output').onchange=e=>this.safely(()=>this.command({type:'sound-output',gainDb:Number(e.target.value)}));
    for(const key of ['mute','solo'])$('#sound-master-'+key).onchange=e=>this.safely(()=>this.command({type:'sound-master',value:{...stage.master,[key]:e.target.checked}}));
    $('#sound-build').onclick=()=>this.safely(()=>this.buildMix());
    $('#sound-add-track').onclick=()=>this.safely(()=>{const role=$('#sound-role').value;this.command({type:'sound-track-add',track:{id:uid('lane'),name:role[0].toUpperCase()+role.slice(1)+' '+(stage.tracks.length+1),role,gainDb:0,mute:false,solo:false,clips:[]}});});
    for(const el of this.root.querySelectorAll('[data-track]')){
      const trackId=el.dataset.track;
      for(const [selector,key] of [['[data-gain]','gainDb'],['[data-mute]','mute'],['[data-solo]','solo']])el.querySelector(selector).onchange=e=>this.safely(()=>this.command({type:'sound-track-update',trackId,patch:{[key]:key==='gainDb'?Number(e.target.value):e.target.checked}}));
      el.querySelector('[data-remove-track]').onclick=()=>this.safely(()=>{if(confirm('Remove this lane and its sound clips? Undo restores it.'))this.command({type:'sound-track-remove',trackId});});
      el.querySelector('[data-add]').onclick=()=>this.safely(()=>{
        if(!source||!audioStreams.length)throw Error('Select audio or camera footage with a mono/stereo stream.');
        const streamIndex=Number($('#sound-stream').value),atSample=samplesAtFrame(this.getFrame(),edit.fps);
        const stream=audioStreams.find(s=>s.index===streamIndex);let duration=source.media.duration;
        if(stream.durationTicks&&stream.timeBase){const [n,d]=stream.timeBase.split('/').map(Number);duration=stream.durationTicks*n/d;}
        const samples=Math.min(SAMPLE_RATE*5,Math.floor(duration*SAMPLE_RATE));
        const clip={id:uid('sound'),assetId:source.id,streamIndex,atSample,sourceInSample:0,samples,gainDb:0,fadeInSamples:0,fadeOutSamples:0};
        this.selected=clip.id;this.command({type:'sound-clip-add',trackId,clip});
      });
      for(const b of el.querySelectorAll('[data-select]'))b.onclick=()=>this.safely(()=>{this.selected=b.dataset.select;this.update();});
    }
    this.inspector(stage);
  }
  inspector(stage){
    const track=stage.tracks.find(t=>t.clips.some(c=>c.id===this.selected)),clip=track?.clips.find(c=>c.id===this.selected);
    const el=this.root.querySelector('#sound-inspector');if(!clip)return;
    const field=(key,label)=>`<label>${label}<input data-time="${key}" inputmode="decimal" value="${seconds(clip[key])}"></label>`;
    el.innerHTML=`<div class="sound-clip-inspector"><strong>Selected sound · ${esc(track.name)}</strong>${field('atSample','Placement (seconds)')}${field('sourceInSample','Source in (seconds)')}${field('samples','Duration (seconds)')}${field('fadeInSamples','Fade in (seconds)')}${field('fadeOutSamples','Fade out (seconds)')}<label>Clip gain dB<input id="sound-clip-gain" type="number" min="-60" max="12" step="0.1" value="${clip.gainDb}"></label><button id="sound-to-playhead" class="secondary">Move to playhead</button><button id="sound-remove-clip" class="secondary">Remove sound</button><span class="small">Exact placement ${clip.atSample} · source ${clip.sourceInSample} · length ${clip.samples} sample frames. Time fields also accept fractions.</span></div>`;
    const update=patch=>this.command({type:'sound-clip-update',trackId:track.id,clipId:clip.id,patch});
    for(const input of el.querySelectorAll('[data-time]'))input.onchange=e=>this.safely(()=>update({[input.dataset.time]:samplesAtSeconds(e.target.value)}));
    el.querySelector('#sound-clip-gain').onchange=e=>this.safely(()=>update({gainDb:Number(e.target.value)}));
    el.querySelector('#sound-to-playhead').onclick=()=>this.safely(()=>update({atSample:samplesAtFrame(this.getFrame(),this.getEdit().fps)}));
    el.querySelector('#sound-remove-clip').onclick=()=>this.safely(()=>this.command({type:'sound-clip-remove',trackId:track.id,clipId:clip.id}));
  }
}
