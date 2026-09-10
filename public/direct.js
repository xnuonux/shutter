export function createDirectUI({production,shot,data,takeFor,esc,media,strip,empty,api,refresh,notify,markDirty,go}) {
  function render() {
    const p=production(),s=shot();if(!p||!s)return empty();
    const take=takeFor(s),index=p.shots.indexOf(s)+1;
    const opening=take?.snapshot.shot.reference||s.reference;
    const people=(p.cast||[]).filter(c=>(s.cast||[]).includes(c.id));
    const refs=[...people.map(c=>({id:c.reference,name:c.name})),...(p.place?.reference?[{id:p.place.reference,name:p.place.name}]:[])];
    return `<section class="direct-room">
      <div class="studio-heading"><div><p class="studio-kicker">Your production</p><h1>${esc(p.title)}</h1></div><button class="quiet-button" data-nav="review">Review continuity ↗</button></div>
      <div class="direct-layout"><section class="screen-panel">
        <div class="screen-caption"><span><i class="signal-dot"></i> ${take?'Saved take':'Opening frame'}</span><span>SHOT ${String(index).padStart(2,'0')} / ${String(p.shots.length).padStart(2,'0')}</span></div>
        <div class="direct-screen">${take?`<video id="take-player" src="${media(take.output)}" ${opening?`poster="${media(opening)}"`:''} controls playsinline preload="metadata"></video>`:opening?`<img src="${media(opening)}" alt="Opening frame for ${esc(s.title)}">`:'<div class="screen-empty"><h2>Imagine the first frame.</h2><p>Write the action, connect your references, then prepare a take.</p></div>'}</div>
        <div class="screen-bottom"><div><h2>${esc(s.title)}</h2><p>${take?`${take.media.width} × ${take.media.height} · ${take.media.fps} fps · ${(take.media.frames/take.media.fps).toFixed(2)}s`:`${s.generation?.duration||s.frames/s.fps}s planned`}</p></div><button class="outline-button" data-nav="edit">Open edit ↗</button></div>
        <details class="scene-context"><summary>Story & continuity <span>What carries into this shot</span></summary><div><p><strong>Before</strong>${esc(s.before||'Record the scene’s starting state in shot settings.')}</p><p><strong>After</strong>${esc(s.after||'Record the intended ending in shot settings.')}</p></div></details>
      </section>
      <aside class="director-panel"><div class="director-title"><span class="director-mark">✳</span><div><h2>Direction</h2><p>Make the next take yours.</p></div></div>
        <form id="direction-form"><label for="direction-action">What happens in this shot?</label><textarea id="direction-action" name="action" rows="7" required maxlength="12000" placeholder="Describe the action, the feeling, the moment…">${esc(s.action)}</textarea><label for="direction-camera">Camera</label><input id="direction-camera" name="camera" value="${esc(s.camera)}" placeholder="A slow push in, at eye level"><div class="composer-footer"><span id="direction-status">Saved direction</span><button type="submit" class="primary">Save direction</button></div></form>
        <div class="direct-references"><div class="section-label"><h3>Cast & world</h3><button class="quiet-button" data-nav="canvas">Open canvas ↗</button></div><div class="reference-faces">${refs.map(r=>`<button data-nav="canvas" title="${esc(r.name)}"><img src="${media(r.id)}" alt="${esc(r.name)}"><span>${esc(r.name)}</span></button>`).join('')||'<p class="subtle">Add your first reference in Canvas.</p>'}</div></div>
        <button class="settings-link" data-nav="settings"><span>Shot settings<span class="subtle">${s.generation?'H3 Max · '+esc(s.generation.mode.replaceAll('-',' ')):'Local generation'} · estimates & takes</span></span><span>↗</span></button>
      </aside></div>${strip()}</section>`;
  }
  function wire() {
    const form=document.querySelector('#direction-form');if(!form)return;
    const p=production(),s=shot();let saving=false;
    form.oninput=()=>{markDirty(true);form.querySelector('#direction-status').textContent='Unsaved direction';};
    form.onsubmit=async e=>{
      e.preventDefault();if(saving)return;
      const fields=new FormData(form),action=String(fields.get('action')).trim();
      if(!action){notify('Describe the action first.');return;}
      saving=true;const button=form.querySelector('button[type="submit"]');button.disabled=true;
      try {
        await api('/api/productions/'+p.id,{method:'PUT',body:JSON.stringify({...p,baseRevision:p.revision,shots:p.shots.map(x=>x.id===s.id?{...x,action,camera:String(fields.get('camera')).trim()}:x)})});
        markDirty(false);await refresh();notify('Direction saved for the next take.');
      } catch(error) {notify(error.message==='revision_conflict'?'A newer edit exists. Your direction is still here; compare before saving.':error.message);}
      finally {saving=false;button.disabled=false;}
    };
  }
  return {render,wire};
}
