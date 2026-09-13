import {normalizeTextLayer} from './text-edit.mjs';
/** Pure, shared edit algebra. Frame positions are integers; source time is rational.
 * No DOM, clock, random IDs, asset mutation, playback, or provider side effects. */
export const MUSIC_SCHEMA = 'shutter-music-map-v1';
export const MAX_FRAMES = 120 * 4 * 3600;
const fail = code => { throw Error(code); };
const int = (v, min = 0, max = MAX_FRAMES) => Number.isSafeInteger(v) && v >= min && v <= max;
const identity = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const gcd = (a, b) => b ? gcd(b, a % b) : a;
function fraction(n, d) {
  if (d <= 0n || n < 0n) fail('source_time_negative');
  const g = gcd(n, d); n /= g; d /= g;
  if (n > 1000000000000n || d > 1000000000n) fail('time_precision_limit');
  return {n, d};
}
export function exact(value, zero = false) {
  const s = String(value); let n, d;
  if (/^\d{1,13}\/\d{1,10}$/.test(s)) [n, d] = s.split('/').map(BigInt);
  else if (/^\d{1,12}(?:\.\d{1,6})?$/.test(s)) {
    const [a, b = ''] = s.split('.'); d = 10n ** BigInt(b.length); n = BigInt(a) * d + BigInt(b || '0');
  } else fail('time_invalid');
  const r = fraction(n, d); if (!zero && r.n === 0n) fail('time_zero'); return r;
}
export const asText = r => `${r.n}/${r.d}`;
export const asNumber = r => Number(r.n) / Number(r.d);
export function advanceSource(start, frames, fps) {
  if (!int(Math.abs(frames))) fail('frame_delta');
  const s = exact(start, true), f = exact(fps);
  return asText(fraction(s.n * f.n + BigInt(frames) * f.d * s.d, s.d * f.n));
}
export const totalFrames = edit => edit.clips.reduce((n, c) => n + c.frames, 0);
export function placements(edit) {
  let at = 0;
  return edit.clips.map(c => { const item = {...c, at, end: at + c.frames}; at += c.frames; return item; });
}
export function clipAt(edit, frame) {
  if (!int(frame)) fail('timeline_frame');
  const cover=(edit.coverage||[]).find(c=>c.at<=frame&&frame<c.at+c.frames);
  if(cover)return {...cover,end:cover.at+cover.frames,layer:'coverage'};
  return placements(edit).find(c => c.at <= frame && frame < c.end) || null;
}
/** Coverage shares the main scene clock. It never changes the length of picture. */
export function validateCoverage(edit) {
  const covers=edit.coverage??[];
  if(!Array.isArray(covers)||covers.length>250)fail('coverage_invalid');
  const seen=new Set(edit.clips.map(c=>c.id)),end=totalFrames(edit);
  let previousEnd=0;
  for(const c of [...covers].sort((a,b)=>a.at-b.at)){
    if(!c||!identity(c.id)||seen.has(c.id))fail('coverage_identity');
    seen.add(c.id);
    if(!int(c.at)||!int(c.frames,1)||c.at+c.frames>end)fail('coverage_range');
    if(c.at<previousEnd)fail('coverage_overlap');
    previousEnd=c.at+c.frames;
  }
  return covers;
}
/** Resolve only the visible intervals, retaining each source's original sampling clock. */
export function pictureClips(edit) {
  const main=placements(edit),covers=validateCoverage(edit),end=totalFrames(edit);
  const boundaries=[...new Set([0,end,...main.flatMap(c=>[c.at,c.end]),...covers.flatMap(c=>[c.at,c.at+c.frames])])].sort((a,b)=>a-b);
  const runs=[];
  for(let i=0;i<boundaries.length-1;i++){
    const at=boundaries[i],frames=boundaries[i+1]-at;
    const source=covers.find(c=>c.at<=at&&at<c.at+c.frames)||main.find(c=>c.at<=at&&at<c.end);
    if(!source||!frames)continue;
    const previous=runs.at(-1);
    if(previous&&previous.id===source.id&&previous.at+previous.frames===at){previous.frames+=frames;continue;}
    const sampling=samplingFor(source,edit.fps),offset=at-source.at;
    const image=source.sourceKind==='image';
    const selectedSampling={origin:sampling.origin,offsetFrames:image?0:sampling.offsetFrames+offset};
    runs.push({...source,at,frames,sourceStart:image?'0/1':advanceSource(selectedSampling.origin,selectedSampling.offsetFrames,edit.fps),sampling:selectedSampling,layer:covers.includes(source)?'coverage':'main'});
  }
  return runs;
}
export function normalizeMusic(value) {
  if (value === undefined || value === null) return null;
  if (!value || value.schema !== MUSIC_SCHEMA || Object.keys(value).some(k => !['schema','bpm','beatsPerBar','beatUnit','offsetFrames'].includes(k))) fail('music_map_invalid');
  const bpm = exact(value.bpm);
  if (asNumber(bpm) < 20 || asNumber(bpm) > 400 || !int(value.beatsPerBar, 1, 12) || ![2,4,8,16].includes(value.beatUnit) || !int(value.offsetFrames)) fail('music_map_range');
  return {schema: MUSIC_SCHEMA, bpm: asText(bpm), beatsPerBar: value.beatsPerBar, beatUnit: value.beatUnit, offsetFrames: value.offsetFrames};
}
export function normalizeMarkers(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2000) fail('markers_invalid');
  const seen = new Set();
  return value.map(m => {
    if (!m || Object.keys(m).some(k => !['id','frame','label','kind'].includes(k)) || !identity(m.id) || seen.has(m.id) || !int(m.frame) || typeof m.label !== 'string' || !m.label.trim() || m.label.length > 160 || /[\u0000-\u001f\u007f]/.test(m.label) || !['cue','verse','chorus','hit','note'].includes(m.kind)) fail('marker_invalid');
    seen.add(m.id); return {id: m.id, frame: m.frame, label: m.label.trim(), kind: m.kind};
  }).sort((a,b) => a.frame - b.frame || a.id.localeCompare(b.id));
}
/** BPM always means quarter notes per minute, including 6/8 and 3/4. */
export function frameAtBeat(index, music, fps) {
  if (!int(index, 0, 1000000)) fail('beat_index');
  const m = normalizeMusic(music); if (!m) fail('music_map_required');
  const b = exact(m.bpm), f = exact(fps);
  const n = BigInt(index) * 240n * b.d * f.n;
  const d = b.n * BigInt(m.beatUnit) * f.d;
  return m.offsetFrames + Number((n + d / 2n) / d);
}
export function beatGrid(music, fps, start, end, maxTicks = 2048) {
  if (!int(start) || !int(end, start) || !int(maxTicks, 1, 10000)) fail('beat_range');
  const m = normalizeMusic(music); if (!m) return [];
  const step = 240 * asNumber(exact(fps)) / (asNumber(exact(m.bpm)) * m.beatUnit);
  const first = Math.max(0, Math.floor((start - m.offsetFrames) / step) - 1);
  const last = Math.max(0, Math.ceil((end - m.offsetFrames) / step) + 1);
  const stride = Math.max(1, Math.ceil((last - first + 1) / maxTicks));
  const grid = [];
  for (let i = first; i <= last; i += stride) {
    const frame = frameAtBeat(i, m, fps);
    if (frame >= start && frame <= end && grid.at(-1)?.frame !== frame) grid.push({frame, index: i, bar: Math.floor(i / m.beatsPerBar) + 1, beat: i % m.beatsPerBar + 1});
  }
  return grid;
}
export function snapFrame(edit, frame, tolerance = 6) {
  if (!int(frame) || !int(tolerance, 0, 120)) fail('snap_range');
  const candidates = [0, totalFrames(edit), ...placements(edit).map(c => c.at), ...normalizeMarkers(edit.markers).map(m => m.frame)];
  if (edit.music) candidates.push(...beatGrid(edit.music, edit.fps, Math.max(0, frame-tolerance), Math.min(MAX_FRAMES,frame+tolerance)).map(b => b.frame));
  return candidates.filter(n => Math.abs(n-frame) <= tolerance).sort((a,b) => Math.abs(a-frame)-Math.abs(b-frame) || a-b)[0] ?? frame;
}
export function samplingFor(clip, fps) {
  if (clip.sampling === undefined) return {origin: asText(exact(clip.sourceStart ?? '0', true)), offsetFrames: 0};
  const s = clip.sampling;
  if (!s || Object.keys(s).some(k => !['origin','offsetFrames'].includes(k)) || !int(s.offsetFrames)) fail('sampling_invalid');
  const origin = asText(exact(s.origin, true));
  if (advanceSource(origin, s.offsetFrames, fps) !== asText(exact(clip.sourceStart ?? '0', true))) fail('sampling_clock_mismatch');
  return {origin, offsetFrames: s.offsetFrames};
}
/** Reject unavailable handles locally too. The server compiler is final authority. */
export function validateVisuals(edit, profiles) {
  normalizeTextLayer(edit?.textLayer);
  if (!edit || edit.format !== 'shutter-media-edit-v1' || !Array.isArray(edit.clips) || edit.clips.length > 250) fail('media_edit_invalid');
  const fps = asNumber(exact(edit.fps));
  if (fps < 1 || fps > 120 || totalFrames(edit) / fps > 14400) fail('media_edit_duration');
  const ids = new Set();
  const covers=validateCoverage(edit);
  for (const c of [...edit.clips,...covers]) {
    if (!identity(c.id) || ids.has(c.id) || !int(c.frames, 1, 10000000) || !['contain','cover'].includes(c.fit)) fail('media_clip_invalid');
    ids.add(c.id); const p = profiles instanceof Map ? profiles.get(c.assetId) : Object.hasOwn(profiles || {}, c.assetId) ? profiles[c.assetId] : null;
    if (!p || !['image','video'].includes(p.kind)) fail('visual_media_required');
    const source = asNumber(exact(c.sourceStart ?? '0', true)); samplingFor(c, edit.fps);
    if (p.kind === 'image' && source !== 0) fail('still_source_start');
    if (p.kind === 'video' && (!Number.isFinite(p.duration) || source + c.frames/fps > p.duration + 0.000001)) fail('media_source_range');
  }
  normalizeMusic(edit.music); normalizeMarkers(edit.markers); return edit;
}
/** Commands are atomic: rejection leaves the caller's input and soundtrack untouched. */
export function applyEdit(edit, command, profiles) {
  validateVisuals(edit, profiles);
  const next = structuredClone(edit), op = command || {};
  const index = next.clips.findIndex(c => c.id === op.clipId);
  const selected = () => { if (index < 0) fail('clip_not_found'); return next.clips[index]; };
  const freshId = id => { if (!identity(id) || next.clips.some(c => c.id === id)) fail('new_clip_identity'); return id; };
  switch (op.type) {
    case 'split': {
      if (!int(op.frame)) fail('timeline_frame');
      const c = selected(), p = placements(next)[index], left = op.frame - p.at;
      if (left <= 0 || left >= c.frames) fail('split_at_boundary');
      const profile = profiles instanceof Map ? profiles.get(c.assetId) : profiles[c.assetId];
      const right = {...c, id: freshId(op.newId), frames: c.frames-left};
      if (profile.kind === 'video') {
        const sampling = samplingFor(c, next.fps);
        c.sampling = sampling;
        right.sampling = {origin: sampling.origin, offsetFrames: sampling.offsetFrames + left};
        right.sourceStart = advanceSource(sampling.origin, right.sampling.offsetFrames, next.fps);
      }
      c.frames = left; next.clips.splice(index+1,0,right); break;
    }
    case 'trim-end': {
      const c = selected(); if (!int(op.frames,1,10000000)) fail('media_clip_frames'); c.frames = op.frames; break;
    }
    case 'slip': {
      const c = selected(); c.sourceStart = asText(exact(op.sourceStart,true)); delete c.sampling; break;
    }
    case 'replace': {
      const c = selected(); if (typeof op.assetId !== 'string') fail('asset_required');
      c.assetId = op.assetId; c.sourceStart = asText(exact(op.sourceStart ?? '0',true)); delete c.sampling; break;
    }
    case 'move': {
      const c = selected(); if (!int(op.toIndex,0,next.clips.length-1)) fail('move_index'); next.clips.splice(index,1); next.clips.splice(op.toIndex,0,c); break;
    }
    case 'remove': selected(); next.clips.splice(index,1); break;
    case 'duplicate': { const c = selected(); next.clips.splice(index+1,0,{...structuredClone(c),id:freshId(op.newId)}); break; }
    case 'fit': { const c = selected(); if (!['contain','cover'].includes(op.fit)) fail('media_fit'); c.fit=op.fit; break; }
    case 'marker-add': next.markers = normalizeMarkers([...(next.markers||[]),op.marker]); break;
    case 'marker-remove': {
      if (!normalizeMarkers(next.markers).some(m=>m.id===op.markerId)) fail('marker_not_found');
      next.markers = next.markers.filter(m=>m.id!==op.markerId); break;
    }
    case 'music': next.music = normalizeMusic(op.music); break;
    case 'coverage-add': next.coverage=[...(next.coverage||[]),structuredClone(op.coverage)];break;
    case 'coverage-remove': {
      if(!(next.coverage||[]).some(c=>c.id===op.coverageId))fail('coverage_not_found');
      next.coverage=next.coverage.filter(c=>c.id!==op.coverageId);break;
    }
    default: fail('edit_command_unsupported');
  }
  return validateVisuals(next, profiles);
}
/** Bounded in-memory editing history. Persistence/recovery is separately revision-bound. */
export class EditHistory {
  constructor(edit, limit = 80) {
    if (!int(limit,1,200)) fail('history_limit'); this.limit=limit; this.reset(edit);
  }
  reset(edit) { this.current=structuredClone(edit); this.past=[]; this.future=[]; }
  commit(edit) {
    if (JSON.stringify(edit)===JSON.stringify(this.current)) return false;
    this.past.push(this.current); if(this.past.length>this.limit)this.past.shift();
    this.current=structuredClone(edit); this.future=[]; return true;
  }
  undo() { if(!this.past.length)return null;this.future.push(this.current);this.current=this.past.pop();return structuredClone(this.current); }
  redo() { if(!this.future.length)return null;this.past.push(this.current);this.current=this.future.pop();return structuredClone(this.current); }
}
export function formatPosition(frame, fps) {
  const seconds=frame/asNumber(exact(fps));const whole=Math.floor(seconds),ms=Math.floor((seconds-whole)*1000+1e-7);
  return `${Math.floor(whole/60).toString().padStart(2,'0')}:${(whole%60).toString().padStart(2,'0')}.${ms.toString().padStart(3,'0')}`;
}
