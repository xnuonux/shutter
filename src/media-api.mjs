import {handleMemoryRequest} from './memory-api.mjs';
import {inspectSourceRange,readSourceInspectionFile} from './source-inspection.mjs';
import {byteRange} from './media-stream.mjs';
import {inspectCutaway,readCutawayFrame} from './director-evidence.mjs';
import {actionCatalog,directorContext,previewActions,applyActions,actionReceipt,commandProfiles} from './director-actions.mjs';
import {applyTimelineCommand} from '../public/edit-actions.mjs';
import {checkMediaHealth,restoreMissingAsset} from './media-recovery.mjs';
import {importColorLut, previewColor, prepareColor} from './media-color.mjs';
import {checkDelivery} from './media-delivery.mjs';
import {renderListeningMix} from './media-sound.mjs';
import fs from 'node:fs';
import { analyzeWaveform, readWaveform } from './media-waveform.mjs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importMedia, ensureMediaProfile, deriveImage, deriveVideoProxy, mediaExclusive, MAX_IMPORT_BYTES, runMedia } from './media-io.mjs';
import { emptyMediaEdit, compileMediaEdit, MEDIA_EDIT_FORMAT, renderMediaEdit, renderMediaTextFrame } from './media-edit.mjs';
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>1024*1024)throw Error('request_too_large');chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
export function createMediaProduction(studio,input) {
  return studio.transaction(()=>{
    const p=studio.createProduction({title:input.title,shots:[],cast:[]});
    const timeline={...emptyMediaEdit(),fps:input.fps??'24000/1001',width:input.width??1920,height:input.height??1080};
    compileMediaEdit(studio,p.id,timeline);
    const record=studio.write('timeline',{id:'timeline_'+p.id,projectId:p.id,revision:1,timeline,past:[],future:[]});
    return {production:p,timeline:{...record,plan:studio.timelinePlan(p.id,timeline)}};
  });
}
/** Invoke only after the parent server's localhost/Origin/Sec-Fetch-Site gate. */
export async function handleMediaRequest(studio,req,res,url) {
  const staticFiles={'/direction-room.js':['direction-room.js','text/javascript'],'/direction-room.css':['direction-room.css','text/css'],'/studio-workspace.js':['studio-workspace.js','text/javascript'],'/studio-workspace.css':['studio-workspace.css','text/css'],'/memory-contract.mjs':['memory-contract.mjs','text/javascript'],'/memory-room.js':['memory-room.js','text/javascript'],'/memory-room.css':['memory-room.css','text/css'],'/media-health-room.js':['media-health-room.js','text/javascript'],'/media-health-room.css':['media-health-room.css','text/css'],'/text-edit.mjs':['text-edit.mjs','text/javascript'],'/text-room.js':['text-room.js','text/javascript'],'/text-room.css':['text-room.css','text/css'],'/color-contract.mjs':['color-contract.mjs','text/javascript'],'/color-room.js':['color-room.js','text/javascript'],'/color-room.css':['color-room.css','text/css'],'/delivery-contract.mjs':['delivery-contract.mjs','text/javascript'],'/delivery-room.js':['delivery-room.js','text/javascript'],'/delivery-room.css':['delivery-room.css','text/css'],'/sound-edit.mjs':['sound-edit.mjs','text/javascript'],'/sound-room.js':['sound-room.js','text/javascript'],'/sound-room.css':['sound-room.css','text/css'],'/music-edit.mjs':['music-edit.mjs','text/javascript'],'/music-room.js':['music-room.js','text/javascript'],'/music-room.css':['music-room.css','text/css'],'/edit-recovery.mjs':['edit-recovery.mjs','text/javascript'],'/media-studio':['media-studio.html','text/html'],'/media-studio.js':['media-studio.js','text/javascript'],'/media-studio.css':['media-studio.css','text/css']};
  if(req.method==='GET'&&staticFiles[url.pathname]) {
    const [name,type]=staticFiles[url.pathname];res.writeHead(200,{'content-type':type,'cache-control':'no-cache'});res.end(await fsp.readFile(path.join(publicRoot,name)));return true;
  }
  if(req.method==='GET'&&url.pathname==='/action-contract.mjs'){
    res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-cache'});res.end(await fsp.readFile(path.join(publicRoot,'action-contract.mjs')));return true;
  }
  if(!url.pathname.startsWith('/api/media/'))return false;
  if(await handleMemoryRequest(studio,req,res,url))return true;
  const parts=url.pathname.split('/').filter(Boolean);
  try {
    if(req.method==='POST'&&parts.length===5&&parts[2]==='assets'&&parts[4]==='inspect'){
      const input=await body(req),abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};res.once('close',cancel);if(res.destroyed)abort.abort();
      try{const result=await mediaExclusive(studio,()=>inspectSourceRange(studio,parts[3],input,{signal:abort.signal}));if(!res.destroyed)json(res,200,result);}
      finally{res.removeListener('close',cancel);}return true;
    }
    if(['GET','HEAD'].includes(req.method)&&parts[2]==='inspections'&&((parts.length===5&&parts[4]==='preview')||(parts.length===6&&parts[4]==='frames'))){
      if(parts[4]==='frames'&&!/^(?:[0-9]|1[01])$/.test(parts[5]))throw Error('not_found');
      const preview=parts[4]==='preview',bytes=await readSourceInspectionFile(studio,parts[3],preview?'preview':Number(parts[5]));
      const range=byteRange(preview&&req.method==='GET'&&!req.headers['if-range']?req.headers.range:undefined,bytes.length);
      const headers={'content-type':preview?'video/mp4':'image/jpeg','cache-control':'no-store','x-content-type-options':'nosniff',...(preview?{'accept-ranges':'bytes'}:{})};
      if(range.status===416){res.writeHead(416,{...headers,'content-range':`bytes */${bytes.length}`,'content-length':0});res.end();return true;}
      res.writeHead(range.status,{...headers,'content-length':range.end-range.start+1,...(range.status===206?{'content-range':`bytes ${range.start}-${range.end}/${bytes.length}`}:{})});
      res.end(req.method==='HEAD'?undefined:bytes.subarray(range.start,range.end+1));return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/media/actions'){
      json(res,200,actionCatalog(url.searchParams.has('types')?url.searchParams.get('types').split(','):[]));return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/media/action-context'){
      json(res,200,directorContext(studio,{projectId:url.searchParams.get('projectId')||undefined,assetOffset:Number(url.searchParams.get('assetOffset')??0),assetLimit:Number(url.searchParams.get('assetLimit')??30)}));return true;
    }
    if(parts[2]==='productions'&&parts[4]==='actions'){
      if(req.method==='GET'&&parts.length===9&&parts[5]==='evidence'&&parts[7]==='frames'){
        if(!/^[0-5]$/.test(parts[8]))throw Error('not_found');
        const bytes=await readCutawayFrame(studio,parts[3],parts[6],Number(parts[8]));res.writeHead(200,{'content-type':'image/jpeg','cache-control':'no-store'});res.end(bytes);return true;
      }
      if(req.method==='POST'&&parts.length===6&&parts[5]==='evidence'){
        const input=await body(req),abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};res.once('close',cancel);if(res.destroyed)abort.abort();
        try{const result=await mediaExclusive(studio,()=>inspectCutaway(studio,parts[3],input,{signal:abort.signal}));if(!res.destroyed)json(res,200,result);}
        finally{res.removeListener('close',cancel);}return true;
      }
      if(req.method==='GET'&&parts.length===7&&parts[5]==='receipts'){json(res,200,actionReceipt(studio,parts[3],decodeURIComponent(parts[6])));return true;}
      if(req.method==='POST'&&parts.length===6&&['preview','apply'].includes(parts[5])){
        const fn=parts[5]==='preview'?previewActions:applyActions;json(res,200,fn(studio,parts[3],await body(req)));return true;
      }
    }
    if(req.method==='POST'&&parts.length===5&&((parts[2]==='productions'&&parts[4]==='media-health')||(parts[2]==='assets'&&parts[4]==='restore'))) {
      const abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};res.once('close',cancel);
      if(res.destroyed)abort.abort();
      try {
        let result;
        if(parts[4]==='media-health') {const input=await body(req);result=await mediaExclusive(studio,()=>checkMediaHealth(studio,parts[3],input,{signal:abort.signal}));}
        else result=await mediaExclusive(studio,()=>restoreMissingAsset(studio,parts[3],req,{recordKey:url.searchParams.get('recordKey'),signal:abort.signal}));
        if(!res.destroyed)json(res,201,result);
      } finally {res.removeListener('close',cancel);}return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/media/state') {
      const timelines=studio.list('timeline').filter(r=>r.timeline?.format===MEDIA_EDIT_FORMAT);
      const profiles=new Map(studio.list('media-profile').map(p=>[p.assetId,p]));
      json(res,200,{colorLuts:studio.list('color-lut'),colorPreviews:studio.list('color-preview'),deliveryChecks:studio.list('delivery-check'),listeningMixes:studio.list('listening-mix'),productions:studio.list('production'),timelines,derivations:studio.list('media-derivation'),assets:studio.list('asset').map(a=>({...a,media:profiles.get(a.id)||null})),cuts:studio.list('cut').filter(c=>c.plan?.format===MEDIA_EDIT_FORMAT)});return true;
    }
    if(req.method==='POST'&&url.pathname==='/api/media/color/luts') {
      const result=await mediaExclusive(studio,()=>importColorLut(studio,req,{name:url.searchParams.get('name'),inputEncoding:url.searchParams.get('inputEncoding')}));
      json(res,201,result);return true;
    }
    if(req.method==='POST'&&parts.length===5&&parts[2]==='assets'&&['color-preview','color-prepare'].includes(parts[4])) {
      const input=await body(req),abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};
      res.once('close',cancel);
      try {const fn=parts[4]==='color-preview'?previewColor:prepareColor;
        const result=await mediaExclusive(studio,()=>fn(studio,parts[3],input,{signal:abort.signal}));
        if(!res.destroyed)json(res,201,result);
      } finally {res.removeListener('close',cancel);}return true;
    }
    if(req.method==='GET'&&url.pathname==='/api/media/health') {
      const tools={};for(const name of ['ffmpeg','ffprobe'])try{tools[name]=(await runMedia(name,['-version'],{timeoutMs:5000})).split('\n')[0];}catch(e){tools[name]={error:e.message};}
      json(res,200,{tools,maxImportBytes:MAX_IMPORT_BYTES,mode:'local-single-user',status:'experimental-media-foundation'});return true;
    }
    if(req.method==='POST'&&url.pathname==='/api/media/productions') {json(res,201,createMediaProduction(studio,await body(req)));return true;}
    if(req.method==='POST'&&url.pathname==='/api/media/assets') {
      const length=req.headers['content-length'];
      if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>MAX_IMPORT_BYTES))throw Error('asset_size');
      const result=await mediaExclusive(studio,()=>importMedia(studio,req,{name:url.searchParams.get('name')}));json(res,201,result);return true;
    }
    if(parts.length===5&&parts[2]==='assets'&&parts[4]==='waveform') {
      if(req.method==='GET'){json(res,200,await readWaveform(studio,parts[3]));return true;}
      if(req.method==='POST'){
        await body(req);
        const abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};
        res.once('close',cancel);
        try{json(res,200,await mediaExclusive(studio,()=>analyzeWaveform(studio,parts[3],{signal:abort.signal})));}
        finally{res.removeListener('close',cancel);}return true;
      }
    }
    if(req.method==='POST'&&parts[2]==='productions'&&parts[4]==='commands'&&parts.length===5) {
      const input=await body(req),record=studio.getTimeline(parts[3]);
      if(record.timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');
      if(!Number.isSafeInteger(input.baseRevision)||record.revision!==input.baseRevision)throw Error('revision_conflict');
      const profiles=commandProfiles(studio,record.timeline,[input.command||{}]);
      const next=applyTimelineCommand(record.timeline,input.command,profiles);
      json(res,200,studio.saveTimeline(parts[3],input.baseRevision,next));return true;
    }
    if(req.method==='POST'&&parts.length===5&&parts[2]==='assets'&&parts[4]==='probe') {json(res,200,await mediaExclusive(studio,()=>ensureMediaProfile(studio,parts[3])));return true;}
    if(req.method==='POST'&&parts.length===5&&parts[2]==='assets'&&parts[4]==='derive-image') {const input=await body(req);json(res,201,await mediaExclusive(studio,()=>deriveImage(studio,parts[3],input)));return true;}
    if(req.method==='POST'&&parts.length===5&&parts[2]==='assets'&&parts[4]==='proxy') {const input=await body(req);json(res,201,await mediaExclusive(studio,()=>deriveVideoProxy(studio,parts[3],input)));return true;}
    if(parts[2]==='productions'&&parts[4]==='timeline'&&parts.length===5) {
      const existing=studio.getTimeline(parts[3]);if(existing.timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');
      if(req.method==='GET'){json(res,200,existing);return true;}
      if(req.method==='PUT'){const input=await body(req);if(input.timeline?.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');json(res,200,studio.saveTimeline(parts[3],input.baseRevision,input.timeline));return true;}
    }
    if(req.method==='POST'&&parts[2]==='productions'&&parts[4]==='timeline'&&parts.length===6&&['undo','redo'].includes(parts[5])) {
      const input=await body(req);if(studio.getTimeline(parts[3]).timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');json(res,200,studio.saveTimeline(parts[3],input.baseRevision,null,parts[5]));return true;
    }
    if(req.method==='POST'&&parts[2]==='productions'&&parts[4]==='listening-mix'&&parts.length===5) {const input=await body(req);json(res,201,await mediaExclusive(studio,()=>renderListeningMix(studio,parts[3],input)));return true;}
    if(req.method==='POST'&&parts[2]==='productions'&&parts[4]==='text-preview'&&parts.length===5) {
      const input=await body(req),abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};
      res.once('close',cancel);if(res.destroyed)abort.abort();
      try{const result=await mediaExclusive(studio,()=>renderMediaTextFrame(studio,parts[3],input,{signal:abort.signal}));if(!res.destroyed)json(res,201,result);}
      finally{res.removeListener('close',cancel);}return true;
    }
    if(req.method==='POST'&&parts[2]==='productions'&&parts[4]==='render'&&parts.length===5) {const input=await body(req);json(res,200,await mediaExclusive(studio,()=>renderMediaEdit(studio,parts[3],input)));return true;}
    if(parts.length===5&&parts[2]==='cuts'&&parts[4]==='check') {
      const cut=studio.read(parts[3],'cut');
      if(req.method==='GET') {json(res,200,studio.list('delivery-check').filter(r=>r.cutId===cut.id));return true;}
      if(req.method==='POST') {
        const input=await body(req),abort=new AbortController();
        const cancel=()=>{if(!res.writableEnded)abort.abort();};res.once('close',cancel);if(res.destroyed)abort.abort();
        try {const report=await mediaExclusive(studio,()=>checkDelivery(studio,cut.id,input,{signal:abort.signal}));if(!res.destroyed)json(res,201,report);}
        finally {res.removeListener('close',cancel);}return true;
      }
    }
    if(req.method==='GET'&&parts.length===4&&parts[2]==='checks') {json(res,200,studio.read(parts[3],'delivery-check'));return true;}
    if(req.method==='GET'&&parts[2]==='cuts'&&parts[4]==='files'&&parts.length===6) {
      const cut=studio.read(parts[3],'cut'),name=decodeURIComponent(parts[5]);
      if(!/^cut-[a-zA-Z0-9]+$/.test(cut.bridgeFolder||'')||!cut.bridgeFiles?.includes(name)||path.basename(name)!==name)throw Error('not_found');
      const file=path.join(studio.root,'media-renders',cut.bridgeFolder,name),s=await fsp.lstat(file);
      if(!s.isFile()||s.isSymbolicLink())throw Error('not_found');
      res.writeHead(200,{'content-type':'application/octet-stream','content-length':s.size,'content-disposition':`attachment; filename="${name}"`,'cache-control':'no-store'});
      const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);return true;
    }
    json(res,404,{error:'not_found'});return true;
  }catch(e){if(!res.headersSent)json(res,/conflict|busy/.test(e.message)?409:/unavailable/.test(e.message)?503:e.message==='not_found'?404:e.message==='asset_size'?413:400,{error:e.message,...(e.message==='sound_mix_clipping'?{details:e.publicDetails}:{})});else res.destroy();return true;}
}
