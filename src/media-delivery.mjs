/** Saved-render inspection. A new immutable report, never an edit or a mastering pass. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fingerprint} from './store.mjs';
import {rational, rateValue, fileDigest, verifyMediaAsset} from './media-io.mjs';
import {deliveryAudioFile} from './media-sound.mjs';
import {DELIVERY_SCHEMA, deliveryOptions, deliveryStatus, loudnessFindings} from '../public/delivery-contract.mjs';
import {inspectTools, probeDelivery, measureDeliveryAudio, inspectPictureEvents, videoContract} from './media-inspect.mjs';

const cancelled=signal=>{if(signal?.aborted)throw Error('delivery_cancelled');};
export function cutIdentity(cut) {
  return fingerprint({id:cut.id,projectId:cut.projectId,revision:cut.revision,output:cut.output,
    plan:cut.plan,bridgeFolder:cut.bridgeFolder,bridgeFiles:cut.bridgeFiles});
}
async function bridgeFile(studio,cut,name) {
  if (!/^cut-[a-zA-Z0-9]+$/.test(cut.bridgeFolder||'') || path.basename(name)!==name || !cut.bridgeFiles?.includes(name)) throw Error('delivery_bridge_path');
  const root=await fs.realpath(studio.root),base=path.join(root,'media-renders'),folder=path.join(base,cut.bridgeFolder),file=path.join(folder,name);
  for (const directory of [base,folder]) {
    const stat=await fs.lstat(directory);if (!stat.isDirectory()||stat.isSymbolicLink()) throw Error('delivery_bridge_path');
  }
  const stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||await fs.realpath(file)!==file)throw Error('delivery_bridge_path');
  return {file,stat};
}
function mediaFacts(probe) {
  return probe.streams.map(s=>({index:s.index,type:s.codec_type,codec:s.codec_name,
    width:s.width,height:s.height,pixelFormat:s.pix_fmt,averageFrameRate:s.avg_frame_rate,
    sampleRate:s.sample_rate?Number(s.sample_rate):undefined,channels:s.channels,
    startSeconds:s.start_time?Number(s.start_time):0,durationSeconds:s.duration?Number(s.duration):null,
    color:{primaries:s.color_primaries,transfer:s.color_transfer,matrix:s.color_space,range:s.color_range}}));
}
export function pcmContract(probe, plan) {
  const streams=probe.streams.filter(s=>s.codec_type==='audio'),a=streams[0];
  return {code:'aligned-pcm-contract',status:streams.length===1&&a.sample_rate==='48000'&&a.channels===2&&
    a.codec_name==='pcm_s24le'&&a.time_base==='1/48000'&&Number(a.duration_ts)===plan.audioSamples?'pass':'fail',
    expected:{samples:plan.audioSamples,sampleRate:48000,channels:2,codec:'pcm_s24le'},
    actual:a?{samples:a.duration_ts,sampleRate:Number(a.sample_rate),channels:a.channels,codec:a.codec_name,timeBase:a.time_base}:null};
}
function failureCode(e) {
  return /^(delivery_|media_|ffmpeg_|ffprobe_|asset_)[a-z0-9_]+$/.test(e.message)?e.message:
    e.code==='ENOENT'?'delivery_file_missing':'delivery_check_failed';
}
function raiseCancellation(e,signal) {cancelled(signal);if(e.message==='delivery_cancelled')throw e;}

/** Explicit caller action, serialized with other media work by the API.
 * Only saved cut records can be selected: no arbitrary paths or URLs in this interface. */
export async function checkDelivery(studio,cutId,input={}, {signal}={}) {
  const options=deliveryOptions(input),cut=studio.read(cutId,'cut'),plan=cut.plan;
  if(plan?.format!=='shutter-media-edit-v1'||!Number.isSafeInteger(plan.frames)||plan.frames<1||
     !Number.isFinite(plan.duration)||plan.duration<=0||plan.duration>14400||!Array.isArray(plan.sources)||
     !Number.isSafeInteger(cut.revision))throw Error('delivery_cut_required');
  const {hash,...hashInput}=plan;
  if(hash!==fingerprint(hashInput))throw Error('delivery_plan_integrity');
  const identity=cutIdentity(cut), startedAt=new Date().toISOString();
  cancelled(signal);
  const output=await verifyMediaAsset(studio,cut.output);
  cancelled(signal);
  const tools=await inspectTools({signal});
  const checks=[],findings=[],report={schema:DELIVERY_SCHEMA,id:'delivery_'+crypto.randomUUID(),
    cutId:cut.id,projectId:cut.projectId,revision:cut.revision,cutFingerprint:identity,
    outputAssetId:output.id,outputSha256:output.sha256,startedAt,tools,options,readOnly:true,
    checks,findings,audio:{},picture:{status:'not-requested'},
    notAssessed:['Visual intent, lip sync and perceptual audio/video synchronization.',
      'Color-managed grading, HDR transforms, camera-original quality or rights clearance.',
      'True-peak meter conformance certification or platform acceptance.',
      'Native Resolve/FL Studio import, XML/OTIO equivalence, stems and ZIP archive integrity.']};
  const examine=async(code,fn)=>{
    cancelled(signal);
    try {return await fn();}catch(e){raiseCancellation(e,signal);checks.push({code,status:'unassessed',reason:failureCode(e)});return null;}
  };
  // Decode the exact imported delivery file, not a regenerated approximation.
  const probe=await examine('delivery-probe',()=>probeDelivery(studio.assetPath(output.id),{signal,countFrames:true}));
  const expectedAudio=Boolean(deliveryAudioFile(plan));
  if(probe) {
    report.media=mediaFacts(probe);checks.push(...videoContract(probe,plan));
    const streams=probe.streams.filter(s=>s.codec_type==='audio'),audio=streams[0];
    checks.push({code:'encoded-audio-stream-count',status:streams.length===(expectedAudio?1:0)?'pass':'fail',expected:expectedAudio?1:0,actual:streams.length});
    if(audio) {
      checks.push({code:'encoded-audio-layout',status:audio.sample_rate==='48000'&&audio.channels===2?'pass':'fail',
        expected:{sampleRate:48000,channels:2},actual:{sampleRate:Number(audio.sample_rate),channels:audio.channels}});
      const audioDuration=Number(audio.duration),start=Number(audio.start_time??0),frame=1/rateValue(rational(plan.fps));
      checks.push({code:'encoded-audio-timing-metadata',status:Number.isFinite(audioDuration)&&Number.isFinite(start)&&Math.abs(start)<=frame&&
        Math.abs(audioDuration-plan.duration)<=Math.max(frame,1024/48000)?'pass':'fail',
        expected:{duration:plan.duration,start:0,toleranceSeconds:Math.max(frame,1024/48000)},actual:{duration:audioDuration,start}});
      if([1,2].includes(audio.channels)&&audioDuration>0&&audioDuration<=14401) {
        report.audio.encoded=await examine('encoded-loudness',()=>measureDeliveryAudio(studio.assetPath(output.id),audio.index,audioDuration,{signal}));
      } else checks.push({code:'encoded-loudness',status:'unassessed',reason:'delivery_audio_bounds'});
    } else report.audio.encoded={status:'no-audio-stream'};
    const video=probe.streams.find(s=>s.codec_type==='video'),duration=Number(video?.duration);
    if(options.scanPicture) {
      if(video&&duration>0&&duration<=14401) {
        report.picture=await examine('picture-events',()=>inspectPictureEvents(studio.assetPath(output.id),video.index,duration,{signal}));
        if(report.picture)for(const event of report.picture.events) {
          event.authoredStillClipIds=plan.clips.filter(c=>c.sourceKind==='image'&&c.at/rateValue(rational(plan.fps))<event.endSeconds&&
            (c.at+c.frames)/rateValue(rational(plan.fps))>event.startSeconds).map(c=>c.id);
          findings.push({code:event.kind,subject:'encoded-picture',severity:'review',
            message:event.kind==='near-black'?'Near-black interval: may be an intentional dark scene or fade.':'Static-looking interval: may be an intentional still or locked shot.',...event});
        }
      }else checks.push({code:'picture-events',status:'unassessed',reason:'delivery_picture_bounds'});
    }
  }
  // Hash original inputs to detect a changed/missing source; do not modify or reimport them.
  let originalsValid=true;
  for(const source of plan.sources) {
    cancelled(signal);
    try {const asset=await verifyMediaAsset(studio,source.assetId);if(asset.sha256!==source.sha256)throw Error('asset_integrity');}
    catch(e){raiseCancellation(e,signal);originalsValid=false;checks.push({code:'original-source-integrity',status:'fail',assetId:source.assetId,reason:failureCode(e)});}
  }
  if(originalsValid)checks.push({code:'original-source-integrity',status:'pass',sourceCount:plan.sources.length});

  const pcmName=deliveryAudioFile(plan);let pcmCustody=null;
  if(pcmName) {
    try {
      const manifestFile=await bridgeFile(studio,cut,'manifest.json');
      if(manifestFile.stat.size>4*1024*1024)throw Error('delivery_manifest_limit');
      const manifestBytes=await fs.readFile(manifestFile.file),manifest=JSON.parse(manifestBytes);
      if(manifest.revision!==cut.revision||fingerprint(manifest.plan)!==fingerprint(plan))throw Error('delivery_manifest_integrity');
      const entries=manifest.files?.filter(f=>f.name===pcmName);
      if(!Array.isArray(entries)||entries.length!==1||!/^[a-f0-9]{64}$/.test(entries[0].sha256))throw Error('delivery_manifest_integrity');
      const item=await bridgeFile(studio,cut,pcmName),digest=await fileDigest(item.file);
      if(digest!==entries[0].sha256)throw Error('delivery_pcm_integrity');
      pcmCustody={filename:pcmName,file:item.file,sha256:digest,manifestFile:manifestFile.file,
        manifestSha256:crypto.createHash('sha256').update(manifestBytes).digest('hex')};
      report.pcmFile={name:pcmName,sha256:digest};checks.push({code:'aligned-pcm-integrity',status:'pass'});
      const pcmProbe=await examine('aligned-pcm-probe',()=>probeDelivery(item.file,{signal}));
      if(pcmProbe) {
        checks.push(pcmContract(pcmProbe,plan));
        const a=pcmProbe.streams.find(s=>s.codec_type==='audio');
        const duration=a?.time_base==='1/48000'?Number(a.duration_ts)/48000:Number(a?.duration);
        if(a&&[1,2].includes(a.channels)&&duration>0&&duration<=14401) {
          report.audio.pcm=await examine('pcm-loudness',()=>measureDeliveryAudio(item.file,a.index,duration,{signal}));
        }else checks.push({code:'pcm-loudness',status:'unassessed',reason:'delivery_audio_bounds'});
      }
    }catch(e){raiseCancellation(e,signal);checks.push({code:'aligned-pcm-integrity',status:'fail',reason:failureCode(e)});}
  }else report.audio.pcm={status:'not-applicable'};
  for(const subject of ['encoded','pcm']) {
    const audio=report.audio[subject];
    if(audio?.status==='measured') {
      checks.push({code:subject+'-loudness',status:'pass',meaning:'Measurement completed, not a quality or compliance verdict.'});
      findings.push(...loudnessFindings(audio,options,subject));
      if(audio.curve?.nonfiniteWindows)checks.push({code:subject+'-momentary-curve',status:'unassessed',reason:'delivery_nonfinite_meter_windows',omittedWindows:audio.curve.nonfiniteWindows});
      if(subject==='encoded')for(const event of audio.events)findings.push({code:'near-silence',subject:'encoded-audio',severity:'review',
        message:'Very quiet interval: may be an intentional pause, fade or padded tail.',...event});
    }
  }
  if(report.picture?.status==='measured')checks.push({code:'picture-events',status:'pass',meaning:'Scan completed; review findings separately.'});
  if(!options.scanPicture)checks.push({code:'picture-events',status:'not-requested'});
  // Recheck the material actually measured. Do not publish a report against changed bytes.
  cancelled(signal);await verifyMediaAsset(studio,output.id);cancelled(signal);
  if(pcmCustody) {
    await bridgeFile(studio,cut,pcmCustody.filename);await bridgeFile(studio,cut,'manifest.json');
    if(await fileDigest(pcmCustody.file)!==pcmCustody.sha256||await fileDigest(pcmCustody.manifestFile)!==pcmCustody.manifestSha256)throw Error('delivery_input_changed');
  }
  if(cutIdentity(studio.read(cut.id,'cut'))!==identity)throw Error('delivery_cut_changed');
  cancelled(signal);
  report.status=deliveryStatus(checks,findings);report.finishedAt=new Date().toISOString();
  return studio.write('delivery-check',report);
}
