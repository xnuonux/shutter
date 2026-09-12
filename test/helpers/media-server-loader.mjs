/** Test-only loader. Existing provider/3D modules are not called by media tests. */
const stubs = {
  'renderer.mjs': 'export class Renderer { async health(){return {mode:"test-provider-disabled"}} }',
  'cut.mjs': 'export function exportCut(){throw Error("legacy_export_not_exercised")}',
  'production-workflow.mjs': 'export function productionWorkflow(studio,id){return {projectId:id,shots:[],takes:[]}};export function decideTake(){throw Error("provider_disabled")}',
  'review-frames.mjs': 'export function reviewFrames(){throw Error("provider_disabled")}',
  'continue-shot.mjs': 'export function continueShot(){throw Error("provider_disabled")}',
  'canvas.mjs': 'export function getCanvas(){throw Error("canvas_not_exercised")};export function saveCanvas(){throw Error("canvas_not_exercised")};export function connectReference(){throw Error("canvas_not_exercised")}'
};
export async function resolve(specifier, context, nextResolve) {
  if(context.parentURL?.endsWith('/src/server.mjs')&&specifier.startsWith('./')&&stubs[specifier.slice(2)]) return {url:'shutter-test:'+specifier.slice(2),shortCircuit:true};
  return nextResolve(specifier,context);
}
export async function load(url, context, nextLoad) {
  if(url.startsWith('shutter-test:'))return {format:'module',source:stubs[url.slice(13)],shortCircuit:true};
  return nextLoad(url,context);
}
