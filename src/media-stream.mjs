/** Single byte-range delivery. No decoder, whole-file buffering, or integrity-certification claim. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function byteRange(header,size) {
  if(!Number.isSafeInteger(size)||size<0)throw Error('media_stream_size');
  // This endpoint does not implement multipart ranges. Unknown/malformed ranges are ignored.
  if(typeof header!=='string'||header.length>200)return {status:200,start:0,end:size-1};
  const m=/^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if(!m||(!m[1]&&!m[2]))return {status:200,start:0,end:size-1};
  const total=BigInt(size);let start,end;
  if(!m[1]){const length=BigInt(m[2]);if(length===0n||total===0n)return {status:416};start=length>=total?0n:total-length;end=total-1n;}
  else {start=BigInt(m[1]);end=m[2]?BigInt(m[2]):total-1n;
    if(m[2]&&start>end)return {status:200,start:0,end:size-1};
    if(start>=total)return {status:416};if(end>=total)end=total-1n;
  }
  return {status:206,start:Number(start),end:Number(end)};
}
export async function serveMediaAsset(studio,req,res,id) {
  let handle;
  try {
    const asset=studio.read(id,'asset');
    if(!/^asset_[a-f0-9]{64}$/.test(id)||asset.sha256!==id.slice(6)||
       !new RegExp('^'+asset.sha256+'\\.[a-z0-9]{1,10}$').test(asset.filename)||
       !Number.isSafeInteger(asset.bytes)||asset.bytes<1)throw Error('asset_integrity');
    const root=await fsp.realpath(studio.root),dir=path.join(root,'assets'),file=path.join(dir,asset.filename);
    const directory=await fsp.lstat(dir),before=await fsp.lstat(file);
    if(directory.isSymbolicLink()||!directory.isDirectory()||before.isSymbolicLink()||!before.isFile())throw Error('asset_integrity');
    handle=await fsp.open(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    const current=await handle.stat();
    if(!current.isFile()||before.dev!==current.dev||before.ino!==current.ino||current.size!==asset.bytes)throw Error('asset_integrity');
    const size=current.size;
    // HEAD ignores Range. No strong validator is issued, so If-Range conservatively returns full data.
    const range=byteRange(req.method==='GET'&&!req.headers['if-range']?req.headers.range:undefined,size);
    res.setHeader('content-type',asset.mime);res.setHeader('cache-control','private, no-cache');res.setHeader('accept-ranges','bytes');
    if(range.status===416){res.writeHead(416,{'content-range':`bytes */${size}`,'content-length':'0'});res.end();return;}
    const {start,end}=range;
    res.statusCode=range.status;res.setHeader('content-length',end-start+1);
    if(range.status===206)res.setHeader('content-range',`bytes ${start}-${end}/${size}`);
    if(req.method==='HEAD'){res.end();return;}
    const stream=handle.createReadStream({start,end,autoClose:true});handle=null;
    const stop=()=>stream.destroy();res.once('close',stop);
    stream.once('error',()=>res.destroy());stream.once('close',()=>res.removeListener('close',stop));
    stream.pipe(res);
  } catch(e) {
    if(res.headersSent){res.destroy();return;}
    const error=e.message==='not_found'||e.code==='ENOENT'?'media_file_missing':e.code==='ELOOP'?'asset_integrity':e.message==='asset_integrity'?'asset_integrity':'media_read_unavailable';
    res.writeHead(error==='media_file_missing'?404:error==='asset_integrity'?409:503,{'content-type':'application/json','cache-control':'no-store'});
    res.end(req.method==='HEAD'?undefined:JSON.stringify({error}));
  } finally {await handle?.close();}
}
