export const ACTION_VERSION = 'shutter-actions-v1';
const asset = 'asset_' + 'a'.repeat(64);
const id = {type:'string', minLength:1, maxLength:100, pattern:'^[A-Za-z0-9_-]+$'};
const frames = {type:'integer', minimum:0, maximum:1728000};
const positiveFrames = {type:'integer', minimum:1, maximum:1728000};
const time = {type:'string', pattern:'^(?:\\d{1,13}/[1-9]\\d{0,9}|\\d{1,12}(?:\\.\\d{1,6})?)$'};
const assetId = {type:'string', pattern:'^asset_[a-f0-9]{64}$'};
const fit = {type:'string', enum:['contain','cover']};

const obj = (properties, required=[]) => ({type:'object',properties,required,additionalProperties:false});
const cue = obj({id,kind:{type:'string',enum:['caption','title','lower-third']},startFrame:frames,endFrame:positiveFrames,text:{type:'string',minLength:1,maxLength:480}},['id','kind','startFrame','endFrame','text']);
const marker = obj({id,frame:frames,label:{type:'string',minLength:1,maxLength:160},kind:{type:'string',enum:['cue','verse','chorus','hit','note']}},['id','frame','label','kind']);
const music = obj({schema:{const:'shutter-music-map-v1'},bpm:time,beatsPerBar:{type:'integer',minimum:1,maximum:12},beatUnit:{type:'integer',enum:[2,4,8,16]},offsetFrames:frames},['schema','bpm','beatsPerBar','beatUnit','offsetFrames']);
const soundClip = obj({id,assetId,streamIndex:{type:'integer',minimum:0,maximum:1023},atSample:{type:'integer',minimum:0,maximum:691200000},sourceInSample:{type:'integer',minimum:0,maximum:691200000},samples:{type:'integer',minimum:1,maximum:691200000},gainDb:{type:'number',minimum:-60,maximum:12},fadeInSamples:{type:'integer',minimum:0,maximum:691200000},fadeOutSamples:{type:'integer',minimum:0,maximum:691200000}},['id','assetId','streamIndex','atSample','sourceInSample','samples','gainDb','fadeInSamples','fadeOutSamples']);
const soundPatchSample = {type:'integer',minimum:0,maximum:691200000};
const soundTrack = obj({id,name:{type:'string',minLength:1,maxLength:80},role:{type:'string',enum:['dialogue','voice','ambience','effects','music']},gainDb:{type:'number',minimum:-60,maximum:12},mute:{type:'boolean'},solo:{type:'boolean'},clips:{type:'array',items:soundClip,maxItems:64}},['id','name','role','gainDb','mute','solo','clips']);
const coverage = obj({id,assetId,sourceStart:time,at:frames,frames:positiveFrames,fit},['id','assetId','sourceStart','at','frames','fit']);
const visualClip = obj({id,assetId,sourceStart:time,frames:positiveFrames,fit},['id','assetId','sourceStart','frames','fit']);

const defs = [
 ['split','split a picture clip at a scene frame',{clipId:id,frame:positiveFrames,newId:id},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'split',clipId:'clip_a',frame:48,newId:'clip_b'}]}],
 ['trim-end','set a picture clip duration',{clipId:id,frames:positiveFrames},{pictureTiming:'ripple',sound:'preserve',examples:[{type:'trim-end',clipId:'clip_a',frames:72}]}],
 ['slip','change a clip source in point',{clipId:id,sourceStart:time},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'slip',clipId:'clip_a',sourceStart:'3/2'}]}],
 ['replace','replace a picture clip asset; sourceStart is rational seconds and defaults to 0',{clipId:id,assetId,sourceStart:time},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'replace',clipId:'clip_a',assetId:asset}]}],
 ['move','reorder a picture clip',{clipId:id,toIndex:{type:'integer',minimum:0,maximum:249}},{pictureTiming:'ripple',sound:'preserve',examples:[{type:'move',clipId:'clip_a',toIndex:1}]}],
 ['remove','remove a picture clip',{clipId:id},{pictureTiming:'ripple',sound:'preserve',examples:[{type:'remove',clipId:'clip_a'}]}],
 ['duplicate','duplicate a picture clip',{clipId:id,newId:id},{pictureTiming:'ripple',sound:'preserve',examples:[{type:'duplicate',clipId:'clip_a',newId:'clip_b'}]}],
 ['fit','set picture fit mode',{clipId:id,fit},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'fit',clipId:'clip_a',fit:'cover'}]}],
 ['marker-add','add an authored timeline marker',{marker},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'marker-add',marker:{id:'mark_a',frame:48,label:'impact',kind:'hit'}}]}],
 ['marker-remove','remove an authored marker',{markerId:id},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'marker-remove',markerId:'mark_a'}]}],
 ['music','set or clear the beat map',{music:{oneOf:[music,{type:'null'}]}},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'music',music:{schema:'shutter-music-map-v1',bpm:'120/1',beatsPerBar:4,beatUnit:4,offsetFrames:0}}]}],
 ['coverage-add','add alternate camera coverage on shared scene time',{coverage},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'coverage-add',coverage:{id:'cov_a',assetId:asset,sourceStart:'1/2',at:36,frames:24,fit:'cover'}}]}],
 ['coverage-remove','remove alternate camera coverage and restore visible main footage without shifting the scene clock',{coverageId:id},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'coverage-remove',coverageId:'cov_a'}]}],
 ['sound-enable','enable the shared sound stage',{}, {pictureTiming:'preserve',sound:'change',examples:[{type:'sound-enable'}]}],
 ['sound-output','set master output gain',{gainDb:{type:'number',minimum:-60,maximum:0}}, {pictureTiming:'preserve',sound:'change',examples:[{type:'sound-output',gainDb:-3}]}],
 ['sound-master','set master mute and solo',{value:obj({mute:{type:'boolean'},solo:{type:'boolean'}},['mute','solo'])},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-master',value:{mute:false,solo:false}}]}],
 ['sound-track-add','add a sound track',{track:soundTrack},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-track-add',track:{id:'track_a',name:'dialogue',role:'dialogue',gainDb:0,mute:false,solo:false,clips:[]}}]}],
 ['sound-track-remove','remove a sound track',{trackId:id},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-track-remove',trackId:'track_a'}]}],
 ['sound-track-update','update sound track controls',{trackId:id,patch:obj({name:{type:'string',minLength:1,maxLength:80},role:{type:'string',enum:['dialogue','voice','ambience','effects','music']},gainDb:{type:'number',minimum:-60,maximum:12},mute:{type:'boolean'},solo:{type:'boolean'}})},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-track-update',trackId:'track_a',patch:{mute:true}}]}],
 ['sound-clip-add','add an authored sound clip',{trackId:id,clip:soundClip},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-clip-add',trackId:'track_a',clip:{id:'sound_a',assetId:asset,streamIndex:0,atSample:0,sourceInSample:0,samples:48000,gainDb:0,fadeInSamples:0,fadeOutSamples:0}}]}],
 ['sound-clip-remove','remove an authored sound clip',{trackId:id,clipId:id},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-clip-remove',trackId:'track_a',clipId:'sound_a'}]}],
 ['sound-clip-update','update authored sound timing in 48 kHz sample units or gain',{trackId:id,clipId:id,patch:obj({atSample:soundPatchSample,sourceInSample:soundPatchSample,samples:{type:'integer',minimum:1,maximum:691200000},gainDb:{type:'number',minimum:-60,maximum:12},fadeInSamples:soundPatchSample,fadeOutSamples:soundPatchSample})},{pictureTiming:'preserve',sound:'change',examples:[{type:'sound-clip-update',trackId:'track_a',clipId:'sound_a',patch:{atSample:48000}}]}],
 ['text-put','create or replace a text cue',{cue},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'text-put',cue:{id:'cue_a',kind:'caption',startFrame:0,endFrame:24,text:'hello'}}]}],
 ['text-delete','delete a text cue',{cueId:id},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'text-delete',cueId:'cue_a'}]}],
 ['text-delivery','set caption delivery mode',{delivery:{type:'string',enum:['sidecar','burn-and-sidecar']}},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'text-delivery',delivery:'sidecar'}]}],
 ['text-import','import plain SRT or VTT cues; timestamps are rational seconds and content is capped at 1048576 bytes',{content:{type:'string',minLength:1,maxLength:1048576},sourceFormat:{type:'string',enum:['srt','vtt']},mode:{type:'string',enum:['append','replace-captions']},idPrefix:id},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'text-import',content:'1\n00:00:00,000 --> 00:00:01,000\nhello',sourceFormat:'srt',mode:'append',idPrefix:'import'}]}],
 ['insert','insert a picture clip at an index',{toIndex:{type:'integer',minimum:0,maximum:249},clip:visualClip},{pictureTiming:'ripple',sound:'preserve',examples:[{type:'insert',toIndex:0,clip:{id:'clip_new',assetId:asset,sourceStart:'0/1',frames:24,fit:'cover'}}]}],
 ['coverage-update','update existing alternate coverage',{coverageId:id,coverage},{pictureTiming:'preserve',sound:'preserve',examples:[{type:'coverage-update',coverageId:'cov_a',coverage:{id:'cov_a',assetId:asset,sourceStart:'1/2',at:36,frames:24,fit:'cover'}}]}],
 ['soundtrack','set or clear soundtrack',{soundtrack:{oneOf:[{type:'null'},obj({assetId,tailPolicy:{const:'pad-silence'}},['assetId','tailPolicy'])]}},{pictureTiming:'preserve',sound:'change',examples:[{type:'soundtrack',soundtrack:{assetId:asset,tailPolicy:'pad-silence'}}]}],
 ['undo','restore the previous committed edit',{}, {pictureTiming:'restore',sound:'restore',examples:[{type:'undo'}]}],
 ['redo','reapply the next edit in history',{}, {pictureTiming:'restore',sound:'restore',examples:[{type:'redo'}]}],
];

export const ACTIONS = Object.freeze(defs.map(([type,description,properties,meta]) => { const {examples,...effects}=meta; const required = type==='replace' ? ['type','clipId','assetId'] : ['type',...Object.keys(properties)]; return Object.freeze({type,description,inputSchema:obj({type:{const:type},...properties},required),effects,examples:Object.freeze(examples)}); }));
export const COMMAND_SCHEMA = Object.freeze({oneOf:ACTIONS.map(a=>a.inputSchema)});
const allowed = new Set(['type','enum','const','properties','required','additionalProperties','oneOf','anyOf','items','minItems','maxItems','minLength','maxLength','pattern','minimum','maximum']);
function fail(path, reason) { throw Error(`action_arguments: ${path} ${reason}`); }
export function validateSchema(schema, value, path='arguments') {
  if (!schema || typeof schema !== 'object') fail(path,'schema_invalid');
  for (const key of Object.keys(schema)) if (!allowed.has(key)) throw Error(`unsupported schema keyword: ${key}`);
  if (schema.oneOf || schema.anyOf) {
    const list=schema.oneOf||schema.anyOf, matches=[];
    for (const s of list) { try { validateSchema(s,value,path); matches.push(s); } catch (error) { if (String(error.message).startsWith('unsupported schema keyword:')) throw error; } }
    const valid = schema.oneOf ? matches.length===1 : matches.length>0;
    if (!valid) fail(path, schema.oneOf ? 'must_match_exactly_one' : 'does_not_match');
    return value;
  }
  if (schema.const !== undefined && value !== schema.const) fail(path,'must_equal');
  if (schema.enum && !schema.enum.some(v=>Object.is(v,value))) fail(path,'enum');
  if (schema.type==='null' && value!==null) fail(path,'type_null');
  if (schema.type==='string' && typeof value!=='string') fail(path,'type_string');
  if (schema.type==='integer' && (!Number.isSafeInteger(value))) fail(path,'type_integer');
  if (schema.type==='number' && (typeof value!=='number'||!Number.isFinite(value))) fail(path,'type_number');
  if (schema.type==='boolean' && typeof value!=='boolean') fail(path,'type_boolean');
  if (schema.type==='array' && !Array.isArray(value)) fail(path,'type_array');
  if (schema.type==='object' && (!value||typeof value!=='object'||Array.isArray(value))) fail(path,'type_object');
  if (typeof value==='string') {if(schema.minLength!==undefined&&[...value].length<schema.minLength)fail(path,'minLength');if(schema.maxLength!==undefined&&[...value].length>schema.maxLength)fail(path,'maxLength');if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail(path,'pattern');}
  if (typeof value==='number') {if(schema.minimum!==undefined&&value<schema.minimum)fail(path,'minimum');if(schema.maximum!==undefined&&value>schema.maximum)fail(path,'maximum');}
  if (Array.isArray(value)) {if(schema.minItems!==undefined&&value.length<schema.minItems)fail(path,'minItems');if(schema.maxItems!==undefined&&value.length>schema.maxItems)fail(path,'maxItems');if(schema.items)value.forEach((v,i)=>validateSchema(schema.items,v,`${path}.${i}`));}
  if (schema.type==='object') {for(const k of schema.required||[])if(!Object.hasOwn(value,k))fail(`${path}.${k}`,'required');if(schema.additionalProperties===false)for(const k of Object.keys(value))if(!Object.hasOwn(schema.properties||{},k))fail(`${path}.${k}`,'unknown');for(const [k,s] of Object.entries(schema.properties||{}))if(Object.hasOwn(value,k))validateSchema(s,value[k],`${path}.${k}`);}
  return value;
}
export function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) fail('arguments','type_object');
  const action = ACTIONS.find(a => a.type === command.type);
  if (!action) fail('arguments','unknown_command');
  return validateSchema(action.inputSchema, command);
}

