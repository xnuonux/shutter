import fs from 'node:fs/promises';
export async function inspectProcess(tool,args,{signal}={}){if(signal?.aborted)throw Error('insert_plan_cancelled');if(globalThis.__insertInspect)await globalThis.__insertInspect(args);const output=args.at(-1);await fs.writeFile(output,Buffer.alloc(64,7));return {stdout:'',stderr:''};}
