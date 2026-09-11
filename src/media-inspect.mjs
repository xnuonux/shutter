/** Read-only adapters to installed FFmpeg/ffprobe. No downloaded executable or runtime package.
 * See docs/delivery-check.md for filter provenance, tested versions and limits. */
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {decoderArgs, rational, rateText} from './media-io.mjs';

/** Bounded streams, finite deadlines, no shell, cancellation; NOT an OS decoder sandbox. */
export function inspectProcess(tool, args, {signal, timeoutMs = 900000, onLine,
  maxBytes = 128 * 1024 * 1024, maxCapture = 4 * 1024 * 1024, cwd} = {}) {
  if (!['ffmpeg', 'ffprobe'].includes(tool)) throw Error('media_tool');
  if (signal?.aborted) return Promise.reject(Error('delivery_cancelled'));
  return new Promise((resolve, reject) => {
    const binary = process.env[tool === 'ffmpeg' ? 'SHUTTER_FFMPEG' : 'SHUTTER_FFPROBE'] || tool;
    const child = spawn(binary, args, {shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'], cwd});
    let failure, bytes=0, capture='', stderr='', line='', settled=false;
    const decoder = new StringDecoder('utf8');
    const stop = message => { if (!failure) failure=Error(message); child.kill('SIGKILL'); };
    const cancel = () => stop('delivery_cancelled');
    const timer = setTimeout(() => stop('delivery_timeout'), timeoutMs);
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort',cancel); };
    signal?.addEventListener('abort', cancel, {once:true});
    // Close the race between the initial aborted check and listener registration.
    if (signal?.aborted) cancel();
    const processText = text => {
      if (!onLine) { capture+=text; if (Buffer.byteLength(capture)>maxCapture) stop('delivery_output_limit'); return; }
      line+=text;
      let at;
      while ((at=line.indexOf('\n'))>=0) {
        const complete=line.slice(0,at).replace(/\r$/, ''); line=line.slice(at+1);
        try { onLine(complete); } catch (e) { failure=e; child.kill('SIGKILL'); return; }
      }
      if (line.length>65536) stop('delivery_line_limit');
    };
    child.stdout.on('data', chunk => {
      bytes+=chunk.length;
      if (bytes>maxBytes) return stop('delivery_output_limit');
      processText(decoder.write(chunk));
    });
    child.stderr.on('data', chunk => {
      bytes+=chunk.length;
      if (bytes>maxBytes) return stop('delivery_output_limit');
      stderr=(stderr+chunk.toString('utf8')).slice(-65536);
    });
    child.on('error', e => {
      if (settled) return; settled=true; clean();
      reject(Error(e.code==='ENOENT'?`${tool}_unavailable`:'delivery_process_error'));
    });
    child.on('close', code => {
      if (settled) return; settled=true; clean();
      if (!failure) { processText(decoder.end()); if (onLine && line) {try {onLine(line);} catch(e) {failure=e;}} }
      if (failure) return reject(failure);
      if (code!==0) {
        const e=Error(/No such filter|Option .*not found|Error applying option/i.test(stderr)?'delivery_filter_unavailable':'delivery_decode_failed');
        e.diagnostic=stderr; return reject(e);
      }
      resolve({stdout:capture, stderr});
    });
  });
}
export async function inspectTools(options={}) {
  const result={};
  for (const tool of ['ffmpeg','ffprobe']) {
    const {stdout}=await inspectProcess(tool,['-version'],{...options,timeoutMs:5000});
    result[tool]=stdout.split('\n')[0];
  }
  return result;
}
export async function probeDelivery(filename, {countFrames=false, ...options}={}) {
  const {stdout}=await inspectProcess('ffprobe',['-v','error',...decoderArgs,
    ...(countFrames?['-count_frames']:[]),'-show_streams','-show_format','-of','json',filename],options);
  let value;try {value=JSON.parse(stdout);}catch {throw Error('delivery_probe_invalid');}
  if (!Array.isArray(value.streams) || !value.streams.length) throw Error('delivery_probe_invalid');
  return value;
}
const numeric = value => /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(value)?Number(value):NaN;
const finite = value => Number.isFinite(value)?value:null;

/** Metadata adapters consume known keys only. Filenames/user text cannot become commands. */
export function eventCollector(duration, {maxEvents=2000}={}) {
  const open=new Map(), events=[];
  const definitions={
    'lavfi.black_start':['near-black','start',0.5], 'lavfi.black_end':['near-black','end',0.5],
    'lavfi.freezedetect.freeze_start':['static-picture','start',1],
    'lavfi.freezedetect.freeze_end':['static-picture','end',1],
    'lavfi.silence_start':['near-silence','start',0.5], 'lavfi.silence_end':['near-silence','end',0.5],
  };
  const add=(kind,start,end,min,endedAtEof=false)=>{
    const a=Math.max(0,Math.min(duration,start)),b=Math.max(0,Math.min(duration,end));
    if (b-a+1e-6<min) return;
    if (events.length>=maxEvents) throw Error('delivery_event_limit');
    events.push({kind,startSeconds:a,endSeconds:b,endedAtEof});
  };
  return {
    line(text) {
      const at=text.indexOf('=');if (at<0) return;
      const d=definitions[text.slice(0,at)];if (!d) return;
      const time=numeric(text.slice(at+1));if (!Number.isFinite(time)) throw Error('delivery_metadata_invalid');
      const [kind,edge,min]=d;
      if (edge==='start') {if (open.has(kind)) throw Error('delivery_metadata_order');open.set(kind,{time,min});}
      else {const start=open.get(kind);if (!start) throw Error('delivery_metadata_order');if(time<start.time)throw Error('delivery_metadata_order');add(kind,start.time,time,min);open.delete(kind);}
    },
    finish() {
      for (const [kind,{time,min}]of open) add(kind,time,duration,min,true);
      open.clear();return events.sort((a,b)=>a.startSeconds-b.startSeconds||a.kind.localeCompare(b.kind));
    },
  };
}
export function audioCollector(duration) {
  const events=eventCollector(duration),bins=new Map();
  const binSeconds=Math.max(0.1,Math.ceil(duration/600*10)/10);
  let time=0,last={},frames=0,nonfiniteWindows=0;
  return {
    line(text) {
      events.line(text);
      const header=/^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(text);
      if(header) {time=numeric(header[1]);if(!Number.isFinite(time)||time<0)throw Error('delivery_metadata_invalid');frames++;return;}
      const match=/^lavfi\.r128\.(M|S|I|LRA)=(.+)$/.exec(text);if (!match) return;
      const value=numeric(match[2]);
      if(!Number.isFinite(value)) {
        // FFmpeg can emit a nonfinite window near digital silence through rounding.
        // It is missing meter evidence, not proof of nonfinite samples or zero loudness.
        if(!/^[-+]?(nan|inf)$/i.test(match[2]))throw Error('delivery_metadata_invalid');
        last[match[1]]=null;nonfiniteWindows++;return;
      }
      last[match[1]]=value;
      if(match[1]==='M' && value>-70 && time+0.1>=0.4) {
        const index=Math.floor(time/binSeconds+1e-8),old=bins.get(index);
        if(index>10000||bins.size>650)throw Error('delivery_curve_limit');
        if(old===undefined||old<value)bins.set(index,value);
      }
    },
    finish(stderr) {
      // Use the final summary (rather than FFmpeg's initial empty summary).
      const summary=stderr.slice(stderr.lastIndexOf('Summary:'));
      if (!summary.includes('Integrated loudness:') || !summary.includes('True peak:')) throw Error('delivery_summary_missing');
      const peak=label=>{const match=new RegExp(label+':\\s*Peak:\\s*([^\\s]+)').exec(summary);
        if(!match)throw Error('delivery_summary_missing');
        if(match[1]==='-inf')return null;
        const v=numeric(match[1]);if(!Number.isFinite(v))throw Error('delivery_summary_invalid');return v;};
      const integrated=duration>=0.4&&Number.isFinite(last.I)&&last.I>-70?last.I:null;
      return {status:'measured',method:'FFmpeg ebur128; true-peak oversampling; native channel layout',
        integratedLufs:integrated,loudnessRangeLu:duration>=3&&integrated!==null?finite(last.LRA):null,
        samplePeakDbfs:peak('Sample peak'),truePeakDbtp:peak('True peak'),peakPrecisionDb:0.1,
        loudnessState:integrated===null?'below-gate-or-short':'measured',
        events:events.finish(),curve:{quantity:'maximum momentary loudness in each bin',binSeconds,
          points:[...bins].map(([i,lufs])=>({seconds:Number((i*binSeconds).toFixed(6)),lufs})),
          status:nonfiniteWindows?'partial':'measured',nonfiniteWindows},metadataFrames:frames};
    },
  };
}
export async function measureDeliveryAudio(filename, streamIndex, duration, options={}) {
  if (!Number.isSafeInteger(streamIndex)||streamIndex<0||!Number.isFinite(duration)||duration<=0||duration>14401)throw Error('delivery_audio_bounds');
  const collector=audioCollector(duration);
  const {stderr}=await inspectProcess('ffmpeg',['-hide_banner','-v','info','-nostats','-nostdin','-xerror','-threads','2',
    ...decoderArgs,'-i',filename,'-map',`0:${streamIndex}`,'-vn','-sn','-dn','-filter_threads','1',
    '-af',"asetpts=PTS-STARTPTS,ebur128=peak=sample+true:metadata=1:framelog=verbose,silencedetect=noise=-60dB:d=0.5,ametadata=mode=print:file='pipe\\:1'",
    '-f','null','-'],{...options,onLine:text=>collector.line(text)});
  return collector.finish(stderr);
}
export async function inspectPictureEvents(filename, streamIndex, duration, options={}) {
  if(!Number.isSafeInteger(streamIndex)||streamIndex<0||!Number.isFinite(duration)||duration<=0||duration>14401)throw Error('delivery_picture_bounds');
  const collector=eventCollector(duration);
  await inspectProcess('ffmpeg',['-hide_banner','-v','error','-nostats','-nostdin','-xerror','-threads','2',
    ...decoderArgs,'-i',filename,'-map',`0:${streamIndex}`,'-an','-sn','-dn','-filter_threads','1',
    '-vf',"setpts=PTS-STARTPTS,blackdetect=d=0.5:pix_th=0.1:pic_th=0.98,freezedetect=n=-60dB:d=1,metadata=mode=print:file='pipe\\:1'",
    '-f','null','-'],{...options,onLine:text=>collector.line(text)});
  return {status:'measured',events:collector.finish(),thresholds:{nearBlack:{minimumSeconds:0.5,pixelLumaFraction:0.1,pictureFraction:0.98},staticPicture:{minimumSeconds:1,noiseDb:-60}}};
}
export function videoContract(probe, plan) {
  const streams=probe.streams.filter(s=>s.codec_type==='video'),v=streams[0],checks=[];
  const add=(code,ok,expected,actual)=>checks.push({code,status:ok?'pass':'fail',expected,actual:actual??null});
  add('video-stream-count',streams.length===1,1,streams.length);
  if (!v) return checks;
  add('picture-size',v.width===plan.width&&v.height===plan.height,[plan.width,plan.height],[v.width,v.height]);
  add('decoded-picture-count',Number(v.nb_read_frames)===plan.frames,plan.frames,v.nb_read_frames===undefined?null:Number(v.nb_read_frames));
  let fps;try {fps=rateText(rational(v.avg_frame_rate));}catch {fps=null;}
  const wanted=rateText(rational(plan.fps));add('average-frame-rate',fps===wanted,wanted,fps);
  add('square-pixels',v.sample_aspect_ratio==='1:1','1:1',v.sample_aspect_ratio);
  const duration=Number(v.duration),frameSeconds=rational(plan.fps).d/rational(plan.fps).n;
  add('picture-duration',Number.isFinite(duration)&&Math.abs(duration-plan.duration)<=Math.max(1e-5,frameSeconds/100),plan.duration,finite(duration));
  return checks;
}
