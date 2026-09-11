/** Stored ZIP32 handoffs, streamed from local render files. No dependencies. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
const limit=0xffffffff;
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crcUpdate(crc,bytes){for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return crc>>>0;}
/** Returns false before creating a file when ZIP64 would be required. */
export async function writeBridgeZip(folder,names,destination) {
 if(!Array.isArray(names)||names.length>65535||new Set(names).size!==names.length)throw Error('zip_entries');
 const entries=[];let estimate=22;
 for(const name of names){
  if(typeof name!=='string'||path.basename(name)!==name||!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('zip_name');
  const filename=path.join(folder,name),stat=await fsp.lstat(filename),encoded=Buffer.from(name);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('zip_source');
  estimate+=stat.size+30+46+16+encoded.length*2;
  if(stat.size>=limit||estimate>=limit)return false;
  entries.push({filename,encoded,size:stat.size});
 }
 const handle=await fsp.open(destination,'wx');let offset=0,complete=false;
 async function write(b){let at=0;while(at<b.length){const r=await handle.write(b,at,b.length-at);if(!r.bytesWritten)throw Error('zip_write');at+=r.bytesWritten;offset+=r.bytesWritten;}}
 try{
  for(const e of entries){
   e.offset=offset;const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0808,6);h.writeUInt16LE(33,12);h.writeUInt16LE(e.encoded.length,26);
   await write(h);await write(e.encoded);let crc=0xffffffff,size=0;
   for await(const b of fs.createReadStream(e.filename)){size+=b.length;crc=crcUpdate(crc,b);await write(b);}
   if(size!==e.size)throw Error('zip_source_changed');e.crc=(crc^0xffffffff)>>>0;
   const d=Buffer.alloc(16);d.writeUInt32LE(0x08074b50);d.writeUInt32LE(e.crc,4);d.writeUInt32LE(size,8);d.writeUInt32LE(size,12);await write(d);
  }
  const start=offset;
  for(const e of entries){const h=Buffer.alloc(46);h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(0x0808,8);h.writeUInt16LE(33,14);h.writeUInt32LE(e.crc,16);h.writeUInt32LE(e.size,20);h.writeUInt32LE(e.size,24);h.writeUInt16LE(e.encoded.length,28);h.writeUInt32LE(e.offset,42);await write(h);await write(e.encoded);}
  const size=offset-start,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(start,16);await write(end);await handle.sync();complete=true;return true;
 }finally{await handle.close();if(!complete)await fsp.rm(destination,{force:true});}
}
