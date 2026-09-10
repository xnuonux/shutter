import {h3Snapshot} from './h3-spec.mjs';

function layout(studio, projectId) {
  try { return studio.read('canvas_'+projectId,'canvas'); }
  catch (error) {
    if(error.message!=='not_found')throw error;
    return {id:'canvas_'+projectId,projectId,revision:0,positions:{}};
  }
}

export function getCanvas(studio, projectId) {
  const production=studio.getProduction(projectId);
  return {...layout(studio,projectId),productionRevision:production.revision,
    shots:production.shots.map(shot=>{
      try {
        const bindings=shot.generation
          ? h3Snapshot(studio,production,{...shot,action:shot.action||'Draft direction'}).bindings
          : shot.reference?[{assetId:shot.reference,role:'opening frame'}]:[];
        return {id:shot.id,bindings};
      } catch(error) { return {id:shot.id,bindings:[],issue:error.message}; }
    })};
}

export function saveCanvas(studio, projectId, baseRevision, positions) {
  studio.getProduction(projectId);
  if(!positions||typeof positions!=='object'||Array.isArray(positions)||Object.keys(positions).length>1000)throw Error('canvas_positions');
  const clean={};
  for(const [id,point] of Object.entries(positions)) {
    if(!/^[a-zA-Z0-9_-]{1,180}$/.test(id)||!point||![point.x,point.y].every(n=>Number.isFinite(n)&&n>=0&&n<=10000))throw Error('canvas_position');
    Object.defineProperty(clean,id,{value:{x:Math.round(point.x),y:Math.round(point.y)},enumerable:true});
  }
  return studio.transaction(()=>{
    const current=layout(studio,projectId);
    if(current.revision!==baseRevision)throw Error('revision_conflict');
    studio.write('canvas',{...current,revision:current.revision+1,positions:clean});
    return getCanvas(studio,projectId);
  });
}

export function connectReference(studio, projectId, input) {
  const production=studio.getProduction(projectId);
  if(production.revision!==input.baseRevision)throw Error('revision_conflict');
  const shot=production.shots.find(s=>s.id===input.shotId);
  if(!shot)throw Error('not_found');
  const mode=shot.generation?.mode||'local';
  const roles=mode==='reference-to-video'?['opening','reference']:mode==='image-to-video'?['opening','ending']:mode==='local'?['opening']:[];
  if(!roles.includes(input.role))throw Error('canvas_role');
  const asset=studio.verifyAsset(input.assetId);
  if(input.role!=='reference'&&asset.kind!=='image')throw Error('image_required');
  if(input.role==='reference') {
    shot.extraReferences=(shot.extraReferences||[]).filter(ref=>ref.assetId!==asset.id);
    if(!input.remove) {
      const description=String(input.description||'').trim();
      if(!description||description.length>1000)throw Error('reference_role_required');
      shot.extraReferences.push({assetId:asset.id,role:description});
    }
  } else {
    const key=input.role==='opening'?'reference':'endReference';
    if(input.remove) {
      if(shot[key]!==asset.id)throw Error('canvas_connection_changed');
      delete shot[key];
    } else shot[key]=asset.id;
  }
  // Validate the real provider binding limits before accepting the connection.
  if(shot.generation)h3Snapshot(studio,production,{...shot,action:shot.action||'Draft direction'});
  return studio.saveProduction(projectId,input.baseRevision,production);
}
