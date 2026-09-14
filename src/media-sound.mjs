/** Bounded-block, explicit-gain sound rendering. FFmpeg decodes; this module owns
 * sample placement, fades, summation and overload rejection. No shell or new service. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeSoundStage, soundAudibility, envelopeAt, gainForDb, soundIdentity, SAMPLE_RATE, SOUND_POLICY} from '../public/sound-edit.mjs';
import {getMediaProfile, verifyMediaAsset, runMedia, decoderArgs, importMediaFile, fileDigest} from './media-io.mjs';
import {inspectProcess} from './media-inspect.mjs';
const BLOCK = 4096, BYTES_PER_FRAME = 8;

export function compileSoundStage(studio, edit, sources, warnings, audioSamples) {
  const stage = normalizeSoundStage(edit.soundStage);
  if (!stage) { if (edit.audioPolicy !== 'soundtrack-or-silence') throw Error('media_edit_policy'); return null; }
  if (edit.audioPolicy !== SOUND_POLICY) throw Error('sound_policy_required');
  for (const t of stage.tracks) for (const c of t.clips) {
    const asset = studio.read(c.assetId,'asset'), media = getMediaProfile(studio,c.assetId);
    if (asset.sha256 !== c.assetId.slice(6) || media.assetSha256 !== asset.sha256) throw Error('asset_integrity');
    const stream = media.audio?.find(a => a.index === c.streamIndex);
    if (!['audio','video'].includes(media.kind) || !stream || ![1,2].includes(stream.channels)) throw Error('sound_stream_required');
    if (!Number.isInteger(stream.sampleRate) || stream.sampleRate < 8000 || stream.sampleRate > 384000) throw Error('sound_sample_rate');
    // Probed duration is only an early bound. The decoded sample count is authoritative at render.
    let duration = media.duration;
    if (Number.isSafeInteger(stream.durationTicks) && /^\d+\/\d+$/.test(stream.timeBase || '')) {
      const [n,d] = stream.timeBase.split('/').map(Number);
      if (n > 0 && d > 0) duration = stream.durationTicks * n / d;
    }
    if (c.sourceInSample + c.samples > Math.round(duration * SAMPLE_RATE) + 1) throw Error('sound_source_range');
    if (c.atSample + c.samples > audioSamples) warnings.add('Sound extends beyond picture; export truncates it without moving or deleting the authored clip.');
    if (media.kind === 'video') warnings.add('Camera audio is explicitly selected by stream. Source-in is relative to the decoded audio stream, not automatic camera sync.');
    if (stream.sampleRate !== SAMPLE_RATE) warnings.add('Selected sound is resampled to 48 kHz for the mix; originals are unchanged.');
    sources.set(asset.id,{assetId:asset.id,sha256:asset.sha256,kind:media.kind,media});
  }
  warnings.add('Sound Stage: explicit gain, linear fades and mute/solo are baked into the listening mix. No normalization or limiting.');
  return stage;
}
/** Conservative peak disk estimate for this audio job, not a global disk quota. */
export const MAX_SOUND_WORK_BYTES = 8 * 1024 ** 3;
export function checkSoundBudget(plan, {stems=true}={}) {
  if(!plan.soundStage)return 0;
  const n=plan.audioSamples,tracks=plan.soundStage.tracks;
  if(!Number.isSafeInteger(n)||n<1||n>48000*14400)throw Error('sound_empty');
  const decoded=tracks.flatMap(t=>t.clips).reduce((sum,c)=>sum+Math.max(0,Math.min(c.samples,n-c.atSample))*8,0);
  const bytes=decoded+n*(14+(plan.soundtrack?(stems?14:8):0)+(stems?tracks.length*16:0));
  if(bytes>MAX_SOUND_WORK_BYTES)throw Error('sound_work_budget');
  return bytes;
}
export const deliveryAudioFile = plan => plan.soundStage ? 'mix-48k.wav' : plan.soundtrack ? 'master-48k.wav' : null;
async function writeAll(handle, buffer) {
  let offset=0; while (offset < buffer.length) {
    const {bytesWritten} = await handle.write(buffer,offset,buffer.length-offset);
    if (!bytesWritten) throw Error('sound_write_failed'); offset += bytesWritten;
  }
}
async function readExact(handle, buffer, position) {
  let offset=0; while(offset<buffer.length) {
    const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,position+offset);
    if (!bytesRead) throw Error('sound_decoded_range'); offset+=bytesRead;
  }
}
function floatBuffer(values) {
  const buffer=Buffer.alloc(values.length*4);
  for(let i=0;i<values.length;i++) {
    if (!Number.isFinite(Math.fround(values[i]))) throw Error('sound_nonfinite');
    buffer.writeFloatLE(values[i],i*4);
  }
  return buffer;
}
async function decode(studio, source, target, count, pad=false, signal) {
  const profile=getMediaProfile(studio,source.assetId), stream=profile.audio.find(a=>a.index===source.streamIndex);
  if(!stream)throw Error('sound_stream_required');
  const start=source.sourceInSample || 0;
  const filters=['asetpts=PTS-STARTPTS','aresample=48000:dither_method=none',
    `atrim=start_sample=${start}:end_sample=${start+count}`,'asetpts=PTS-STARTPTS'];
  // Explicit dual-mono, rather than an implicit -3 dB mono-to-stereo pan law.
  filters.push(stream.channels===1?'pan=stereo|c0=c0|c1=c0':'aformat=channel_layouts=stereo');
  if(pad)filters.push(`apad=whole_len=${count}`,`atrim=end_sample=${count}`);
  await inspectProcess('ffmpeg',['-v','error','-nostdin',...decoderArgs,'-i',studio.assetPath(source.assetId),
    '-map',`0:${source.streamIndex}`,'-vn','-af',filters.join(','),'-ar','48000','-ac','2',
    '-c:a','pcm_f32le','-f','f32le',target],{timeoutMs:900000,signal});
  if((await fs.stat(target)).size!==count*BYTES_PER_FRAME)throw Error('sound_decoded_range');
}
async function wrapWave(raw, wave, samples, floating=false, signal) {
  await inspectProcess('ffmpeg',['-v','error','-nostdin','-f','f32le','-ar','48000','-ac','2','-i',raw,
    '-c:a',floating?'pcm_f32le':'pcm_s24le','-rf64','auto','-map_metadata','-1',wave],{timeoutMs:900000,signal});
  const {stdout}=await inspectProcess('ffprobe',['-v','error','-show_streams','-of','json',wave],{timeoutMs:10000,signal});
  const info=JSON.parse(stdout).streams?.[0];
  if(info?.sample_rate!=='48000'||info.channels!==2||info.duration_ts!==samples||info.time_base!=='1/48000')throw Error('render_audio_contract');
}
/** Caller supplies an isolated directory and a validated immutable plan. Cleanup is
 * exception-safe; user source assets are only read. Stems are post-track-gain/fade,
 * pre-mute/solo/output gain, aligned at timeline zero, in 32-bit float WAV. */
async function renderSoundStageInternal(studio, plan, folder, {stems=true,startSample=0,endSample=plan.audioSamples,signal}={}) {
  if(signal?.aborted)throw Error('sound_render_cancelled');
  const stage=normalizeSoundStage(plan.soundStage);
  if(!stage||!Number.isSafeInteger(plan.audioSamples)||plan.audioSamples<1)throw Error('sound_empty');
  if(!Number.isSafeInteger(startSample)||!Number.isSafeInteger(endSample)||startSample<0||endSample<=startSample||endSample>plan.audioSamples)throw Error('sound_interval_range');
  const intervalSamples=endSample-startSample;
  const estimatedWorkBytes=checkSoundBudget({...plan,audioSamples:intervalSamples,soundStage:{...stage,tracks:stage.tracks.map(t=>({...t,clips:t.clips.flatMap(c=>{const a=Math.max(startSample,c.atSample),b=Math.min(endSample,c.atSample+c.samples);return b>a?[{...c,atSample:a-startSample,samples:b-a}]:[];})}))}},{stems});
  const temp=await fs.mkdtemp(path.join(folder,'sound-work-'));
  const readers=[],handles=[],made=[];let finished=false;
  try {
    const audible=soundAudibility(stage,Boolean(plan.soundtrack));
    const buses=stage.tracks.map((t,i)=>({...t,audible:audible.tracks[i].audible,
      raw:path.join(temp,`stem-${i}.raw`),name:`stem-${String(i+1).padStart(2,'0')}-48k-f32.wav`}));
    if(plan.soundtrack) {
      const raw=path.join(temp,'master.raw');
      await decode(studio,{assetId:plan.soundtrack.assetId,streamIndex:plan.soundtrack.sourceStream,sourceInSample:(plan.soundtrack.sourceInSample||0)+startSample},raw,intervalSamples,true,signal);
      const handle=await fs.open(raw,'r');handles.push(handle);
      readers.push({handle,master:true,at:startSample,count:intervalSamples});
      if(stems){const name='master-48k.wav';await wrapWave(raw,path.join(folder,name),intervalSamples,false,signal);made.push(name);}
    }
    let serial=0;
    for(const bus of buses) {
      if(stems){bus.writer=await fs.open(bus.raw,'wx');handles.push(bus.writer);}
      for(const clip of bus.clips) {
        const overlapStart=Math.max(startSample,clip.atSample),overlapEnd=Math.min(endSample,clip.atSample+clip.samples),count=Math.max(0,overlapEnd-overlapStart);
        if(!count)continue;
        const raw=path.join(temp,`source-${serial++}.raw`);
        await decode(studio,{...clip,sourceInSample:(clip.sourceInSample||0)+(overlapStart-clip.atSample)},raw,count,false,signal);
        const handle=await fs.open(raw,'r');handles.push(handle);
        readers.push({handle,bus,clip,at:overlapStart,count,gain:gainForDb(bus.gainDb+clip.gainDb)});
      }
    }
    const mixRaw=path.join(temp,'mix.raw'),mixWriter=await fs.open(mixRaw,'wx');handles.push(mixWriter);
    const outputGain=gainForDb(stage.outputGainDb),peak=[0,0];let overloadSamples=0;
    for(let start=startSample;start<endSample;start+=BLOCK) {
      if(signal?.aborted)throw Error('sound_render_cancelled');
      const count=Math.min(BLOCK,endSample-start), mix=new Float64Array(count*2);
      const buffers=new Map(buses.map(b=>[b.id,new Float64Array(count*2)]));
      for(const reader of readers) {
        const from=Math.max(start,reader.at),to=Math.min(start+count,reader.at+reader.count);
        if(from>=to)continue;
        const data=Buffer.alloc((to-from)*BYTES_PER_FRAME);
        await readExact(reader.handle,data,(from-reader.at)*BYTES_PER_FRAME);
        const target=reader.master?mix:buffers.get(reader.bus.id);
        for(let frame=from;frame<to;frame++) {
            const gain=reader.master?(audible.master?1:0):reader.gain*envelopeAt(reader.clip,frame-reader.clip.atSample);
          for(let c=0;c<2;c++) {
            const value=data.readFloatLE((frame-from)*8+c*4);
            if(!Number.isFinite(value))throw Error('sound_nonfinite');
            target[(frame-start)*2+c]+=value*gain;
          }
        }
      }
      for(const bus of buses) {
        const values=buffers.get(bus.id),bytes=floatBuffer(values);
        if(stems)await writeAll(bus.writer,bytes);
        if(bus.audible)for(let i=0;i<values.length;i++)mix[i]+=bytes.readFloatLE(i*4);
      }
      for(let i=0;i<mix.length;i++) {
        mix[i]=Math.fround(mix[i]*outputGain);
        if(!Number.isFinite(mix[i]))throw Error('sound_nonfinite');
        peak[i%2]=Math.max(peak[i%2],Math.abs(mix[i]));
        if(Math.abs(mix[i])>=1)overloadSamples++;
      }
      await writeAll(mixWriter,floatBuffer(mix));
    }
    for(const h of handles)await h.close();handles.length=0;
    const report={schema:'shutter-sound-report-v1',samples:intervalSamples,...(startSample||endSample!==plan.audioSamples?{originSample:startSample}:{}),sampleRate:SAMPLE_RATE,channels:2,
      samplePeak:peak,samplePeakDbfs:peak.map(p=>p?20*Math.log10(p):null),overloadSamples,
      suggestedOutputGainDb:overloadSamples?Math.max(-60,Math.floor((stage.outputGainDb-20*Math.log10(Math.max(...peak))-1)*10)/10):null,
      metering:'sample-peak only; not true-peak or LUFS',estimatedWorkBytes,normalization:false,limiter:false,outputGainDb:stage.outputGainDb,
      audibility:audible,monoMapping:'dual-mono at unity',stemPolicy:'post-track-gain/fades, pre-mute/solo/output-gain; aligned 32-bit float'};
    if(overloadSamples) {const e=Error('sound_mix_clipping');e.publicDetails=report;throw e;}
    const mixName='mix-48k.wav';await wrapWave(mixRaw,path.join(folder,mixName),intervalSamples,false,signal);made.push(mixName);
    if(stems)for(const bus of buses){await wrapWave(bus.raw,path.join(folder,bus.name),intervalSamples,true,signal);made.push(bus.name);}
    const files=[];for(const name of made)files.push({name,sha256:await fileDigest(path.join(folder,name)),samples:intervalSamples});
    const manifest={report,identity:plan.soundIdentity,tracks:buses.map(b=>({id:b.id,name:b.name,role:b.role,label:stage.tracks.find(t=>t.id===b.id).name,audible:b.audible})),files};
    const reportName='sound-report.json';await fs.writeFile(path.join(folder,reportName),JSON.stringify(manifest,null,2)+'\n');made.push(reportName);
    finished=true;return {mixName,report,files,bridgeFiles:made};
  } finally {
    await Promise.allSettled(handles.map(h=>h.close()));await fs.rm(temp,{recursive:true,force:true});
    if(!finished)await Promise.allSettled(made.map(name=>fs.rm(path.join(folder,name),{force:true})));
  }
}
export async function renderSoundStage(studio, plan, folder, options={}) { return renderSoundStageInternal(studio,plan,folder,{...options,startSample:0,endSample:plan.audioSamples,stems:options.stems??true}); }
export async function renderSoundStageInterval(studio, plan, folder, options={}) { if(!Number.isSafeInteger(options.startSample)||!Number.isSafeInteger(options.endSample))throw Error('sound_interval_range'); return renderSoundStageInternal(studio,plan,folder,{startSample:options.startSample,endSample:options.endSample,signal:options.signal,stems:false}); }
/** Saved-revision listening mix, separate from picture rendering. Never claim an
 * older mix represents an altered draft; browser matching uses canonical identity. */
export async function renderListeningMix(studio,projectId,{baseRevision}={}) {
  const record=studio.getTimeline(projectId),plan=record.plan;
  if(!Number.isSafeInteger(baseRevision)||record.revision!==baseRevision)throw Error('revision_conflict');
  if(!plan.soundStage||!plan.frames)throw Error('sound_empty');
  checkSoundBudget(plan,{stems:false});
  for(const s of plan.sources)await verifyMediaAsset(studio,s.assetId);
  const root=path.join(studio.root,'media-tmp');await fs.mkdir(root,{recursive:true});
  const folder=await fs.mkdtemp(path.join(root,'listening-'));
  try {
    const result=await renderSoundStage(studio,plan,folder,{stems:false});
    const asset=await importMediaFile(studio,path.join(folder,result.mixName),{name:plan.title+' · listening mix.wav',origin:'Explicit local Sound Stage mix'});
    return studio.write('listening-mix',{id:'mix_'+crypto.randomUUID(),projectId,revision:record.revision,
      planHash:plan.hash,identity:soundIdentity(record.timeline),assetId:asset.id,report:result.report,createdAt:new Date().toISOString()});
  } finally {await fs.rm(folder,{recursive:true,force:true});}
}
