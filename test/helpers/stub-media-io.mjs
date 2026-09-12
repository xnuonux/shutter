import path from 'node:path';
export const decoderArgs=[];
export const getMediaProfile=(studio,id)=>studio.read('media_'+id,'media-profile');
export const verifyMediaAsset=async(studio,id)=>studio.read(id,'asset');
export async function importMediaFile(studio,filename,metadata={}){
 const n=(globalThis.__insertImported=(globalThis.__insertImported||0)+1),sha=String(n).padStart(64,'a').slice(-64),id='asset_'+sha;
 const asset=studio.write('asset',{id,sha256:sha,filename:sha+'.png',bytes:64,kind:'image',mime:'image/png',name:metadata.name||path.basename(filename),origin:metadata.origin||''});
 studio.write('media-profile',{id:'media_'+id,assetId:id,assetSha256:sha,kind:'image',width:1920,height:1080,videoStream:0,duration:null});return {...asset,media:studio.read('media_'+id,'media-profile')};
}
export async function ensureMediaProfile(studio,id){return studio.read('media_'+id,'media-profile');}
