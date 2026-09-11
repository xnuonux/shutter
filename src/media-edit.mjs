/** Asset-backed rough cuts in the existing timeline record, not a second timeline store. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {compileSoundStage, renderSoundStage, deliveryAudioFile, checkSoundBudget} from './media-sound.mjs';
import {soundIdentity, SOUND_POLICY} from '../public/sound-edit.mjs';
import {writeBridgeZip} from './media-zip.mjs';
import { normalizeMusic, normalizeMarkers, samplingFor } from '../public/music-edit.mjs';
import { rational, rateText, rateValue, frameSamples, getMediaProfile, verifyMediaAsset, ensureMediaProfile, runMedia, decoderArgs, importMediaFile, fileDigest } from './media-io.mjs';

export const MEDIA_EDIT_FORMAT = 'shutter-media-edit-v1';
export function emptyMediaEdit() {
  return {format:MEDIA_EDIT_FORMAT,fps:'24000/1001',width:1920,height:1080,clips:[],soundtrack:null,colorPolicy:'unmanaged-sdr',audioPolicy:'soundtrack-or-silence',cadencePolicy:'wallclock-nearest'};
}
function checkedProfile(studio,id) {
  const asset=studio.read(id,'asset'), media=getMediaProfile(studio,id);
  if(!/^asset_[a-f0-9]{64}$/.test(id) || media.assetSha256!==asset.sha256)throw Error('asset_integrity');
  return {asset,media};
}
export function compileMediaEdit(studio,projectId,edit) {
  const production=studio.getProduction(projectId);
  if(!edit || edit.format!==MEDIA_EDIT_FORMAT || !Array.isArray(edit.clips) || edit.clips.length>250)throw Error('media_edit_invalid');
  const fps=rational(edit.fps);
  if(rateValue(fps)<1||rateValue(fps)>120)throw Error('media_edit_rate');
  const {width,height}=edit;
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>=16&&n<=4096&&n%2===0)||width*height>4096*2160)throw Error('media_edit_dimensions');
  if(edit.colorPolicy!=='unmanaged-sdr'||!['soundtrack-or-silence',SOUND_POLICY].includes(edit.audioPolicy)||edit.cadencePolicy!=='wallclock-nearest')throw Error('media_edit_policy');
  const music=normalizeMusic(edit.music), markers=normalizeMarkers(edit.markers);
  const ids=new Set(), sources=new Map(), warnings=new Set(['SDR rough-cut renderer: no log-to-display, HDR, ICC or creative grading transform.', 'Camera audio is excluded. Only the selected master track plays, or silence when no track is selected.']);
  let frames=0;
  const clips=edit.clips.map(c=>{
    if(!c||typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)||ids.has(c.id))throw Error('media_clip_identity');
    ids.add(c.id);
    if(!Number.isSafeInteger(c.frames)||c.frames<1||c.frames>1e7)throw Error('media_clip_frames');
    const start=rational(c.sourceStart??'0',{zero:true});
    if(!['contain','cover'].includes(c.fit))throw Error('media_fit');
    const {asset,media}=checkedProfile(studio,c.assetId);
    if(!['video','image'].includes(media.kind))throw Error('visual_media_required');
    if(media.sampleAspectRatio&&!['1:1','0:1','N/A'].includes(media.sampleAspectRatio))throw Error('non_square_pixel_conform_required');
    if(['smpte2084','arib-std-b67'].includes(media.color?.transfer)||media.color?.primaries==='bt2020')throw Error('hdr_transform_required');
    const duration=c.frames/rateValue(fps);
    if(media.kind==='image'&&start.n!==0)throw Error('still_source_start');
    if(media.kind==='video'&&rateValue(start)+duration>media.duration+0.000001)throw Error('media_source_range');
    if(!sources.has(asset.id))sources.set(asset.id,{assetId:asset.id,sha256:asset.sha256,kind:media.kind,media});
    const rotated=Math.abs(media.rotation)%180===90;
    const sourceWidth=rotated?media.height:media.width,sourceHeight=rotated?media.width:media.height;
    const scale=c.fit==='contain'?Math.min(width/sourceWidth,height/sourceHeight):Math.max(width/sourceWidth,height/sourceHeight);
    if(scale>1.000001)warnings.add('One or more shots are conventionally resized upward; no AI detail reconstruction is performed.');
    const clip={id:c.id,assetId:asset.id,sourceStart:rateText(start),frames:c.frames,at:frames,fit:c.fit,sourceKind:media.kind,scale,sampling:samplingFor(c,rateText(fps))};
    frames+=c.frames;return clip;
  });
  if(frames/rateValue(fps)>4*3600)throw Error('media_edit_duration');
  let soundtrack=null;
  if(edit.soundtrack!==null&&edit.soundtrack!==undefined) {
    const {asset,media}=checkedProfile(studio,edit.soundtrack.assetId);
    if(media.kind!=='audio'||media.audio.length!==1||![1,2].includes(media.audio[0].channels))throw Error('stereo_or_mono_audio_required');
    if(edit.soundtrack.tailPolicy!=='pad-silence')throw Error('soundtrack_tail_policy');
    if(media.audio[0].sampleRate!==48000)warnings.add('The delivery soundtrack is resampled to 48 kHz; the original master is unchanged.');
    if(media.duration<frames/rateValue(fps))warnings.add('The selected master ends before picture; the remaining audio is explicit silence.');
    soundtrack={assetId:asset.id,sha256:asset.sha256,sourceStream:media.audio[0].index,sourceSampleRate:media.audio[0].sampleRate,sourceChannels:media.audio[0].channels,tailPolicy:'pad-silence'};
    sources.set(asset.id,{assetId:asset.id,sha256:asset.sha256,kind:'audio',media});
  }
  if(markers.some(m=>m.frame>=frames))warnings.add('Some cue markers are outside the current picture duration. They remain fixed on the song clock.');
  const audioSamples=frameSamples(frames,fps);
  const soundStage=compileSoundStage(studio,edit,sources,warnings,audioSamples);
  if(soundStage)warnings.delete('Camera audio is excluded. Only the selected master track plays, or silence when no track is selected.');
  const plan={version:soundStage?6:5,format:MEDIA_EDIT_FORMAT,projectId,title:production.title,fps:rateText(fps),width,height,frames,
    duration:frames/rateValue(fps),audioSamples,sampleRate:48000,
    clips,soundtrack,music,markers,sources:[...sources.values()],takes:[],audioStreams:soundStage||soundtrack?1:0,
    ...(soundStage?{soundStage,soundIdentity:soundIdentity(edit)}:{}),
    colorPolicy:edit.colorPolicy,audioPolicy:edit.audioPolicy,cadencePolicy:edit.cadencePolicy,warnings:[...warnings]};
  return plan;
}
function rateXml(fps) {
  const r=rational(fps), ntsc=r.d===1001&&r.n%1000===0;
  if(r.d!==1&&!ntsc)throw Error('bridge_rate_unsupported');
  return `<rate><timebase>${ntsc?r.n/1000:r.n}</timebase><ntsc>${ntsc?'TRUE':'FALSE'}</ntsc></rate>`;
}
export function xmlEscape(v) { return String(v).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,''); }
/** Conformed-source FCP7 XML. Import/relink must still be tested inside Resolve. */
export function makeBridgeXml(plan,filenames) {
  if(filenames.length!==plan.clips.length)throw Error('bridge_files');
  const rate=rateXml(plan.fps),audioName=deliveryAudioFile(plan);
  const video=plan.clips.map((c,i)=>`<clipitem id="clip-${i}"><name>${xmlEscape(filenames[i])}</name>${rate}<start>${c.at}</start><end>${c.at+c.frames}</end><in>0</in><out>${c.frames}</out><duration>${c.frames}</duration><file id="file-${i}"><name>${xmlEscape(filenames[i])}</name><pathurl>${xmlEscape(filenames[i])}</pathurl>${rate}<duration>${c.frames}</duration><media><video><samplecharacteristics><width>${plan.width}</width><height>${plan.height}</height><pixelaspectratio>square</pixelaspectratio>${rate}</samplecharacteristics></video></media></file></clipitem>`).join('');
  const audio=audioName?`<audio><numOutputChannels>2</numOutputChannels>${[1,2].map(channel=>`<track><clipitem id="audio-${channel}"><name>${audioName}</name>${rate}<start>0</start><end>${plan.frames}</end><in>0</in><out>${plan.frames}</out><file id="audio-file-${channel}"><name>${audioName}</name><pathurl>${audioName}</pathurl>${rate}<duration>${plan.frames}</duration><media><audio><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media></file><sourcetrack><mediatype>audio</mediatype><trackindex>${channel}</trackindex></sourcetrack></clipitem></track>`).join('')}</audio>`:'';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="shutter-cut"><name>${xmlEscape(plan.title)}</name><duration>${plan.frames}</duration>${rate}<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics><width>${plan.width}</width><height>${plan.height}</height><pixelaspectratio>square</pixelaspectratio>${rate}</samplecharacteristics></format><track>${video}</track></video>${audio}</media>${(plan.markers||[]).filter(m=>m.frame<plan.frames).map(m=>`<marker><name>${xmlEscape(m.label)}</name><comment>${xmlEscape(m.kind)}</comment><in>${m.frame}</in><out>-1</out></marker>`).join('')}</sequence></xmeml>\n`;
}
export function makeBridgeOtio(plan, filenames) {
  const audioName=deliveryAudioFile(plan);
  const fps=rateValue(rational(plan.fps)), time=(value,rate)=>({OTIO_SCHEMA:'RationalTime.1',value,rate});
  const range=(frames,rate)=>({OTIO_SCHEMA:'TimeRange.1',start_time:time(0,rate),duration:time(frames,rate)});
  const reference=(file,frames,rate)=>({OTIO_SCHEMA:'ExternalReference.1',target_url:file,available_range:range(frames,rate),metadata:{}});
  const tracks=[{OTIO_SCHEMA:'Track.1',name:'Picture (conformed)',kind:'Video',children:plan.clips.map((c,i)=>({OTIO_SCHEMA:'Clip.2',name:filenames[i],source_range:range(c.frames,fps),media_references:{DEFAULT_MEDIA:reference(filenames[i],c.frames,fps)},active_media_reference_key:'DEFAULT_MEDIA',effects:[],markers:[],metadata:{shutter:{sourceAssetId:c.assetId,sourceStart:c.sourceStart,fit:c.fit}}})),effects:[],markers:[],metadata:{}}];
  if(audioName)tracks.push({OTIO_SCHEMA:'Track.1',name:plan.soundStage?'Sound Stage mix':'Master',kind:'Audio',children:[{OTIO_SCHEMA:'Clip.2',name:plan.soundStage?'Sound Stage mix 48 kHz':'Master 48 kHz',source_range:range(plan.audioSamples,48000),media_references:{DEFAULT_MEDIA:reference(audioName,plan.audioSamples,48000)},active_media_reference_key:'DEFAULT_MEDIA',effects:[],markers:[],metadata:{}}],effects:[],markers:[],metadata:{}});
  return {OTIO_SCHEMA:'Timeline.1',name:plan.title,global_start_time:time(0,fps),tracks:{OTIO_SCHEMA:'Stack.1',name:'Tracks',children:tracks,effects:[],markers:(plan.markers||[]).filter(m=>m.frame<plan.frames).map(m=>({OTIO_SCHEMA:'Marker.2',name:m.label,color:m.kind==='chorus'?'RED':'GREEN',marked_range:{OTIO_SCHEMA:'TimeRange.1',start_time:time(m.frame,fps),duration:time(1,fps)},metadata:{shutter:{id:m.id,kind:m.kind}}})),metadata:{}},metadata:{shutter:{planHash:plan.hash,bridge:'conformed-rough-cut',fpsExact:plan.fps}}};
}

/** Conform on a preserved source clock, then take the requested output-frame window.
 * Repeated splits do not restart the rate-conversion phase on the right-hand shot. */
export function mediaPictureFilters(plan,clip,profile) {
  const sampling=clip.sampling||samplingFor(clip,plan.fps);
  const origin=rateValue(rational(sampling.origin,{zero:true}));
  const scaling=clip.fit==='cover'?`scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase:force_divisible_by=2:flags=lanczos,crop=${plan.width}:${plan.height}`:`scale=${plan.width}:${plan.height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2`;
  return `setpts=PTS-STARTPTS,trim=start=${origin},setpts=PTS-STARTPTS,fps=fps=${plan.fps}:start_time=0:round=near,trim=start_frame=${sampling.offsetFrames}:end_frame=${sampling.offsetFrames+clip.frames},setpts=PTS-STARTPTS,${scaling},setsar=1,format=yuv420p`;
}
/** Human-readable interchange companion. Neutralize spreadsheet formula prefixes. */
export function makeCueCsv(plan) {
  const cell=value=>{let s=String(value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return [['label','kind','output_frame','seconds','fps_exact','status'],...(plan.markers||[]).map(m=>[m.label,m.kind,m.frame,m.frame/rateValue(rational(plan.fps)),plan.fps,m.frame<plan.frames?'inside-picture':'outside-picture'])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

/** Explicit export. Every intermediate is inspected; failures never become a ready cut. */
export async function renderMediaEdit(studio,projectId,{baseRevision,acknowledgeUnmanagedColor=false}={}) {
  const record=studio.getTimeline(projectId);
  if(record.timeline.format!==MEDIA_EDIT_FORMAT)throw Error('media_edit_required');
  if(!Number.isSafeInteger(baseRevision)||record.revision!==baseRevision)throw Error('revision_conflict');
  if(!acknowledgeUnmanagedColor)throw Error('reference_color_review_required');
  const plan=record.plan;
  if(!plan.frames)throw Error('media_edit_empty');
  // Do not start a lengthy render that cannot produce its requested interchange package.
  rateXml(plan.fps);
  checkSoundBudget(plan);
  for(const s of plan.sources)await verifyMediaAsset(studio,s.assetId);
  const base=path.join(studio.root,'media-renders');await fsp.mkdir(base,{recursive:true});
  const folder=await fsp.mkdtemp(path.join(base,'cut-')), files=[], mediaFiles=[];
  let completed=false;
  try {
    for(let i=0;i<plan.clips.length;i++) {
      const c=plan.clips[i],p=getMediaProfile(studio,c.assetId),name=`shot-${String(i+1).padStart(4,'0')}.mp4`,target=path.join(folder,name);
      const filters=mediaPictureFilters(plan,c,p);
      await runMedia('ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,
        ...(p.kind==='image'?['-loop','1','-framerate',plan.fps]:[]),'-i',studio.assetPath(c.assetId),'-map',`0:${p.videoStream}`,
        '-vf',filters,'-r',plan.fps,'-fps_mode','cfr','-frames:v',String(c.frames),'-an','-c:v','libx264','-preset','fast','-crf','18','-threads','2','-filter_threads','1',
        '-video_track_timescale',String(rational(plan.fps).n),'-map_metadata','-1','-movflags','+faststart',target],{timeoutMs:900000});
      const raw=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_streams','-of','json',target]));
      const v=raw.streams?.[0];
      if(Number(v?.nb_read_frames)!==c.frames||v.width!==plan.width||v.height!==plan.height||rateText(rational(v.avg_frame_rate))!==plan.fps){const e=Error('render_frame_contract');e.diagnostic={clipId:c.id,expected:{frames:c.frames,fps:plan.fps,width:plan.width,height:plan.height},actual:{frames:v?.nb_read_frames,fps:v?.avg_frame_rate,width:v?.width,height:v?.height}};throw e;}
      files.push(name);mediaFiles.push({name,sha256:await fileDigest(target),frames:c.frames,sourceAssetId:c.assetId});
    }
    const concat=path.join(folder,'concat.txt');
    await fsp.writeFile(concat,files.map(n=>`file '${n}'`).join('\n')+'\n');
    const silent=path.join(folder,'picture.mp4');
    await runMedia('ffmpeg',['-v','error','-nostdin','-f','concat','-safe','1','-i',concat,'-map','0:v:0','-c','copy','-movflags','+faststart',silent],{timeoutMs:900000});
    const output=path.join(folder,'preview.mp4');
    let soundFiles=[];
    if(plan.soundStage) {
      const result=await renderSoundStage(studio,plan,folder);
      soundFiles=result.bridgeFiles;mediaFiles.push(...result.files);
      await runMedia('ffmpeg',['-v','error','-nostdin','-i',silent,'-i',path.join(folder,result.mixName),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-movflags','+faststart',output],{timeoutMs:900000});
    } else if(plan.soundtrack) {
      const wave=path.join(folder,'master-48k.wav');
      await runMedia('ffmpeg',['-v','error','-nostdin',...decoderArgs,'-i',studio.assetPath(plan.soundtrack.assetId),'-map',`0:${plan.soundtrack.sourceStream}`,
        '-af',`asetpts=PTS-STARTPTS,aresample=48000,apad=whole_len=${plan.audioSamples},atrim=end_sample=${plan.audioSamples}`,
        '-ac','2','-ar','48000','-c:a','pcm_s24le','-map_metadata','-1',wave],{timeoutMs:900000});
      const audioRaw=JSON.parse(await runMedia('ffprobe',['-v','error','-show_streams','-of','json',wave]));
      const a=audioRaw.streams?.[0];
      if(a?.sample_rate!=='48000'||a.channels!==2||a.duration_ts!==plan.audioSamples||a.time_base!=='1/48000')throw Error('render_audio_contract');
      await runMedia('ffmpeg',['-v','error','-nostdin','-i',silent,'-i',wave,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-movflags','+faststart',output],{timeoutMs:900000});
      mediaFiles.push({name:'master-48k.wav',sha256:await fileDigest(wave),samples:plan.audioSamples});
    } else await fsp.copyFile(silent,output);
    const probe=JSON.parse(await runMedia('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',output]));
    const v=probe.streams.find(s=>s.codec_type==='video');
    if(Number(v?.nb_read_frames)!==plan.frames||rateText(rational(v.avg_frame_rate))!==plan.fps)throw Error('render_frame_contract');
    // Bind to the exact revision that was rendered, even when another editor saves meanwhile.
    const asset=await importMediaFile(studio,output,{name:plan.title+' · rough cut.mp4',origin:'Local media assembly; unmanaged SDR'});
    await fsp.writeFile(path.join(folder,'timeline.xml'),makeBridgeXml(plan,files));
    await fsp.writeFile(path.join(folder,'timeline.otio'),JSON.stringify(makeBridgeOtio(plan,files),null,2)+'\n');
    await fsp.writeFile(path.join(folder,'cues.csv'),makeCueCsv(plan));
    await fsp.writeFile(path.join(folder,'manifest.json'),JSON.stringify({format:'shutter-bridge-v1',revision:record.revision,plan,files:mediaFiles,
      limitations:['Conformed H.264 rough-cut media, not camera-original grading handles.','Relative interchange paths require relinking the included media in the target editor.','Resolve/OTIO application import has not been certified.','No native FLP/DRP/PSD round-trip.','Original song is unchanged; included 48 kHz PCM is a derived, aligned delivery track.']},null,2)+'\n');
    const bridgeFiles=[...files,...(plan.soundStage?soundFiles:plan.soundtrack?['master-48k.wav']:[]),'timeline.xml','timeline.otio','cues.csv','manifest.json'];
    const hasZip=await writeBridgeZip(folder,bridgeFiles,path.join(folder,'shutter-handoff.zip'));
    const cut=studio.write('cut',{id:'cut_'+crypto.randomUUID(),projectId,output:asset.id,plan,revision:record.revision,
      bridgeFolder:path.basename(folder),bridgeFiles:hasZip?[...bridgeFiles,'shutter-handoff.zip']:bridgeFiles,zipStatus:hasZip?'ready':'zip64_required-use-individual-files',createdAt:new Date().toISOString()});
    await fsp.rm(concat,{force:true});await fsp.rm(silent,{force:true});await fsp.rm(output,{force:true});
    completed=true;return cut;
  } finally { if(!completed)await fsp.rm(folder,{recursive:true,force:true}); }
}
