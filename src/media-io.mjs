/** Local media I/O. Originals are content-addressed; derived files never replace them. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export const MEDIA_SCHEMA = 'shutter-media-probe-v1';
export const MAX_IMPORT_BYTES = 8 * 1024 ** 3;
export const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const activeRoots = new Set();
export async function mediaExclusive(studio, operation) {
  const key = path.resolve(studio.root);
  if (activeRoots.has(key)) throw Error('media_busy');
  activeRoots.add(key);
  try { return await operation(); } finally { activeRoots.delete(key); }
}

/** Exact positive rationals; no conversion of 24000/1001 into 24. */
export function rational(value, { zero = false } = {}) {
  const s = String(value);
  let n, d;
  if (/^\d+\/\d+$/.test(s)) [n, d] = s.split('/').map(Number);
  else if (/^\d+(?:\.\d{1,6})?$/.test(s)) {
    const [a, b = ''] = s.split('.'); d = 10 ** b.length; n = Number(a) * d + Number(b || 0);
  } else throw Error('media_rational');
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d < 1 || n < (zero ? 0 : 1) || n > 1e12 || d > 1e9) throw Error('media_rational');
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const g = gcd(n, d); return { n: n / g, d: d / g };
}
export const rateText = r => `${r.n}/${r.d}`;
export const rateValue = r => r.n / r.d;
export function frameSamples(frames, fps, sampleRate = 48000) {
  const top = BigInt(frames) * BigInt(fps.d) * BigInt(sampleRate), bottom = BigInt(fps.n);
  return Number((top + bottom / 2n) / bottom);
}

/** No shell, bounded diagnostics, finite deadlines; this is not an OS decoder sandbox. */
export function runMedia(tool, args, { timeoutMs = 120000, maxOutput = 4 * 1024 ** 2 } = {}) {
  if (!['ffmpeg', 'ffprobe'].includes(tool)) throw Error('media_tool');
  return new Promise((resolve, reject) => {
    const binary = process.env[tool === 'ffmpeg' ? 'SHUTTER_FFMPEG' : 'SHUTTER_FFPROBE'] || tool;
    const child = spawn(binary, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = [], size = 0, error = '', failure;
    const timer = setTimeout(() => { failure = Error('media_timeout'); child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', b => {
      size += b.length;
      if (size > maxOutput) { failure = Error('media_output_limit'); child.kill('SIGKILL'); }
      else out.push(b);
    });
    child.stderr.on('data', b => { error = (error + b.toString()).slice(-8192); });
    child.on('error', e => { clearTimeout(timer); reject(Error(e.code === 'ENOENT' ? `${tool}_unavailable` : 'media_process_error')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) { const e = Error('media_decode_failed'); e.diagnostic = error; return reject(e); }
      resolve(Buffer.concat(out).toString('utf8'));
    });
  });
}
export const decoderArgs = ['-protocol_whitelist', 'file,pipe', '-max_alloc', '268435456'];
export async function fileDigest(filename) {
  const stat = await fsp.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('asset_integrity');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
export async function verifyMediaAsset(studio, id) {
  const asset = studio.read(id, 'asset');
  if (!/^asset_[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.filename) || asset.sha256 !== id.slice(6)) throw Error('asset_integrity');
  const filename = studio.assetPath(id), stat = await fsp.lstat(filename);
  if (!stat.isFile() || stat.size !== asset.bytes || await fileDigest(filename) !== asset.sha256) throw Error('asset_integrity');
  return asset;
}
function signature(bytes) {
  const ascii = (a, b) => bytes.subarray(a, b).toString('ascii');
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'webp';
  if (['II*\0','MM\0*'].includes(bytes.subarray(0,4).toString('latin1'))) return 'tiff';
  if (['RIFF','RF64'].includes(ascii(0,4)) && ascii(8,12) === 'WAVE') return 'wav';
  if (ascii(0,4) === 'FORM' && ['AIFF','AIFC'].includes(ascii(8,12))) return 'aiff';
  if (ascii(0,4) === 'fLaC') return 'flac';
  if (ascii(0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)) return 'mp3';
  if (['ftyp','wide','mdat','moov','free'].includes(ascii(4,8))) return 'mov';
  if (bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return 'matroska';
  if ((bytes[0] === 0x47 && bytes[188] === 0x47) || (bytes[4] === 0x47 && bytes[196] === 0x47)) return 'mpegts';
  throw Error('unsupported_media');
}
const formats = {
  png: 'png_pipe', jpeg: 'jpeg_pipe', webp: 'webp_pipe', tiff: 'tiff_pipe',
  wav: 'wav', aiff: 'aiff', flac: 'flac', mp3: 'mp3', mov: 'mov', matroska: 'matroska,webm', mpegts: 'mpegts'
};
export async function probeMedia(filename, hint, { countFrames = false } = {}) {
  const raw = JSON.parse(await runMedia('ffprobe', ['-v','error', ...decoderArgs,
    '-format_whitelist', formats[hint], '-probesize','33554432','-analyzeduration','10000000',
    ...(countFrames ? ['-count_frames'] : []), '-show_streams','-show_format','-of','json', filename]));
  const streams = raw.streams || [];
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.filter(s => s.codec_type === 'audio');
  const image = ['png','jpeg','webp','tiff'].includes(hint);
  if ((!video && !audio.length) || (image && !video)) throw Error('unsupported_media');
  if (video && (!Number.isInteger(video.width) || !Number.isInteger(video.height) || video.width < 1 || video.height < 1 || video.width * video.height > 100e6)) throw Error('media_dimensions');
  const kind = image ? 'image' : video ? 'video' : 'audio';
  const ext = image ? {jpeg:'jpg',tiff:'tiff'}[hint] || hint : hint === 'mov' ? (video ? 'mp4' : 'm4a') : hint === 'matroska' ? 'mkv' : hint === 'mpegts' ? 'mts' : hint;
  const mime = image ? `image/${hint}` : kind === 'audio' ? ({wav:'audio/wav',aiff:'audio/aiff',flac:'audio/flac',mp3:'audio/mpeg',m4a:'audio/mp4'}[ext] || 'audio/x-matroska') : ({mp4:'video/mp4',mkv:'video/x-matroska',mts:'video/mp2t'}[ext]);
  let fps = null;
  try { fps = rational(video?.avg_frame_rate); } catch { try { fps = rational(video?.r_frame_rate); } catch {} }
  const duration = Number(video?.duration || raw.format?.duration || audio[0]?.duration);
  if (kind !== 'image' && (!Number.isFinite(duration) || duration <= 0 || duration > 86400)) throw Error('media_duration');
  const rotation = Number(video?.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0);
  const color = video ? { transfer: video.color_transfer || null, primaries: video.color_primaries || null, space: video.color_space || null, range: video.color_range || null } : null;
  return {
    schema: MEDIA_SCHEMA, kind, ext, mime, hint, duration: image ? null : duration,
    width: video?.width || null, height: video?.height || null, rotation,
    sampleAspectRatio: video?.sample_aspect_ratio || null, pixelFormat: video?.pix_fmt || null, bitsPerRawSample: Number(video?.bits_per_raw_sample) || null,
    videoCodec: video?.codec_name || null, videoStream: video?.index ?? null,
    fps, timeBase: video?.time_base || null, reportedFrameRate: video?.r_frame_rate || null,
    declaredFrames: Number(video?.nb_frames) || null, countedFrames: Number(video?.nb_read_frames) || null,
    cadence: image ? null : 'unassessed', color,
    audio: audio.map(s => ({ index:s.index, codec:s.codec_name, channels:s.channels, sampleRate:Number(s.sample_rate), bits:Number(s.bits_per_raw_sample || s.bits_per_sample) || null, timeBase:s.time_base || null, durationTicks:s.duration_ts ?? null })),
    tags: { timecode: video?.tags?.timecode || raw.format?.tags?.timecode || null, creationTime: raw.format?.tags?.creation_time || null },
    warnings: kind === 'image' ? ['ICC/RAW development is not implemented; image adjustments are display-referred.'] : video ? ['Input color is not automatically identified or graded. Verify log/HDR material before use.', 'Frame cadence is unassessed; the assembly renderer uses explicit wall-clock frame resampling.'] : []
  };
}
const profileId = id => `media_${id}`;
export function getMediaProfile(studio, assetId) {
  const asset = studio.read(assetId, 'asset'), profile = studio.read(profileId(assetId), 'media-profile');
  if (profile.assetSha256 !== asset.sha256 || profile.schema !== MEDIA_SCHEMA) throw Error('media_profile_mismatch');
  return profile;
}
async function inspectFile(filename) {
  const handle = await fsp.open(filename, 'r');
  try { const b = Buffer.alloc(512); const {bytesRead} = await handle.read(b,0,b.length,0); return signature(b.subarray(0,bytesRead)); }
  finally { await handle.close(); }
}
export async function ensureMediaProfile(studio, assetId) {
  const asset = await verifyMediaAsset(studio, assetId);
  try { return getMediaProfile(studio, assetId); } catch(e) { if(e.message !== 'not_found') throw e; }
  const filename = studio.assetPath(assetId), hint = await inspectFile(filename);
  const profile = await probeMedia(filename, hint);
  return studio.write('media-profile', { ...profile, id:profileId(asset.id), assetId:asset.id, assetSha256:asset.sha256 });
}

/** Request bodies are iterated with backpressure, never Buffer.concat'd as a whole file. */
export async function importMedia(studio, stream, metadata = {}, { maxBytes = MAX_IMPORT_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMPORT_BYTES) throw Error('media_import_limit');
  if (/\.(arw|raw|dng|heic|heif)$/i.test(String(metadata.name || ''))) throw Error('raw_or_heif_decoder_not_implemented');
  const tempRoot = path.join(studio.root, 'media-tmp'); await fsp.mkdir(tempRoot,{recursive:true});
  const folder = await fsp.mkdtemp(path.join(tempRoot,'import-')), filename = path.join(folder,'input.bin');
  let handle, total=0;
  const hash = crypto.createHash('sha256');
  try {
    handle = await fsp.open(filename, 'wx', 0o600);
    for await (const input of stream) {
      const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
      total += chunk.length; if (total > maxBytes) throw Error('asset_size'); hash.update(chunk);
      let offset=0; while (offset < chunk.length) { const r = await handle.write(chunk,offset,chunk.length-offset); if(!r.bytesWritten) throw Error('media_write_failed'); offset += r.bytesWritten; }
    }
    if (!total) throw Error('asset_size');
    await handle.sync(); await handle.close(); handle = null;
    const hint = await inspectFile(filename), profile = await probeMedia(filename,hint);
    const digest = hash.digest('hex'), id = `asset_${digest}`, storedName = `${digest}.${profile.ext}`;
    let existing;
    try { existing = await verifyMediaAsset(studio,id); } catch(e) { if(e.message !== 'not_found') throw e; }
    if (!existing) {
      const dest = path.join(studio.root,'assets',storedName);
      try { await fsp.link(filename,dest); } catch(e) { if(e.code !== 'EEXIST') throw e; if(await fileDigest(dest) !== digest) throw Error('asset_integrity'); }
    }
    return studio.transaction(() => {
      const asset = existing || studio.write('asset', {
        id, sha256:digest, filename:storedName, bytes:total, kind:profile.kind, mime:profile.mime,
        name:String(metadata.name || storedName).replace(/[\u0000-\u001f]/g,'').slice(0,200),
        origin:String(metadata.origin || 'Local camera/media import').slice(0,1000), createdAt:new Date().toISOString()
      });
      // A profile is derived evidence; duplicate imports do not replace the original asset record.
      try { getMediaProfile(studio,id); } catch(e) {
        if(e.message !== 'not_found') throw e;
        studio.write('media-profile',{...profile,id:profileId(id),assetId:id,assetSha256:digest});
      }
      return { ...asset, media:getMediaProfile(studio,id) };
    });
  } finally {
    if(handle) await handle.close(); await fsp.rm(folder,{recursive:true,force:true});
  }
}
export async function importMediaFile(studio, filename, metadata = {}) {
  return importMedia(studio,fs.createReadStream(filename),metadata);
}

function requireReferenceColor(profile, acknowledge) {
  if (profile.kind === 'video' && acknowledge !== true) throw Error('reference_color_review_required');
}
export async function deriveImage(studio, assetId, request) {
  const asset = await verifyMediaAsset(studio,assetId), p = await ensureMediaProfile(studio,assetId);
  if(!['image','video'].includes(asset.kind)) throw Error('visual_media_required');
  const tempRoot=path.join(studio.root,'media-tmp'); await fsp.mkdir(tempRoot,{recursive:true});
  const folder=await fsp.mkdtemp(path.join(tempRoot,'derive-')), output=path.join(folder,'reference.png');
  let recipe;
  try {
    let filters=[];
    if(asset.kind === 'video') {
      requireReferenceColor(p,request.acknowledgeUnmanagedColor);
      let frame=request.frame;
      if(frame === 'last') {
        const counted=await probeMedia(studio.assetPath(assetId),p.hint,{countFrames:true});
        if(!Number.isSafeInteger(counted.countedFrames) || counted.countedFrames<1) throw Error('frame_count_unavailable');
        frame=counted.countedFrames-1;
      }
      if(!Number.isSafeInteger(frame) || frame<0 || frame>1e7) throw Error('frame_index');
      filters.push(`select=eq(n\\,${frame})`);
      recipe={operation:'decoded-frame',sourceAssetId:assetId,sourceSha256:asset.sha256,decodedFrameIndex:frame,colorPolicy:'unmanaged-reference'};
    } else {
      const e=request.adjustments || {};
      if(Object.keys(e).some(k=>!['crop','rotate','brightness','contrast','saturation'].includes(k))) throw Error('photo_adjustment_unsupported');
      if(e.crop) {
        const {x,y,width,height}=e.crop;
        if(![x,y,width,height].every(Number.isSafeInteger) || x<0||y<0||width<2||height<2||x+width>p.width||y+height>p.height) throw Error('photo_crop');
        filters.push(`crop=${width}:${height}:${x}:${y}`);
      }
      const rotate=e.rotate??0;
      if(![0,90,180,270].includes(rotate)) throw Error('photo_rotation');
      if(rotate===90)filters.push('transpose=1');
      if(rotate===180)filters.push('hflip','vflip');
      if(rotate===270)filters.push('transpose=2');
      const brightness=e.brightness??0,contrast=e.contrast??1,saturation=e.saturation??1;
      if(!Number.isFinite(brightness)||brightness < -1||brightness>1||!Number.isFinite(contrast)||contrast<0||contrast>3||!Number.isFinite(saturation)||saturation<0||saturation>3) throw Error('photo_adjustment_range');
      if(brightness!==0||contrast!==1||saturation!==1)filters.push(`eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`);
      recipe={operation:'photo-adjustment',sourceAssetId:assetId,sourceSha256:asset.sha256,adjustments:e,colorPolicy:'display-referred-unmanaged'};
    }
    await runMedia('ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,'-i',studio.assetPath(assetId),'-map',`0:${p.videoStream}`,
      ...(filters.length?['-vf',filters.join(',')]:[]),'-frames:v','1','-fps_mode','vfr','-an','-c:v','png','-threads','1',output],{timeoutMs:600000});
    if(!fs.existsSync(output))throw Error('frame_outside_media');
    const result=await importMediaFile(studio,output,{name:asset.name+(asset.kind==='video'?' · frame':' · edit')+'.png',origin:'Non-destructive derived image'});
    const id='derivation_'+crypto.randomUUID();
    studio.write('media-derivation',{id,outputAssetId:result.id,recipe,createdAt:new Date().toISOString()});
    return {...result,derivationId:id,recipe};
  } finally { await fsp.rm(folder,{recursive:true,force:true}); }
}

/** An expendable browser viewing copy; editing/reference coordinates remain on the original. */
export async function deriveVideoProxy(studio, assetId, request = {}) {
  const asset = await verifyMediaAsset(studio, assetId), p = await ensureMediaProfile(studio, assetId);
  if (p.kind !== 'video') throw Error('video_required');
  if (request.acknowledgeUnmanagedColor !== true) throw Error('reference_color_review_required');
  if(p.sampleAspectRatio&&!['1:1','0:1','N/A'].includes(p.sampleAspectRatio))throw Error('non_square_pixel_conform_required');
  if (['smpte2084', 'arib-std-b67'].includes(p.color?.transfer) || p.color?.primaries === 'bt2020') throw Error('hdr_transform_required');
  const tempRoot = path.join(studio.root, 'media-tmp'); await fsp.mkdir(tempRoot, {recursive: true});
  const folder = await fsp.mkdtemp(path.join(tempRoot, 'proxy-')), output = path.join(folder, 'proxy.mp4');
  try {
    const rotated = Math.abs(p.rotation) % 180 === 90;
    const w = rotated ? p.height : p.width, h = rotated ? p.width : p.height;
    const scale = Math.min(1, 1280 / w, 720 / h);
    const width = Math.max(2, 2 * Math.floor(w * scale / 2)), height = Math.max(2, 2 * Math.floor(h * scale / 2));
    await runMedia('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '2', ...decoderArgs,
      '-i', studio.assetPath(assetId), '-map', `0:${p.videoStream}`, '-map', '0:a:0?',
      '-vf', `scale=${width}:${height}:flags=lanczos,setsar=1`, '-fps_mode', 'vfr',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '2',
      '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '128k', '-map_metadata', '-1', '-movflags', '+faststart', output], {timeoutMs: 600000});
    const result = await importMediaFile(studio, output, {name: asset.name + ' · viewing proxy.mp4', origin: 'Local browser viewing proxy; original retained'});
    const recipe = {operation: 'browser-proxy', sourceAssetId: assetId, sourceSha256: asset.sha256,
      width, height, colorPolicy: 'unmanaged-sdr-viewing', timing: 'source-timestamps; not a frame-index interchange source'};
    const id = 'derivation_' + crypto.randomUUID();
    studio.write('media-derivation', {id, outputAssetId: result.id, recipe, createdAt: new Date().toISOString()});
    return {...result, derivationId: id, recipe};
  } finally { await fsp.rm(folder, {recursive: true, force: true}); }
}
