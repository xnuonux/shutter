export function createTimelineUI({production,data,esc,media,api,notify,refresh,markDirty}) {
  let record,selected,root,loadedProject,hasChanges=false;
  const endpoint=()=>'/api/productions/'+loadedProject+'/timeline';
  const seconds=n=>(n/record.timeline.fps).toFixed(3);
  const job=id=>data().jobs.find(j=>j.id===id);
  const title=id=>production()?.shots.find(s=>s.id===job(id)?.shotId)?.title||job(id)?.snapshot.shot.title||'Video take';
  const chosen=()=>[...record.timeline.main,...record.timeline.coverage].find(c=>c.id===selected);
  function render(){return `<div id="timeline-room"><div class="production-head"><div><div class="eyeline">The cutting room</div><h1>Scene timeline</h1><p>Loading saved footage…</p></div></div></div>`;}
  async function save(next,action){
    const target=root,project=loadedProject;
    const saved=await api(endpoint()+(action?'/'+action:''),{method:action?'POST':'PUT',body:JSON.stringify({baseRevision:record.revision,timeline:next})});
    if(root!==target||!target.isConnected||loadedProject!==project)return;
    record=saved;hasChanges=false;markDirty(false);await refresh(false);draw();
  }
  function attempt(fn){return async e=>{e?.preventDefault();if(hasChanges&&e?.currentTarget?.id!=='time-edit'){notify('Save your placement changes first.');return;}if(root.dataset.busy)return;const target=root;target.dataset.busy='true';try{await fn(e);}catch(error){notify(error.message);}finally{delete target.dataset.busy;}};}
  function draw(){
    if(!root?.isConnected)return;
    const t=record.timeline,p=record.plan;
    if(!chosen())selected=t.main[0].id;
    const clip=chosen(),coverage=t.coverage.some(c=>c.id===selected),take=job(clip.jobId);
    const available=data().jobs.filter(j=>j.projectId===loadedProject&&j.state==='ready'&&j.output&&j.media?.fps===t.fps);
    const cut=data().cuts?.findLast(c=>c.projectId===loadedProject&&c.plan.hash===p.hash);
    let cursor=0;
    const main=t.main.map(c=>{const at=cursor;cursor+=c.sourceOut-c.sourceIn;return {...c,at};});
    const bars=(clips,lane)=>`<div class="time-lane" data-lane="${lane}">${clips.map(c=>`<button class="time-clip ${c.id===selected?'selected':''}" data-clip="${esc(c.id)}" data-at="${c.at}" data-frames="${c.sourceOut-c.sourceIn}" title="${esc(title(c.jobId))} · ${seconds(c.at)}s to ${seconds(c.at+c.sourceOut-c.sourceIn)}s"><video class="time-clip-thumb" src="${media(job(c.jobId).output)}" muted playsinline preload="metadata" aria-hidden="true"></video><strong>${esc(title(c.jobId))}</strong><small>${seconds(c.sourceOut-c.sourceIn)}s</small></button>`).join('')}</div>`;
    root.innerHTML=`<div class="production-head"><div><div class="eyeline">${esc(production().title)} / the cutting room</div><h1>Scene timeline</h1><p class="subtle">${seconds(p.frames)} seconds · ${t.fps} fps · ${record.revision?'Saved edit '+record.revision:'Start from your chosen takes'}</p></div><div class="timeline-actions"><button id="time-undo" class="outline-button" ${!record.past.length?'disabled':''}>Undo</button><button id="time-redo" class="outline-button" ${!record.future.length?'disabled':''}>Redo</button><button id="time-preview" class="primary">${cut?'Open current preview':'Build preview'}</button></div></div>
      <p class="desc">Coverage replaces the picture for the same scene time. The main performance and its sound continue underneath.</p>
      <div class="timeline-layout"><section><div class="time-preview">${cut?`<video id="timeline-player" src="${media(cut.output)}" controls playsinline preload="metadata"></video><a href="${media(cut.output)}" download>Download this exact cut</a>`:`<div class="time-preview-empty"><h2>Your footage, one scene clock.</h2><p>Select a take below to trim it. Add another perspective over the moment it covers, then build a preview.</p><p>Preview is a local export of this edit. No generation credits used.</p></div>`}</div>
      <div class="time-map-scroll" tabindex="0" aria-label="Scene tracks, scroll to explore"><div class="time-map"><div class="time-ruler"><span>0s</span><span>${seconds(p.frames/2)}s</span><span>${seconds(p.frames)}s</span></div><div class="lane-label">Coverage <span>drag to place · one view at a time</span></div>${bars(t.coverage,'coverage')}<div class="lane-label">Main performance <span>continues under coverage</span></div>${bars(main,'main')}<div class="lane-label">Scene audio <span>follows the main performance, including hidden frames</span></div><div class="audio-bed">${p.audioStreams?'Original main-take sound':'Silent scene'}</div></div></div>
      <div class="timeline-add"><label class="field"><span>Available footage</span><select id="time-new-take">${available.map(j=>`<option value="${j.id}">${esc(title(j.id))} · ${seconds(j.media.frames)}s · ${j.id.slice(-6)}</option>`).join('')}</select></label><button id="time-add-coverage" class="outline-button">Add coverage</button><button id="time-add-main" class="outline-button">Append take</button></div></section>
      <aside class="inspector"><div class="eyeline">${coverage?'Coverage':'Main performance'}</div><h2>${esc(title(clip.jobId))}</h2><video class="source-player" src="${media(take.output)}" controls playsinline preload="metadata"></video><p class="desc">Original take · ${seconds(take.media.frames)}s available. Trimming preserves the original.</p><form id="time-edit"><label class="field"><span>Source in (seconds)</span><input name="sourceIn" type="number" min="0" step="any" value="${seconds(clip.sourceIn)}" required></label><label class="field"><span>Source out (seconds)</span><input name="sourceOut" type="number" min="0" step="any" value="${seconds(clip.sourceOut)}" required></label>${coverage?`<label class="field"><span>Place at scene second</span><input name="at" type="number" min="0" step="any" value="${seconds(clip.at)}" required></label>`:''}<button class="primary">Save placement</button></form><div class="timeline-actions">${!coverage?'<button id="time-earlier" class="outline-button">Earlier</button><button id="time-later" class="outline-button">Later</button>':''}<button id="time-remove" class="outline-button" ${!coverage&&t.main.length===1?'disabled':''}>Remove from edit</button></div><p class="render-help">${coverage?'The return to the main view advances by the full coverage duration.':'Changing a main trim moves the following main takes. Coverage stays at its saved scene time.'} Undo restores the previous edit.</p></aside></div>`;
    for(const el of root.querySelectorAll('[data-clip]')){
      el.style.left=(Number(el.dataset.at)/p.frames*100)+'%';el.style.width=(Number(el.dataset.frames)/p.frames*100)+'%';
      el.onclick=()=>{if(hasChanges){notify('Save your placement changes first.');return;}if(root.dataset.dragged){delete root.dataset.dragged;return;}markDirty(false);selected=el.dataset.clip;draw();};
      if(el.closest('[data-lane="coverage"]'))el.onpointerdown=e=>{
        const startX=e.clientX,old=t.coverage.find(c=>c.id===el.dataset.clip),width=el.parentElement.getBoundingClientRect().width;
        el.setPointerCapture(e.pointerId);
        el.onpointerup=attempt(async end=>{
          el.onpointerup=null;if(Math.abs(end.clientX-startX)<4)return;
          root.dataset.dragged='true';const next=structuredClone(t),c=next.coverage.find(c=>c.id===old.id);
          c.at=Math.max(0,Math.min(p.frames-(c.sourceOut-c.sourceIn),old.at+Math.round((end.clientX-startX)/width*p.frames)));
          selected=c.id;await save(next);
        });
      };
    }
    const form=root.querySelector('#time-edit');form.oninput=()=>{hasChanges=true;markDirty(true);};
    form.onsubmit=attempt(async()=>{const fields=new FormData(form),next=structuredClone(t),c=[...next.main,...next.coverage].find(c=>c.id===selected);for(const key of coverage?['sourceIn','sourceOut','at']:['sourceIn','sourceOut']){const value=Number(fields.get(key));if(!Number.isFinite(value))throw Error('Enter a valid time.');c[key]=Math.round(value*t.fps);}await save(next);});
    for(const action of ['undo','redo'])root.querySelector('#time-'+action).onclick=attempt(()=>save(null,action));
    root.querySelector('#time-remove').onclick=attempt(async()=>{const next=structuredClone(t);next[coverage?'coverage':'main']=next[coverage?'coverage':'main'].filter(c=>c.id!==selected);await save(next);});
    for(const [name,offset] of [['earlier',-1],['later',1]])root.querySelector('#time-'+name)?.addEventListener('click',attempt(async()=>{const next=structuredClone(t),i=next.main.findIndex(c=>c.id===selected),to=i+offset;if(to<0||to>=next.main.length)return;[next.main[i],next.main[to]]=[next.main[to],next.main[i]];await save(next);}));
    for(const lane of ['main','coverage'])root.querySelector('#time-add-'+lane).onclick=attempt(async()=>{
      const source=job(root.querySelector('#time-new-take').value),next=structuredClone(t),id='clip_'+crypto.randomUUID();
      const added={id,jobId:source.id,sourceIn:0,sourceOut:source.media.frames};
      if(lane==='coverage'){
        const sorted=[...t.coverage].sort((a,b)=>a.at-b.at);let at=0;
        for(const c of sorted){if(c.at-at>=t.fps)break;at=c.at+c.sourceOut-c.sourceIn;}
        const following=sorted.find(c=>c.at>=at);const room=(following?.at??p.frames)-at;
        if(room<1)throw Error('No uncovered scene time remains. Trim or remove existing coverage first.');
        added.at=at;added.sourceOut=Math.min(t.fps,source.media.frames,room);
      }
      next[lane].push(added);selected=id;await save(next);
    });
    root.querySelector('#time-preview').onclick=attempt(async e=>{
      if(cut){root.querySelector('#timeline-player').focus();return;}
      const project=loadedProject,target=root;
      e.currentTarget.textContent='Building preview…';
      if(record.revision===0)await save(t);
      await api('/api/productions/'+project+'/export-video',{method:'POST',body:'{}'});
      await refresh(false);if(root!==target||!target.isConnected)return;draw();notify('Preview and download use this exact saved edit.');
    });
  }
  async function wire(){
    const target=document.querySelector('#timeline-room');if(!target)return;
    root=target;loadedProject=production()?.id;
    try{const result=await api(endpoint());if(root!==target||!target.isConnected)return;record=result;hasChanges=false;draw();}
    catch(error){if(target.isConnected)target.innerHTML=`<div class="empty-review"><h2>Choose ready footage first</h2><p>${esc(error.message==='selected_takes_required'?'Choose a ready take for each shot in Production, then open the timeline.':error.message)}</p></div>`;}
  }
  return {render,wire};
}
