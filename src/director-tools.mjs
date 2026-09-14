/** Discoverable adapters for existing source and direction workflows. No provider. */
import {MAX_FRAMES} from '../public/music-edit.mjs';
import {MEMORY_LIMITS} from '../public/memory-contract.mjs';
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const id={type:'string',minLength:1,maxLength:100,pattern:'^[A-Za-z0-9_-]+$'},revision={type:'integer',minimum:0};
const text=max=>({type:'string',maxLength:max}),requiredText=max=>({...text(max),minLength:1});
const sourceTime={type:'integer',minimum:0,maximum:MEMORY_LIMITS.rangeUs};
const brief=object({goal:requiredText(2000),continuity:{type:'array',maxItems:12,items:requiredText(600)},query:text(240),coverage:object({at:{type:'integer',minimum:0,maximum:MAX_FRAMES},end:{type:'integer',minimum:1,maximum:MAX_FRAMES},sourceOffsetUs:sourceTime})},['goal','continuity']);
const moment=object({id,assetId:{type:'string',pattern:'^asset_[a-f0-9]{64}$'},startUs:sourceTime,endUs:{...sourceTime,minimum:1},label:requiredText(160),notes:text(2000),tags:{type:'array',maxItems:16,items:requiredText(60)},favorite:{type:'boolean'}},['id','assetId','startUs','endUs','label']);

export const directorTools=[
  ['shutter_search_moments','Find saved source ranges by literal words/prefixes in notes, names and tags. Searches this production only; returns up to 50 records with revisions and nextOffset. Empty query browses. This is lexical search, not image understanding. Inspect authorship; notes are claims, not verified continuity.',object({projectId:id,query:text(240),favorite:{type:'boolean'},kind:{enum:['all','video','image','audio']},offset:{type:'integer',minimum:0,maximum:5000}},['projectId']),true],
  ['shutter_save_moment','Save a director-authored note about an existing local source range. Use stable moment.id; baseRevision is 0 for a new note or its observed revision. Times are integer microseconds, end exclusive. Inspect footage before describing it; never invent observations. Verifies the source and range, changes no edit. After uncertain completion search/read back that same id; do not invent a replacement id. A stale retry conflicts.',object({projectId:id,baseRevision:revision,moment}),false],
  ['shutter_get_direction','Read a Studio shot’s saved goal, continuity requirements and latest proposal. Returns separate timelineRevision and directionRevision (0 when absent). A saved proposal may be stale; rebuild it against current revisions before using a candidate command.',object({projectId:id,clipId:id}),true],
  ['shutter_save_direction','Save a director-authored scene goal, continuity requirements and optional source query/cutaway timing for a saved Studio shot. Requires the observed timelineRevision and direction baseRevision. Coverage uses integer output frames and sourceOffsetUs uses microseconds. A stale cut or direction conflicts. Does not edit footage or approve continuity. After an uncertain response read direction again; do not repeat with a new revision blindly.',object({projectId:id,clipId:id,timelineRevision:{type:'integer',minimum:1},baseRevision:revision,brief}),false],
  ['shutter_propose_shots','Build up to 12 source candidates from saved direction and marked moments. Returns source fit, notes and an edit command per candidate. To choose one, send proposal={proposalId: returned id, momentId: candidate.momentId} with exactly that command through preview, evidence and apply. Context changes reject the edit; rebuild first. Does not approve continuity.',object({projectId:id,clipId:id,baseRevision:{type:'integer',minimum:1},directionRevision:{type:'integer',minimum:1}}),false]
];

/** Called only after the MCP bridge validates the selected tool's closed schema. */
export function invokeDirectorTool(name,args,api){
  const {projectId,clipId,...input}=args,root='/api/media/productions/'+encodeURIComponent(projectId);
  if(name==='shutter_search_moments'){
    const {query='',favorite=false,kind='all',offset=0}=input;
    return api(root+'/memory?'+new URLSearchParams({q:query,favorite:String(favorite),kind,offset:String(offset)}));
  }
  if(name==='shutter_save_moment')return api(root+'/memory',{...input,authoredBy:'director'});
  const route=root+'/direction/'+encodeURIComponent(clipId);
  if(name==='shutter_get_direction')return api(route);
  if(name==='shutter_save_direction')return api(route,{...input,authoredBy:'director'},'PUT');
  if(name==='shutter_propose_shots')return api(route+'/proposals',input);
  throw Error('Unknown director tool.');
}
