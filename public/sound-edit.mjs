/** Shared Sound Stage contract. All authored audio positions are 48 kHz sample frames.
 * Picture edits do not ripple sound. No automatic normalization, ducking or stretch. */
import {exact, totalFrames} from './music-edit.mjs';
export const SOUND_SCHEMA = 'shutter-sound-stage-v1';
export const SOUND_POLICY = 'soundstage-mix-v1';
export const SAMPLE_RATE = 48000;
export const MAX_SAMPLES = SAMPLE_RATE * 4 * 3600;
export const SOUND_ROLES = ['dialogue', 'voice', 'ambience', 'effects', 'music'];
const fail = code => { throw Error(code); };
const integer = (v, min = 0, max = MAX_SAMPLES) => Number.isSafeInteger(v) && v >= min && v <= max;
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const bool = v => typeof v === 'boolean';
const db = (v, max = 12) => typeof v === 'number' && Number.isFinite(v) && v >= -60 && v <= max;
function fields(value, allowed, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !allowed.includes(k))) fail(code);
}
export function samplesAtFrame(frame, fps) {
  if (!integer(frame, 0, 120 * 4 * 3600)) fail('sound_frame');
  const rate = exact(fps), n = BigInt(frame) * rate.d * 48000n;
  return Number((n + rate.n / 2n) / rate.n);
}
export function samplesAtSeconds(seconds) {
  const r = exact(seconds, true), n = r.n * 48000n;
  const value = Number((n + r.d / 2n) / r.d);
  if (!integer(value)) fail('sound_time');
  return value;
}
export const gainForDb = value => 10 ** (value / 20);
export function emptySoundStage() {
  return {schema:SOUND_SCHEMA, outputGainDb:0, master:{mute:false, solo:false}, tracks:[]};
}
/** Canonicalize only recognized fields. Reject malformed data rather than silently losing it. */
export function normalizeSoundStage(value) {
  if (value === undefined || value === null) return null;
  fields(value, ['schema','outputGainDb','master','tracks'], 'sound_stage_invalid');
  if (value.schema !== SOUND_SCHEMA || !db(value.outputGainDb, 0) ||
      !Array.isArray(value.tracks) || value.tracks.length > 8) fail('sound_stage_invalid');
  fields(value.master, ['mute','solo'], 'sound_master_invalid');
  if (!bool(value.master.mute) || !bool(value.master.solo)) fail('sound_master_invalid');
  const ids = new Set(); let count = 0;
  const unique = value => { if (!id(value) || ids.has(value)) fail('sound_identity'); ids.add(value); return value; };
  const tracks = value.tracks.map(t => {
    fields(t, ['id','name','role','gainDb','mute','solo','clips'], 'sound_track_invalid');
    const trackId = unique(t.id);
    if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80 ||
        /[\u0000-\u001f]/.test(t.name) || !SOUND_ROLES.includes(t.role) || !db(t.gainDb) ||
        !bool(t.mute) || !bool(t.solo) || !Array.isArray(t.clips)) fail('sound_track_invalid');
    const clips = t.clips.map(c => {
      if (++count > 64) fail('sound_clip_limit');
      fields(c, ['id','assetId','streamIndex','atSample','sourceInSample','samples','gainDb','fadeInSamples','fadeOutSamples'], 'sound_clip_invalid');
      const clipId = unique(c.id);
      if (typeof c.assetId !== 'string' || !/^asset_[a-f0-9]{64}$/.test(c.assetId) ||
          !integer(c.streamIndex, 0, 1023) || !integer(c.atSample) || !integer(c.sourceInSample) ||
          !integer(c.samples, 1) || !integer(c.atSample + c.samples) || !integer(c.sourceInSample + c.samples) ||
          !db(c.gainDb) || !integer(c.fadeInSamples) || !integer(c.fadeOutSamples) ||
          c.fadeInSamples + c.fadeOutSamples > c.samples) fail('sound_clip_invalid');
      return {id:clipId, assetId:c.assetId, streamIndex:c.streamIndex, atSample:c.atSample,
        sourceInSample:c.sourceInSample, samples:c.samples, gainDb:c.gainDb,
        fadeInSamples:c.fadeInSamples, fadeOutSamples:c.fadeOutSamples};
    });
    return {id:trackId, name:t.name.trim(), role:t.role, gainDb:t.gainDb, mute:t.mute, solo:t.solo, clips};
  });
  return {schema:SOUND_SCHEMA, outputGainDb:value.outputGainDb,
    master:{mute:value.master.mute, solo:value.master.solo}, tracks};
}
/** Mute takes precedence over solo; an empty or muted solo lane still solos the bus. */
export function soundAudibility(stage, hasMaster) {
  const solo = (hasMaster && stage.master.solo) || stage.tracks.some(t => t.solo);
  return {master:hasMaster && !stage.master.mute && (!solo || stage.master.solo),
    tracks:stage.tracks.map(t => ({id:t.id, audible:!t.mute && (!solo || t.solo)}))};
}
/** Fade endpoints are exact. One-sample fades silence that single endpoint. */
export function envelopeAt(clip, offset) {
  if (offset < 0 || offset >= clip.samples) return 0;
  const fi = clip.fadeInSamples, fo = clip.fadeOutSamples;
  const attack = fi && offset < fi ? (fi === 1 ? 0 : offset / (fi - 1)) : 1;
  const remaining = clip.samples - 1 - offset;
  const release = fo && remaining < fo ? (fo === 1 ? 0 : remaining / (fo - 1)) : 1;
  return attack * release;
}
/** Canonical monitoring identity; picture content and cue changes cannot alter an audio mix. */
export function soundIdentity(edit) {
  return JSON.stringify({schema:SOUND_SCHEMA, samples:samplesAtFrame(totalFrames(edit),edit.fps),
    soundtrack:edit.soundtrack?.assetId || null, stage:normalizeSoundStage(edit.soundStage)});
}
export function applySoundEdit(edit, command) {
  if (!edit || edit.format !== 'shutter-media-edit-v1') fail('media_edit_required');
  const next = structuredClone(edit);
  let stage = normalizeSoundStage(next.soundStage);
  if (command?.type === 'sound-enable') {
    if (stage) fail('sound_already_enabled');
    next.soundStage = emptySoundStage(); next.audioPolicy = SOUND_POLICY; return next;
  }
  if (!stage || next.audioPolicy !== SOUND_POLICY) fail('sound_stage_required');
  const track = () => stage.tracks.find(t => t.id === command.trackId) || fail('sound_track_not_found');
  const clip = t => t.clips.find(c => c.id === command.clipId) || fail('sound_clip_not_found');
  switch (command?.type) {
    case 'sound-output': stage.outputGainDb = command.gainDb; break;
    case 'sound-master': fields(command.value,['mute','solo'],'sound_master_invalid'); stage.master = command.value; break;
    case 'sound-track-add': stage.tracks.push(command.track); break;
    case 'sound-track-remove': track(); stage.tracks = stage.tracks.filter(t => t.id !== command.trackId); break;
    case 'sound-track-update': {
      fields(command.patch,['name','role','gainDb','mute','solo'],'sound_track_patch'); Object.assign(track(),command.patch); break;
    }
    case 'sound-clip-add': track().clips.push(command.clip); break;
    case 'sound-clip-remove': { const t=track(); clip(t); t.clips=t.clips.filter(c=>c.id!==command.clipId); break; }
    case 'sound-clip-update': {
      fields(command.patch,['atSample','sourceInSample','samples','gainDb','fadeInSamples','fadeOutSamples'],'sound_clip_patch');
      Object.assign(clip(track()),command.patch); break;
    }
    default: fail('sound_command_unsupported');
  }
  next.soundStage = normalizeSoundStage(stage); return next;
}
