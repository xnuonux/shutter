/** Streamed, channel-preserving waveform envelopes. Analysis never rewrites audio. */
import {spawn} from 'node:child_process';
import {ensureMediaProfile, verifyMediaAsset, decoderArgs} from './media-io.mjs';
export const WAVEFORM_SCHEMA = 'shutter-waveform-v1';
const SAMPLE_RATE = 48000, MAX_SECONDS = 14400;
/** Bounds memory by merging adjacent buckets; extrema survive every merge. */
export class PeakAccumulator {
  constructor({channels=2, samplesPerBin=256, maxBins=8192, maxSamples=MAX_SECONDS*SAMPLE_RATE}={}) {
    if (![1,2].includes(channels) || !Number.isSafeInteger(samplesPerBin) || samplesPerBin<1 || !Number.isSafeInteger(maxBins) || maxBins<2 || maxBins%2 || !Number.isSafeInteger(maxSamples) || maxSamples<1) throw Error('waveform_config');
    this.channels=channels;this.samplesPerBin=samplesPerBin;this.maxBins=maxBins;this.maxSamples=maxSamples;
    this.peaks=Array.from({length:channels},()=>[]);this.min=Array(channels).fill(Infinity);this.max=Array(channels).fill(-Infinity);
    this.count=0;this.samples=0;this.leftover=Buffer.alloc(0);this.closed=false;this.samplePeak=0;
  }
  push(bytes) {
    if(this.closed)throw Error('waveform_closed');
    const data=this.leftover.length?Buffer.concat([this.leftover,bytes]):bytes,stride=this.channels*4;
    const end=data.length-data.length%stride;
    for(let i=0;i<end;i+=stride) {
      if(++this.samples>this.maxSamples)throw Error('waveform_duration_limit');
      for(let c=0;c<this.channels;c++) {
        const sample=data.readFloatLE(i+c*4);if(!Number.isFinite(sample))throw Error('waveform_nonfinite');
        this.min[c]=Math.min(this.min[c],sample);this.max[c]=Math.max(this.max[c],sample);this.samplePeak=Math.max(this.samplePeak,Math.abs(sample));
      }
      if(++this.count===this.samplesPerBin) {
        this.flush();
        if(this.peaks[0].length/2===this.maxBins) {
          this.peaks=this.peaks.map(channel=>{
            const merged=[];for(let j=0;j<channel.length;j+=4)merged.push(Math.min(channel[j],channel[j+2]),Math.max(channel[j+1],channel[j+3]));return merged;
          });this.samplesPerBin*=2;
        }
      }
    }
    this.leftover=Buffer.from(data.subarray(end));
  }
  flush() {
    if(!this.count)return;
    for(let c=0;c<this.channels;c++){this.peaks[c].push(this.min[c],this.max[c]);this.min[c]=Infinity;this.max[c]=-Infinity;}
    this.count=0;
  }
  finish() {
    if(this.closed)throw Error('waveform_closed');
    if(this.leftover.length)throw Error('waveform_truncated_sample');
    if(!this.samples)throw Error('waveform_empty');
    this.flush();this.closed=true;
    return {sampleRate:SAMPLE_RATE,channels:this.channels,sampleFrames:this.samples,duration:this.samples/SAMPLE_RATE,samplesPerBin:this.samplesPerBin,peaks:this.peaks,samplePeak:this.samplePeak};
  }
}
const recordId=id=>'waveform_'+id.slice(6)+'_v1';
export async function readWaveform(studio,id) {
  const asset=await verifyMediaAsset(studio,id),result=studio.read(recordId(id),'media-waveform');
  if(result.schema!==WAVEFORM_SCHEMA||result.assetSha256!==asset.sha256)throw Error('waveform_cache_mismatch');
  return result;
}
export async function analyzeWaveform(studio,id,{signal}={}) {
  const asset=await verifyMediaAsset(studio,id);
  try{return await readWaveform(studio,id);}catch(e){if(e.message!=='not_found')throw e;}
  const p=await ensureMediaProfile(studio,id);
  if(p.kind!=='audio'||p.audio.length!==1||![1,2].includes(p.audio[0].channels))throw Error('stereo_or_mono_audio_required');
  if(p.duration>MAX_SECONDS)throw Error('waveform_duration_limit');
  if(signal?.aborted)throw Error('waveform_cancelled');
  const channels=p.audio[0].channels,accumulator=new PeakAccumulator({channels});
  const result=await new Promise((resolve,reject)=>{
    const child=spawn(process.env.SHUTTER_FFMPEG||'ffmpeg',['-v','error','-nostdin','-threads','2',...decoderArgs,'-i',studio.assetPath(id),'-map',`0:${p.audio[0].index}`,'-vn','-sn','-dn','-ar',String(SAMPLE_RATE),'-ac',String(channels),'-c:a','pcm_f32le','-f','f32le','pipe:1'],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let failure=null,diagnostic='';
    const stop=error=>{failure ||= error;child.kill('SIGKILL');};
    const abort=()=>stop(Error('waveform_cancelled'));signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>stop(Error('waveform_timeout')),180000);
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
    child.stdout.on('data',data=>{if(!failure)try{accumulator.push(data);}catch(e){stop(e);}});
    child.stderr.on('data',data=>{diagnostic=(diagnostic+data.toString()).slice(-4096);});
    child.on('error',e=>{cleanup();reject(Error(e.code==='ENOENT'?'ffmpeg_unavailable':'waveform_process_error'));});
    child.on('close',code=>{
      cleanup();if(failure)return reject(failure);
      if(code!==0){const e=Error('waveform_decode_failed');e.diagnostic=diagnostic;return reject(e);}
      try{resolve(accumulator.finish());}catch(e){reject(e);}
    });
  });
  // Cache only complete successful decodes. An incomplete stream is never a ready envelope.
  return studio.write('media-waveform',{...result,id:recordId(id),schema:WAVEFORM_SCHEMA,assetId:id,assetSha256:asset.sha256,sourceSampleRate:p.audio[0].sampleRate,sourceStream:p.audio[0].index,createdAt:new Date().toISOString(),measurement:'48 kHz decoded sample extrema; not LUFS, true-peak metering or automatic beat detection'});
}
