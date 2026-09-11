/** Explicit camera-to-SDR preparation. Original files and existing cuts are never replaced. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parseCube, colorSettings, COLOR_VERSION, COLOR_TAG_ARGS, SRGB_TAG_ARGS, MAX_CUBE_BYTES, PREPARED_REFERENCE_FILTER} from '../public/color-contract.mjs';
import {sha256, fileDigest, verifyMediaAsset, ensureMediaProfile, importMediaFile, decoderArgs, rational, rateText, rateValue} from './media-io.mjs';
import {inspectProcess, inspectTools, probeDelivery} from './media-inspect.mjs';
const MAX_PREP_SECONDS = 600, MAX_PREP_FRAMES = 72000, MAX_OUTPUT_BYTES = 6 * 1024 ** 3;
const freeze = value => JSON.parse(JSON.stringify(value));
const cancelled = signal => {if (signal?.aborted) throw Error('color_cancelled');};
async function processColor(tool, args, options={}) {
  try {return await inspectProcess(tool,args,options);} catch (e) {if (e.message.startsWith('delivery_')) e.message=e.message.replace('delivery_','color_'); throw e;}
}
async function lutFolder(studio) {
  const folder = path.join(studio.root, 'color-luts'); await fsp.mkdir(folder, {recursive:true});
  if ((await fsp.lstat(folder)).isSymbolicLink()) throw Error('color_lut_integrity');
  return folder;
}
async function putBytes(folder, digest, text) {
  const filename = path.join(folder, digest+'.cube');
  try {await fsp.writeFile(filename,text,{flag:'wx',mode:0o600});}
  catch (e) {if(e.code!=='EEXIST')throw e; if(await fileDigest(filename)!==digest)throw Error('color_lut_integrity');}
}
export async function importColorLut(studio, stream, metadata={}) {
  if (!['rec709','custom-log'].includes(metadata.inputEncoding)) throw Error('color_input_encoding');
  let bytes=0; const chunks=[];
  for await(const value of stream) {const chunk=Buffer.from(value); bytes+=chunk.length; if(bytes>MAX_CUBE_BYTES)throw Error('color_lut_size'); chunks.push(chunk);}
  const raw=Buffer.concat(chunks); let text;
  try {text=new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch {throw Error('color_lut_text');}
  const parsed=parseCube(text), rawSha256=sha256(raw), canonicalSha256=sha256(parsed.canonical);
  const folder=await lutFolder(studio);
  await putBytes(folder,rawSha256,raw); await putBytes(folder,canonicalSha256,parsed.canonical);
  const identity={schema:COLOR_VERSION,rawSha256,canonicalSha256,inputEncoding:metadata.inputEncoding,outputEncoding:'rec709'};
  const id='lut_'+sha256(JSON.stringify(identity));
  try {return studio.read(id,'color-lut');}catch(e){if(e.message!=='not_found')throw e;}
  return studio.write('color-lut',{id,...identity,size:parsed.size,bytes:raw.length,
    name:String(metadata.name||parsed.title||'Imported LUT').replace(/[\u0000-\u001f]/g,'').slice(0,200),
    declaration:'Input encoding and Rec.709 output are user declarations, not inferred or independently certified.',createdAt:new Date().toISOString()});
}
async function readLut(studio,id) {
  const item=studio.read(id,'color-lut');
  if(item.schema!==COLOR_VERSION||!/^lut_[a-f0-9]{64}$/.test(id)||![item.rawSha256,item.canonicalSha256].every(s=>/^[a-f0-9]{64}$/.test(s)))throw Error('color_lut_integrity');
  const {schema,rawSha256,canonicalSha256,inputEncoding,outputEncoding}=item;
  if(id!=='lut_'+sha256(JSON.stringify({schema,rawSha256,canonicalSha256,inputEncoding,outputEncoding})))throw Error('color_lut_integrity');
  const folder=await lutFolder(studio), filename=path.join(folder,item.canonicalSha256+'.cube');
  if(await fileDigest(filename)!==item.canonicalSha256||await fileDigest(path.join(folder,item.rawSha256+'.cube'))!==item.rawSha256)throw Error('color_lut_integrity');
  const text=await fsp.readFile(filename,'utf8'), parsed=parseCube(text);
  if(parsed.canonical!==text||parsed.size!==item.size)throw Error('color_lut_integrity');
  return {...item,text};
}
function sourceGate(p, settings) {
  if(p.kind!=='video')throw Error('color_video_required');
  if(!Number.isFinite(p.duration)||p.duration<=0||p.duration>MAX_PREP_SECONDS)throw Error('color_duration_limit');
  if(!/^yuvj?(420|422|444)p(?:10le|12le|16le)?$/.test(p.pixelFormat||''))throw Error('color_yuv_decoder_required');
  if(![p.width,p.height].every(n=>Number.isSafeInteger(n)&&n>=16&&n<=4096&&n%2===0)||p.width*p.height>4096*2160)throw Error('color_dimensions');
  if(p.sampleAspectRatio&&!['1:1','0:1','N/A'].includes(p.sampleAspectRatio))throw Error('color_square_pixels_required');
  if(![0,90,180,270].includes(((p.rotation||0)%360+360)%360))throw Error('color_rotation_unsupported');
  if(['smpte2084','arib-std-b67'].includes(p.color?.transfer)||p.color?.primaries==='bt2020'||/2020/.test(p.color?.space||''))throw Error('color_hdr_not_supported');
  if(p.color?.space&&!['bt709','unknown','unspecified'].includes(p.color.space))throw Error('color_matrix_not_supported');
  if(p.colorPreparation)throw Error('color_already_prepared_use_original');
  if(settings.inputEncoding==='rec709' && [p.color?.transfer,p.color?.primaries].some(v=>v&&!['bt709','unknown','unspecified'].includes(v)))throw Error('color_rec709_tag_conflict');
  const fps=rational(rateText(p.fps||{})); if(rateValue(fps)<1||rateValue(fps)>120)throw Error('color_rate');
  return fps;
}

/** Every decoded timestamp and interlace flag is checked; avg_frame_rate alone is not proof.
 * One source-clock tick accommodates integer timestamp quantization, not arbitrary VFR. */
export async function inspectColorCadence(filename,p,{signal}={}) {
  const fps=rational(rateText(p.fps)), time=rational(p.timeBase), frames=[];
  let first=null, previous=null;
  await processColor('ffprobe',['-v','error',...decoderArgs,'-select_streams',String(p.videoStream),
    '-show_frames','-show_entries','frame=best_effort_timestamp,interlaced_frame,width,height,pix_fmt','-of','compact=p=0:nk=0',filename],{
      signal,maxBytes:32*1024**2,onLine:line=>{
        if(!line.includes('best_effort_timestamp='))return;
        const fields=Object.fromEntries(line.split('|').map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
        if(!/^-?\d+$/.test(fields.best_effort_timestamp)||fields.interlaced_frame!=='0')throw Error('color_progressive_timestamp_required');
        if(Number(fields.width)!==p.width||Number(fields.height)!==p.height||fields.pix_fmt!==p.pixelFormat)throw Error('color_dynamic_format_unsupported');
        const pts=BigInt(fields.best_effort_timestamp); if(first===null)first=pts;
        if(previous!==null&&pts<=previous)throw Error('color_nonmonotonic_timestamps'); previous=pts;
        const error=(pts-first)*BigInt(time.n)*BigInt(fps.n)-BigInt(frames.length)*BigInt(fps.d)*BigInt(time.d);
        if((error<0n?-error:error)>BigInt(time.n)*BigInt(fps.n))throw Error('color_variable_cadence_not_supported');
        frames.push(fields.best_effort_timestamp);if(frames.length>MAX_PREP_FRAMES)throw Error('color_frame_limit');
      }});
  if(frames.length<2)throw Error('color_cadence_insufficient');
  return {frames:frames.length,fps:rateText(fps),sourceTimeBase:rateText(time),sourceFirstPts:String(first),
    timestampSha256:sha256(frames.join('\n')+'\n'),tolerance:'one source-clock tick',policy:'CFR verified; each decoded frame maps one-to-one to a zero-based output clock'};
}

/** Two equal transfer/primary labels only preserve input code values here.
 * A custom-log LUT, not zscale's 709 label, must perform the log/gamut->709 transform. */
export function colorFilter(settings,{lutFilename=null,reference=false}={}) {
  const s=colorSettings(settings);
  if(Boolean(s.lutId)!==Boolean(lutFilename))throw Error('color_lut_required');
  if(lutFilename!==null&&!/^[a-f0-9]{64}\.cube$/.test(lutFilename))throw Error('color_lut_path');
  const filters=[`zscale=matrixin=709:transferin=709:primariesin=709:rangein=${s.inputRange}:matrix=gbr:transfer=709:primaries=709:range=full,format=gbrpf32le`];
  if(lutFilename)filters.push(`lut3d=file=${lutFilename}:interp=tetrahedral`);
  // LUT output must already be bounded, nonlinear Rec.709 RGB.
  filters.push('zscale=matrixin=gbr:transferin=709:primariesin=709:rangein=full:matrix=709:transfer=709:primaries=709:range=limited:dither=error_diffusion,format=yuv422p10le');
  if(reference)filters.push(PREPARED_REFERENCE_FILTER);
  return filters.join(',');
}
async function prepareContext(studio,assetId,input) {
  const settings=colorSettings(input),asset=await verifyMediaAsset(studio,assetId),p=await ensureMediaProfile(studio,assetId);
  const fps=sourceGate(p,settings),lut=settings.lutId?await readLut(studio,settings.lutId):null;
  if(lut&&(lut.inputEncoding!==settings.inputEncoding||lut.outputEncoding!=='rec709'))throw Error('color_lut_encoding_mismatch');
  const recipe={schema:COLOR_VERSION,operation:'color-preparation',sourceAssetId:assetId,sourceSha256:asset.sha256,
    settings,sourceColorTags:p.color,declaredMatrix:'bt709-ycbcr',outputEncoding:'rec709-limited-10bit',referenceViewing:'display-referred BT.1886 ideal-black gamma 2.4 to sRGB',
    lut:lut?{id:lut.id,rawSha256:lut.rawSha256,canonicalSha256:lut.canonicalSha256,size:lut.size,inputEncoding:lut.inputEncoding}:null,
    interpolation:lut?'tetrahedral':null,audioPolicy:'picture-only; camera sound stays on the original asset'};
  recipe.hash=sha256(JSON.stringify(recipe));
  return {asset,p,fps,lut,recipe};
}
async function inScratch(studio,context,operation) {
  const base=path.join(studio.root,'media-tmp');await fsp.mkdir(base,{recursive:true});
  const folder=await fsp.mkdtemp(path.join(base,'color-'));
  try {
    const lutFilename=context.lut?context.lut.canonicalSha256+'.cube':null;
    if(lutFilename)await fsp.writeFile(path.join(folder,lutFilename),context.lut.text,{flag:'wx',mode:0o600});
    return await operation(folder,lutFilename);
  }finally {await fsp.rm(folder,{recursive:true,force:true});}
}
// Only internally generated scratch directories reach the process cwd. HTTP never supplies paths.
export async function previewColor(studio,assetId,{settings,frame=0}={},options={}) {
  const context=await prepareContext(studio,assetId,settings), {asset,p,recipe}=context;
  cancelled(options.signal);
  if(frame==='last') {
    const raw=await probeDelivery(studio.assetPath(assetId),{...options,countFrames:true});
    frame=Number(raw.streams.find(s=>s.index===p.videoStream)?.nb_read_frames)-1;
  }
  if(!Number.isSafeInteger(frame)||frame<0||frame>=MAX_PREP_FRAMES)throw Error('color_frame_index');
  return inScratch(studio,context,async(folder,lutFilename)=>{
    const tools=await inspectTools(options), files=[];
    for(const kind of ['before','after']) {
      const name=kind+'.png',filename=path.join(folder,name);
      // Before is a comparison of decoded code values, NOT a verified log viewing transform.
      const s=kind==='after'?recipe.settings:{...recipe.settings,inputEncoding:'rec709',lutId:null};
      const filter=`select=eq(n\\,${frame}),${colorFilter(s,{lutFilename:kind==='after'?lutFilename:null,reference:true})},scale=w='min(960,iw)':h='min(540,ih)':force_original_aspect_ratio=decrease:flags=lanczos`;
      await processColor('ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,'-i',studio.assetPath(assetId),'-map',`0:${p.videoStream}`,
        '-vf',filter,'-frames:v','1','-fps_mode','passthrough','-an','-c:v','png','-threads','1','-filter_threads','1',...SRGB_TAG_ARGS,filename],{...options,cwd:folder});
      if(!fs.existsSync(filename)||(await fsp.stat(filename)).size===0)throw Error('color_frame_outside_media');files.push(filename);
    }
    await verifyMediaAsset(studio,assetId);if(recipe.settings.lutId)await readLut(studio,recipe.settings.lutId);cancelled(options.signal);
    const before=await importMediaFile(studio,files[0],{name:asset.name+' · color before.png',origin:'Color comparison: unconverted code values shown with Rec.709 interpretation'});
    const after=await importMediaFile(studio,files[1],{name:asset.name+' · color after.png',origin:'Reviewed color recipe preview; sRGB reference PNG'});
    return studio.write('color-preview',{id:'color_preview_'+crypto.randomUUID(),schema:COLOR_VERSION,sourceAssetId:assetId,
      sourceSha256:asset.sha256,recipe,frame,beforeAssetId:before.id,afterAssetId:after.id,tools,createdAt:new Date().toISOString()});
  });
}

export async function prepareColor(studio,assetId,{settings,previewId}={},options={}) {
  const context=await prepareContext(studio,assetId,settings),{asset,p,fps,recipe}=context;
  if(typeof previewId!=='string'||!/^color_preview_[a-f0-9-]{36}$/.test(previewId))throw Error('color_matching_preview_required');
  const preview=studio.read(previewId,'color-preview');
  if(preview.schema!==COLOR_VERSION||preview.sourceAssetId!==assetId||preview.sourceSha256!==asset.sha256||preview.recipe?.hash!==recipe.hash)throw Error('color_preview_stale');
  await verifyMediaAsset(studio,preview.beforeAssetId);await verifyMediaAsset(studio,preview.afterAssetId);
  const tools=await inspectTools(options);
  if(JSON.stringify(preview.tools)!==JSON.stringify(tools))throw Error('color_preview_tools_changed');
  const cadence=await inspectColorCadence(studio.assetPath(assetId),p,options);cancelled(options.signal);
  return inScratch(studio,context,async(folder,lutFilename)=>{
    const output=path.join(folder,'prepared.mov');
    const filters=`${colorFilter(recipe.settings,{lutFilename})},setpts=N*${fps.d}/(${fps.n}*TB),setsar=1`;
    await processColor('ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,'-i',studio.assetPath(assetId),'-map',`0:${p.videoStream}`,
      '-vf',filters,'-r',rateText(fps),'-fps_mode','cfr','-an','-sn','-dn','-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le','-threads','2','-filter_threads','1',
      ...COLOR_TAG_ARGS,'-map_metadata','-1','-map_chapters','-1','-video_track_timescale',String(fps.n),'-fs',String(MAX_OUTPUT_BYTES),'-movflags','+faststart',output],{...options,cwd:folder});
    const raw=await probeDelivery(output,{...options,countFrames:true}),v=raw.streams.find(s=>s.codec_type==='video');
    const rotated=Math.abs(p.rotation)%180===90,width=rotated?p.height:p.width,height=rotated?p.width:p.height;
    if(raw.streams.length!==1||v?.codec_name!=='prores'||v.pix_fmt!=='yuv422p10le'||Number(v.nb_read_frames)!==cadence.frames||v.width!==width||v.height!==height||rateText(rational(v.avg_frame_rate))!==rateText(fps)||
      v.color_primaries!=='bt709'||v.color_transfer!=='bt709'||v.color_space!=='bt709'||(v.color_range&&v.color_range!=='tv')||Number(v.start_time)!==0||Math.abs(Number(v.duration)-cadence.frames/rateValue(fps))>1e-5){const e=Error('color_output_contract');e.diagnostic={actual:v,streams:raw.streams.length,expected:{frames:cadence.frames,width,height,fps:rateText(fps)}};throw e;}
    if((await fsp.stat(output)).size>MAX_OUTPUT_BYTES)throw Error('color_output_size');
    await verifyMediaAsset(studio,assetId);if(recipe.settings.lutId)await readLut(studio,recipe.settings.lutId);cancelled(options.signal);
    const result=await importMediaFile(studio,output,{name:asset.name+' · prepared SDR.mov',origin:'Color-prepared ProRes 422 HQ picture copy; original and original sound retained separately'});
    const outputSha256=await fileDigest(output),id='derivation_'+crypto.randomUUID();
    return studio.transaction(()=>{
      // Identical bytes can have multiple derivations; do not assign one exclusive source to the asset.
      const media=studio.write('media-profile',{...result.media,colorPreparation:{schema:COLOR_VERSION,encoding:'rec709-limited-10bit',range:'limited',viewing:'display-referred BT.1886 ideal-black gamma 2.4',rangeEvidence:'Authored conversion; container range tag may be absent. Probe color fields remain unchanged.',provenance:'See media-derivation records'}});
      const derivation=studio.write('media-derivation',{id,outputAssetId:result.id,outputSha256,recipe:freeze(recipe),previewId,cadence,tools,
        notes:['10-bit 4:2:2 ProRes HQ is a lossy editing copy, not RAW or a lossless archival master.',
          'No source audio copied. Use the unchanged camera asset for Sound Stage.',
          'No existing clip replaced. Explicitly append or replace a take with this asset.',
          'Input profile and LUT color meaning are user declarations. Actual Sony media and calibrated displays require qualification.'],createdAt:new Date().toISOString()});
      return {asset:{...result,media},derivation};
    });
  });
}
