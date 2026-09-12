import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const map=new Map([
 ['./store.mjs','stub-store.mjs'],['./media-io.mjs','stub-media-io.mjs'],['./media-inspect.mjs','stub-inspect.mjs'],['./media-edit.mjs','stub-media-edit.mjs'],
 ['../public/memory-contract.mjs','stub-memory-contract.mjs'],['./production-memory.mjs','stub-production-memory.mjs'],['./h3-spec.mjs','stub-h3.mjs'],['./fal-renderer.mjs','stub-fal.mjs']
]);
export async function resolve(specifier,context,nextResolve){
 if(context.parentURL?.endsWith('/src/generative-inserts.mjs')&&map.has(specifier))return {url:pathToFileURL(path.join(root,map.get(specifier))).href,shortCircuit:true};
 return nextResolve(specifier,context);
}
