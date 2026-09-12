export const MEMORY_LIMITS={takes:24,rangeUs:86400e6};
export const sourceSelection=(clip)=>({assetId:clip.assetId,sourceStart:clip.sourceStart??'0/1',sampling:clip.sampling??{origin:clip.sourceStart??'0/1',offsetFrames:0}});
export const sameSelection=(a,b)=>a.assetId===b.assetId&&a.sourceStart===(b.sourceStart??'0/1')&&JSON.stringify(a.sampling??null)===JSON.stringify(b.sampling??null);
