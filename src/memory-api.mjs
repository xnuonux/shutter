import {saveMoment,deleteMoment,searchMoments,getTakeStack,collectTake,acceptTake,exportProductionMemory} from './production-memory.mjs';
import {scoutAsset,readScoutImage} from './media-scout.mjs';
import {mediaExclusive} from './media-io.mjs';
async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('request_too_large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
/** The parent localhost/Origin gate runs first. This does not supply hosted authentication. */
export async function handleMemoryRequest(studio,req,res,url){
  const p=url.pathname.split('/').filter(Boolean);
  const production=p[0]==='api'&&p[1]==='media'&&p[2]==='productions'&&['memory','takes','memory-export'].includes(p[4]);
  const scout=p[0]==='api'&&p[1]==='media'&&((p[2]==='assets'&&p[4]==='scout')||p[2]==='scouts');
  if(!production&&!scout)return false;
  const abort=new AbortController(),cancel=()=>{if(!res.writableEnded)abort.abort();};res.once('close',cancel);if(res.destroyed)abort.abort();
  try {
    if(production&&p[4]==='memory'&&p.length===5){
      if(req.method==='GET'){
        const favorite=url.searchParams.get('favorite');if(favorite!==null&&!['true','false'].includes(favorite))throw Error('memory_search_options');
        json(res,200,searchMoments(studio,p[3],{query:url.searchParams.get('q')||'',favorite:favorite==='true',kind:url.searchParams.get('kind')||'all',offset:Number(url.searchParams.get('offset')||0),limit:50}));return true;
      }
      if(req.method==='POST'){const input=await body(req);json(res,201,await mediaExclusive(studio,()=>saveMoment(studio,p[3],input.moment,{baseRevision:input.baseRevision})));return true;}
    }
    if(production&&p[4]==='memory'&&p.length===6&&req.method==='DELETE'){const input=await body(req);json(res,200,deleteMoment(studio,p[3],p[5],input.baseRevision));return true;}
    if(production&&p[4]==='memory-export'&&p.length===5&&req.method==='GET'){json(res,200,exportProductionMemory(studio,p[3]));return true;}
    if(production&&p[4]==='takes'&&p.length===6){
      if(req.method==='GET'){json(res,200,getTakeStack(studio,p[3],p[5]));return true;}
      if(req.method==='POST'){const input=await body(req);json(res,201,await mediaExclusive(studio,()=>collectTake(studio,p[3],p[5],input)));return true;}
    }
    if(production&&p[4]==='takes'&&p[6]==='accept'&&p.length===7&&req.method==='POST'){const input=await body(req);json(res,200,await mediaExclusive(studio,()=>acceptTake(studio,p[3],p[5],input)));return true;}
    if(scout&&p[2]==='assets'&&p.length===5&&req.method==='POST'){
      const input=await body(req);const result=await mediaExclusive(studio,()=>scoutAsset(studio,p[3],input,{signal:abort.signal}));if(!res.destroyed)json(res,201,result);return true;
    }
    if(scout&&p[2]==='scouts'&&p[4]==='images'&&p.length===6&&req.method==='GET'){
      if(!/^\d+$/.test(p[5]))throw Error('not_found');const bytes=await readScoutImage(studio,p[3],Number(p[5]));res.writeHead(200,{'content-type':'image/jpeg','content-length':bytes.length,'cache-control':'private, max-age=0','x-content-type-options':'nosniff'});res.end(bytes);return true;
    }
    json(res,404,{error:'not_found'});
  }catch(e){if(!res.destroyed&&!res.headersSent)json(res,/conflict|busy/.test(e.message)?409:e.message==='not_found'?404:400,{error:e.message});else if(!res.destroyed)res.destroy();}
  finally{res.removeListener('close',cancel);}return true;
}
