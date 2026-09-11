/** Plain, frame-anchored authored text. Shared by the browser and server; no renderer markup. */
export const TEXT_SCHEMA = 'shutter-text-v1';
export const TEXT_LIMITS = Object.freeze({cues:2000, characters:480, importBytes:1048576, frame:10368000});
const fail = code => { throw Error(code); };
const keys = (value, allowed) => value && typeof value === 'object' && [Object.prototype,null].includes(Object.getPrototypeOf(value)) && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k));
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const frame = n => Number.isSafeInteger(n) && n >= 0 && n <= TEXT_LIMITS.frame;
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export function textRate(value) {
  const m = String(value).match(/^(\d{1,9})(?:\/(\d{1,9}))?$/);
  if (!m) fail('text_frame_rate');
  const n=BigInt(m[1]),d=BigInt(m[2]||1);
  if (!d || n < d || n > 120n*d) fail('text_frame_rate');
  return {n,d};
}
export function plainText(value) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > TEXT_LIMITS.characters) fail('text_content');
  // ASS override syntax, invalid Unicode, invisible controls and SRT block separators are not accepted.
  // Do not mutate authored characters into something merely similar-looking.
  if (/[\\{}\u0000-\u0009\u000b-\u001f\u007f\ufffd\ud800-\udfff]/u.test(value) || /\n\s*\n/.test(value)) fail('text_plain_only');
  if ([...value].some(c=>{const n=c.codePointAt(0);return (n&65535)>=65534||(n>=0xfdd0&&n<=0xfdef);})) fail('text_noncharacter');
  if (value.split('\n').length > 3) fail('text_line_limit');
  return value;
}
export function emptyTextLayer() { return {schema:TEXT_SCHEMA,captionDelivery:'sidecar',cues:[]}; }
export function normalizeTextLayer(value) {
  if (value === undefined || value === null) return null;
  if (!keys(value,['schema','captionDelivery','cues']) || value.schema !== TEXT_SCHEMA || !['sidecar','burn-and-sidecar'].includes(value.captionDelivery) || !Array.isArray(value.cues) || value.cues.length > TEXT_LIMITS.cues) fail('text_layer_invalid');
  const seen=new Set();
  const cues=value.cues.map(c=>{
    if (!keys(c,['id','kind','startFrame','endFrame','text']) || !id(c.id) || seen.has(c.id) || !['caption','title','lower-third'].includes(c.kind) || !frame(c.startFrame) || !frame(c.endFrame) || c.endFrame<=c.startFrame) fail('text_cue_invalid');
    if(c.kind==='caption'&&/<[^>]*>/.test(c.text))fail('text_caption_markup_unsupported');
    seen.add(c.id);
    return {id:c.id,kind:c.kind,startFrame:c.startFrame,endFrame:c.endFrame,text:plainText(c.text)};
  }).sort((a,b)=>a.startFrame-b.startFrame||compare(a.id,b.id));
  let previousEnd=0;
  for (const c of cues.filter(c=>c.kind==='caption')) {if(c.startFrame<previousEnd)fail('text_caption_overlap');previousEnd=c.endFrame;}
  let active=0;
  for (const [,delta] of cues.flatMap(c=>[[c.startFrame,1],[c.endFrame,-1]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])) if((active+=delta)>4)fail('text_layer_overlap_limit');
  return {schema:TEXT_SCHEMA,captionDelivery:value.captionDelivery,cues};
}
export function textReview(value, pictureFrames, fps) {
  const layer=normalizeTextLayer(value),r=textRate(fps),issues=[];
  if (!frame(pictureFrames)) fail('text_picture_frames');
  for(const c of layer?.cues||[]) {
    if(c.endFrame>pictureFrames)issues.push({id:c.id,code:'outside-picture',blocking:true});
    const seconds=(c.endFrame-c.startFrame)*Number(r.d)/Number(r.n);
    if(c.kind==='caption'&&[...c.text.replace(/\s/g,'')].length/seconds>22)issues.push({id:c.id,code:'fast-reading',blocking:false});
    if(c.text.split('\n').some(line=>[...line].length>42))issues.push({id:c.id,code:'long-line',blocking:false});
  }
  // A lower-third and a caption may compete for space; this is a review prompt, not a quality score.
  const captions=layer?.cues.filter(c=>c.kind==='caption')||[];
  for(const c of layer?.cues.filter(c=>c.kind==='lower-third')||[])if(captions.some(s=>s.startFrame<c.endFrame&&s.endFrame>c.startFrame))issues.push({id:c.id,code:'check-text-collision',blocking:false});
  return issues;
}
export function activeText(value, outputFrame, {forExport=false}={}) {
  return (normalizeTextLayer(value)?.cues||[]).filter(c=>c.startFrame<=outputFrame&&outputFrame<c.endFrame&&(!forExport||c.kind!=='caption'||value.captionDelivery==='burn-and-sidecar'));
}
export function applyTextEdit(edit, command) {
  if (!edit || edit.format!=='shutter-media-edit-v1' || !command) fail('text_edit_required');
  const next=structuredClone(edit),layer=normalizeTextLayer(next.textLayer)||emptyTextLayer();
  switch(command.type) {
    case 'text-put': {
      const at=layer.cues.findIndex(c=>c.id===command.cue?.id);
      if(at<0)layer.cues.push(command.cue);else layer.cues[at]=command.cue;break;
    }
    case 'text-delete': {
      const at=layer.cues.findIndex(c=>c.id===command.cueId);if(at<0)fail('text_cue_not_found');layer.cues.splice(at,1);break;
    }
    case 'text-delivery': layer.captionDelivery=command.delivery;break;
    case 'text-import': {
      if(!['append','replace-captions'].includes(command.mode))fail('text_import_mode');
      const imported=parseCaptions(command.content,command.sourceFormat,next.fps,command.idPrefix);
      if(command.mode==='replace-captions')layer.cues=layer.cues.filter(c=>c.kind!=='caption');
      layer.cues.push(...imported);break;
    }
    default: fail('text_command');
  }
  next.textLayer=normalizeTextLayer(layer);return next;
}
function timestampMs(value, format) {
  const m=(format==='srt'?/^(\d{2,3}):(\d{2}):(\d{2}),(\d{3})$/:/^(?:(\d{2,3}):)?(\d{2}):(\d{2})\.(\d{3})$/).exec(value);
  if(!m||+m[2]>59||+m[3]>59)fail('text_import_timestamp');
  const ms=((+(m[1]||0)*60+ +m[2])*60+ +m[3])*1000+ +m[4];
  if(ms>86400000)fail('text_import_duration');return ms;
}
export function millisecondsToFrame(ms, fps) {
  if(!Number.isSafeInteger(ms)||ms<0||ms>86400000)fail('text_import_timestamp');
  const {n,d}=textRate(fps),den=1000n*d;return Number((BigInt(ms)*n+den-1n)/den);
}
function cuePayload(lines, format) {
  let text=lines.join('\n');
  if(/<[^>]*>/.test(text))fail('text_import_markup_unsupported');
  if(format==='vtt') {
    const entities={'amp':'&','lt':'<','gt':'>','nbsp':'\u00a0','lrm':'\u200e','rlm':'\u200f'};
    if(/&(?!amp;|lt;|gt;|nbsp;|lrm;|rlm;)/.test(text))fail('text_import_entity_unsupported');
    text=text.replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g,(_,k)=>entities[k]);
  }
  return plainText(text);
}
/** Strict plain-text subset. Unsupported styling/settings fail as a whole, never disappear silently. */
export function parseCaptions(input, format, fps, prefix) {
  if(!['srt','vtt'].includes(format)||typeof input!=='string'||new TextEncoder().encode(input).length>TEXT_LIMITS.importBytes||!id(prefix)||prefix.length>60)fail('text_import_invalid');
  textRate(fps);
  const text=input.replace(/^\ufeff/,'').replace(/\r\n?/g,'\n').trim();
  const blocks=text.split(/\n[ \t]*\n/);let offset=0;
  if(format==='vtt') {
    if(!/^WEBVTT(?:[ \t].*)?$/.test(blocks[0])||blocks[0].includes('-->'))fail('text_import_vtt_header');offset=1;
  }
  const cues=[];
  for(const block of blocks.slice(offset)) {
    if(format==='vtt'&&/^NOTE(?:[ \t\n]|$)/.test(block))continue;
    const lines=block.split('\n');
    if(format==='srt') {if(!/^\d+$/.test(lines.shift()||''))fail('text_import_srt_index');}
    else if(!lines[0].includes('-->')) {if(/^(STYLE|REGION)(?:\s|$)/.test(lines[0]))fail('text_import_settings_unsupported');lines.shift();}
    const timing=lines.shift()?.match(/^(\S+)[ \t]+-->[ \t]+(\S+)$/);
    if(!timing||!lines.length)fail('text_import_timing_or_settings');
    const start=timestampMs(timing[1],format),end=timestampMs(timing[2],format);
    if(end<=start)fail('text_import_interval');
    const startFrame=millisecondsToFrame(start,fps),endFrame=millisecondsToFrame(end,fps);
    if(endFrame<=startFrame)fail('text_import_subframe_cue');
    cues.push({id:`${prefix}_${cues.length+1}`,kind:'caption',startFrame,endFrame,text:cuePayload(lines,format)});
    if(cues.length>TEXT_LIMITS.cues)fail('text_import_cue_limit');
  }
  if(!cues.length)fail('text_import_empty');
  return normalizeTextLayer({...emptyTextLayer(),cues}).cues;
}
export function frameMilliseconds(value, fps) {
  if(!frame(value))fail('text_frame');const {n,d}=textRate(fps);
  // Floor (<1 ms early in general players) makes millisecond sidecar -> ceil-to-frame import stable.
  return Number(BigInt(value)*d*1000n/n);
}
function displayTimestamp(ms, separator) {
  const pad=n=>String(n).padStart(2,'0');
  return `${pad(Math.floor(ms/3600000))}:${pad(Math.floor(ms/60000)%60)}:${pad(Math.floor(ms/1000)%60)}${separator}${String(ms%1000).padStart(3,'0')}`;
}
export function exportCaptions(value, fps, format) {
  if(!['srt','vtt'].includes(format))fail('text_export_format');textRate(fps);
  const cues=normalizeTextLayer(value)?.cues.filter(c=>c.kind==='caption')||[];
  const result=cues.map((c,i)=>{
    let text=c.text;
    // SRT player markup escaping is not standardized; reject tag-shaped literals rather than alter them.
    if(format==='srt'&&/<[^>]*>/.test(text))fail('text_srt_literal_markup_unsupported');
    if(format==='vtt')text=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `${i+1}\n${displayTimestamp(frameMilliseconds(c.startFrame,fps),format==='srt'?',':'.')} --> ${displayTimestamp(frameMilliseconds(c.endFrame,fps),format==='srt'?',':'.')}\n${text}`;
  }).join('\n\n');return (format==='vtt'?'WEBVTT\n\n':'')+result+(result?'\n':'');
}
