export function createCanvasUI({production,shot,data,esc,media,api,refresh,notify,go,selectShot,markDirty}) {
  let root,record,project,selectedAsset,scale=1,saving=false;
  const endpoint=()=>'/api/productions/'+project;
  const asset=id=>data().assets.find(a=>a.id===id);
  const roles=()=>shot()?.generation?.mode==='reference-to-video'?['opening','reference']:shot()?.generation?.mode==='image-to-video'?['opening','ending']:shot()?.generation?[]:['opening'];
  const roleLabel={opening:'Opening frame',ending:'Ending frame',reference:'Reference media'};
  const fallback=error=>error.message==='revision_conflict'?'A newer edit exists. Reopen Canvas to load it.':error.message==='image_required'?'This input needs an image.':error.message==='reference_required'?'Keep at least one visual reference connected.':error.message;
  function render(){return '<section id="canvas-room"><p class="canvas-loading">Opening your canvas…</p></section>';}
  function attempt(fn){return async e=>{e?.preventDefault();if(saving)return;const target=root;saving=true;try{await fn(e);}catch(error){notify(fallback(error));}finally{saving=false;if(target?.isConnected)target.removeAttribute('aria-busy');}};}
  async function connect(assetId,role,remove=false) {
    const target=root,description=root.querySelector('#canvas-purpose')?.value||'Visual and motion reference';
    await api(endpoint()+'/connections',{method:'POST',body:JSON.stringify({baseRevision:record.productionRevision,shotId:shot().id,assetId,role,description,remove})});
    await refresh(false);const next=await api(endpoint()+'/canvas');
    if(root!==target||!target.isConnected)return;
    record=next;draw();notify(remove?'Reference disconnected from the next take.':'Reference connected to the next take.');
  }
  async function savePositions(positions) {
    const target=root;const saved=await api(endpoint()+'/canvas',{method:'PUT',body:JSON.stringify({baseRevision:record.revision,positions})});
    if(root===target&&target.isConnected)record=saved;
  }
  function preview(a) {
    if(a?.kind==='image')return `<img src="${media(a.id)}" alt="${esc(a.name)}" draggable="false">`;
    if(a?.kind==='video')return `<video src="${media(a.id)}" controls playsinline preload="metadata"></video>`;
    if(a?.kind==='audio')return `<div class="audio-node"><span>Audio reference</span><audio src="${media(a.id)}" controls preload="metadata"></audio></div>`;
    return '';
  }
  function draw() {
    if(!root?.isConnected)return;
    const p=production(),s=shot();if(!s){root.innerHTML='<div class="empty"><h2>Add a shot to open its canvas.</h2><button data-canvas-go="film">Open Direct</button></div>';root.querySelector('button').onclick=()=>go('film');return;}
    const source=record.shots.find(x=>x.id===s.id),bindings=source?.bindings||[];
    if(!asset(selectedAsset))selectedAsset=bindings[0]?.assetId||data().assets.find(a=>a.kind==='image')?.id;
    const ids=[...new Set([...bindings.map(b=>b.assetId),selectedAsset].filter(Boolean))];
    const take=data().jobs.find(j=>j.id===s.selectedTake&&j.state==='ready');
    const timeline=data().timelines?.find(t=>t.projectId===project);
    const cut=data().cuts?.findLast(c=>c.projectId===project&&(timeline?c.plan.hash===timeline.hash:c.plan.takes.every((t,i)=>t.jobId===p.shots[i]?.selectedTake)&&c.plan.takes.length===p.shots.length));
    const node=(id,kind,title,body,x,y,extra='')=>({id,kind,title,body,x:record.positions[id]?.x??x,y:record.positions[id]?.y??y,extra});
    const nodes=ids.map((id,i)=>{const a=asset(id),binding=bindings.find(b=>b.assetId===id);return node('asset_'+id,a.kind,a.name,preview(a)+`<p class="node-purpose">${esc(binding?.role||'Ready to connect')}</p>`,32,36+i*265,`<button class="node-port output-port" data-output="${id}" aria-label="Connect ${esc(a.name)}" title="Drag to a shot input, or choose an input below"></button>`);});
    const shotNode=node('shot_'+s.id,'direction',s.title,`<p class="node-direction">${esc(s.action||'Write your direction in Direct.')}</p><div class="node-inputs">${roles().map(r=>`<button data-connect-target="${r}"><i></i>${roleLabel[r]}</button>`).join('')||'<p>Text-to-video uses direction only.</p>'}</div><button class="node-action" data-canvas-go="film">Edit direction ↗</button>`,350,92);
    const takeNode=node('take_'+s.id,'saved take',take?'Selected take':'No take yet',take?`<video src="${media(take.output)}" ${take.snapshot.shot.reference?`poster="${media(take.snapshot.shot.reference)}"`:''} controls playsinline preload="metadata"></video><p class="node-purpose">${(take.media.frames/take.media.fps).toFixed(2)}s · from its saved render inputs</p><button class="node-action" data-canvas-go="review">Review take ↗</button>`:'<p class="node-direction">Prepare an estimate when the direction and references are ready.</p><button class="node-action" data-canvas-go="settings">Prepare a take ↗</button>',672,132);
    const editNode=node('edit_'+s.id,'edit','The scene',cut?`<video src="${media(cut.output)}" controls playsinline preload="metadata"></video><p class="node-purpose">${(cut.media?.duration||cut.plan.frames/cut.plan.fps).toFixed(2)}s · current saved cut</p><button class="node-action" data-canvas-go="edit">Open timeline ↗</button>`:'<p class="node-direction">Place your takes on one scene clock.</p><button class="node-action" data-canvas-go="edit">Open timeline ↗</button>',994,176);
    nodes.push(shotNode,takeNode,editNode);
    root.innerHTML=`<div class="studio-heading"><div><p class="studio-kicker">Connected to your production</p><h1>Canvas</h1></div><label class="canvas-shot-label">Shot<select id="canvas-shot">${p.shots.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${esc(x.title)}</option>`).join('')}</select></label></div>
      <div class="canvas-toolbar"><p>Direction, references, takes. One connected scene.</p><div><button id="canvas-fit" class="quiet-button">Fit</button><button id="canvas-minus" class="quiet-button" aria-label="Zoom out">−</button><span id="canvas-zoom"></span><button id="canvas-plus" class="quiet-button" aria-label="Zoom in">+</button><button id="canvas-reset" class="quiet-button">Arrange</button></div></div>
      <div class="canvas-scroll" tabindex="0" aria-label="Media canvas, scroll to explore"><div class="canvas-size"><div class="canvas-plane"><svg class="canvas-wires" aria-hidden="true"></svg>${nodes.map(n=>`<article class="canvas-node ${n.kind==='direction'?'direction-node':''}" data-node="${n.id}"><div class="node-handle" tabindex="0" role="button" aria-label="Move ${esc(n.title)}. Drag or use arrow keys"><span>${esc(n.kind)}</span><span class="node-grip">⠿</span></div><h2>${esc(n.title)}</h2>${n.body}${n.extra}</article>`).join('')}</div></div></div>
      <div class="canvas-connect"><div class="section-label"><h2>Connect media</h2><label class="outline-button import-label">+ Import<input type="file" id="canvas-import" accept="image/png,image/jpeg,video/mp4,audio/mpeg,audio/wav"></label></div><form id="canvas-connect-form"><label>Asset<select id="canvas-asset">${data().assets.map(a=>`<option value="${a.id}" ${a.id===selectedAsset?'selected':''}>${esc(a.kind)} · ${esc(a.name)}</option>`).join('')}</select></label><label>Connect to<select id="canvas-role">${roles().map(r=>`<option value="${r}">${roleLabel[r]}</option>`).join('')}</select></label><label class="purpose-field">What should it guide?<input id="canvas-purpose" value="Visual and motion reference" maxlength="1000"></label><button class="primary" ${!roles().length?'disabled':''}>Connect</button></form><p class="canvas-hint">Drag an asset’s round port to a shot input, or connect here. Moving nodes saves automatically. ${source?.issue?esc(source.issue==='reference_required'?'Connect a visual reference to begin.':source.issue):'Saved takes retain the inputs they were rendered with.'}</p><div class="connection-list">${bindings.map(b=>{
        const r=s.reference===b.assetId?'opening':s.endReference===b.assetId?'ending':(s.extraReferences||[]).some(x=>x.assetId===b.assetId)?'reference':null;
        return `<span>${esc(asset(b.assetId)?.name)}${r?`<button data-remove="${b.assetId}" data-role="${r}" aria-label="Disconnect ${esc(asset(b.assetId)?.name)}">×</button>`:'<small>cast / world</small>'}</span>`;
      }).join('')}</div></div>`;
    const plane=root.querySelector('.canvas-plane'),size=root.querySelector('.canvas-size'),viewport=root.querySelector('.canvas-scroll'),svg=root.querySelector('.canvas-wires');
    function layout() {
      const width=Math.max(1280,...nodes.map(n=>n.x+290)),height=Math.max(570,...nodes.map(n=>n.y+root.querySelector(`[data-node="${n.id}"]`).offsetHeight+40));
      plane.style.width=width+'px';plane.style.height=height+'px';plane.style.transform=`scale(${scale})`;size.style.width=width*scale+'px';size.style.height=height*scale+'px';
      root.querySelector('#canvas-zoom').textContent=Math.round(scale*100)+'%';
      for(const n of nodes){const el=root.querySelector(`[data-node="${n.id}"]`);el.style.left=n.x+'px';el.style.top=n.y+'px';}
      const path=(a,b,kind,role)=>{
        const x=a.x+250,y=a.y+89,tx=b.x;let ty=b.y+110;
        const input=role&&root.querySelector(`[data-connect-target="${role}"] i`);
        if(input){const rect=input.getBoundingClientRect(),base=plane.getBoundingClientRect();ty=(rect.top+rect.height/2-base.top)/scale;}
        return `<path class="${kind}" d="M ${x} ${y} C ${x+80} ${y}, ${tx-80} ${ty}, ${tx} ${ty}"/>`;
      };
      svg.innerHTML=bindings.flatMap(b=>{
        const inputs=[];
        if(s.reference===b.assetId)inputs.push('opening');
        if(s.endReference===b.assetId&&roles().includes('ending'))inputs.push('ending');
        if(!inputs.length)inputs.push('reference');
        return inputs.map(role=>path(nodes.find(n=>n.id==='asset_'+b.assetId),shotNode,'reference-wire',role));
      }).join('')+path(shotNode,takeNode,'history-wire')+path(takeNode,editNode,'history-wire');
    }
    layout();
    root.querySelector('#canvas-fit').onclick=()=>{scale=Math.max(.35,Math.min(1,viewport.clientWidth/1280));layout();viewport.scrollTo(0,0);};
    root.querySelector('#canvas-minus').onclick=()=>{scale=Math.max(.35,scale-.15);layout();};root.querySelector('#canvas-plus').onclick=()=>{scale=Math.min(1.6,scale+.15);layout();};
    root.querySelector('#canvas-reset').onclick=attempt(async()=>{await savePositions({});draw();});
    for(const n of nodes){
      const handle=root.querySelector(`[data-node="${n.id}"] .node-handle`);
      handle.onpointerdown=e=>{
        if(saving||e.button!==0)return;
        const start={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};handle.setPointerCapture(e.pointerId);markDirty(true);
        handle.onpointermove=move=>{n.x=Math.max(0,Math.min(10000,start.nx+(move.clientX-start.x)/scale));n.y=Math.max(0,Math.min(10000,start.ny+(move.clientY-start.y)/scale));layout();};
        const finish=attempt(async()=>{handle.onpointermove=null;handle.onpointerup=null;handle.onpointercancel=null;try{await savePositions({...record.positions,[n.id]:{x:n.x,y:n.y}});}catch(error){n.x=start.nx;n.y=start.ny;layout();throw error;}finally{markDirty(false);}});
        handle.onpointerup=finish;handle.onpointercancel=finish;
      };
      const moveKey=attempt(async e=>{const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];const x=Math.max(0,Math.min(10000,n.x+delta[0])),y=Math.max(0,Math.min(10000,n.y+delta[1]));await savePositions({...record.positions,[n.id]:{x,y}});n.x=x;n.y=y;layout();});
      handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))moveKey(e);};
    }
    for(const port of root.querySelectorAll('[data-output]')){
      port.onclick=()=>{selectedAsset=port.dataset.output;root.querySelector('#canvas-asset').value=selectedAsset;root.querySelector('#canvas-role').focus();};
      port.onpointerdown=e=>{if(saving||e.button!==0)return;port.setPointerCapture(e.pointerId);root.classList.add('connecting');port.onpointercancel=()=>root.classList.remove('connecting');port.onpointerup=attempt(async end=>{port.onpointerup=null;root.classList.remove('connecting');const target=document.elementFromPoint(end.clientX,end.clientY)?.closest('[data-connect-target]');if(target)await connect(port.dataset.output,target.dataset.connectTarget);});};
    }
    root.querySelectorAll('[data-connect-target]').forEach(el=>el.onclick=attempt(()=>connect(selectedAsset,el.dataset.connectTarget)));
    root.querySelectorAll('[data-canvas-go]').forEach(el=>el.onclick=()=>go(el.dataset.canvasGo));
    root.querySelectorAll('[data-remove]').forEach(el=>el.onclick=attempt(()=>connect(el.dataset.remove,el.dataset.role,true)));
    root.querySelector('#canvas-shot').onchange=e=>selectShot(e.target.value);
    root.querySelector('#canvas-asset').onchange=e=>{selectedAsset=e.target.value;draw();};
    root.querySelector('#canvas-connect-form').onsubmit=attempt(()=>connect(root.querySelector('#canvas-asset').value,root.querySelector('#canvas-role').value));
    root.querySelector('#canvas-import').onchange=attempt(async e=>{const file=e.target.files[0];if(!file)return;const a=await api('/api/assets?name='+encodeURIComponent(file.name),{method:'POST',body:file,raw:true});await refresh(false);selectedAsset=a.id;draw();notify('Media imported. Choose its input to connect it.');});
  }
  async function wire() {
    const target=document.querySelector('#canvas-room');if(!target)return;
    root=target;project=production()?.id;
    if(!project){target.innerHTML='<div class="empty"><h2>Create a production to open Canvas.</h2></div>';return;}
    try {const saved=await api(endpoint()+'/canvas');if(root!==target||!target.isConnected)return;record=saved;draw();}
    catch(error){if(target.isConnected)target.innerHTML=`<p class="canvas-loading">${esc(fallback(error))}</p>`;}
  }
  return {render,wire};
}
