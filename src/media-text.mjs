/** Finishing text via installed FFmpeg/libass. No subtitle markup, fonts or binaries are imported. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeTextLayer,textReview,exportCaptions} from '../public/text-edit.mjs';
import {inspectProcess} from './media-inspect.mjs';
import {fileDigest,runMedia,decoderArgs} from './media-io.mjs';

export function textFont() {
  const family=process.env.SHUTTER_TEXT_FONT||'DejaVu Sans';
  if(!/^[A-Za-z0-9 _-]{1,80}$/.test(family))throw Error('text_font_family_invalid');
  return family;
}
export function burnedCues(plan) {
  const layer=normalizeTextLayer(plan.textLayer);
  return layer?.cues.filter(c=>c.kind!=='caption'||layer.captionDelivery==='burn-and-sidecar')||[];
}
export async function preflightText(plan) {
  if(!plan.textLayer)return;
  if(textReview(plan.textLayer,plan.frames,plan.fps).some(i=>i.blocking))throw Error('text_outside_picture');
  exportCaptions(plan.textLayer,plan.fps,'srt');exportCaptions(plan.textLayer,plan.fps,'vtt');
  if(burnedCues(plan).length) {
    textFont();
    if(!/\bass\s+V->V/.test(await runMedia('ffmpeg',['-hide_banner','-filters'],{timeoutMs:10000})))throw Error('text_libass_required');
  }
}
const assTime=n=>`${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}.00`;
/** ASS runs on a private one-second-per-frame clock; timestamps are restored before encoding.
 * This avoids the centisecond timing grid moving one-frame cues at fractional or 120 fps rates.
 * Do not offer this internal ASS file as real-time subtitle interchange. */
export function makeFrameClockAss(plan,{offset=0,count=plan.frames}={}) {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(count)||count<1||offset+count>plan.frames)throw Error('text_frame_range');
  const w=plan.width,h=plan.height,f=textFont(),margin=Math.round(w*.08),captionMargin=Math.round(h*.07);
  const size=(widthRatio,heightRatio)=>Math.max(8,Math.min(w*widthRatio,h*heightRatio)).toFixed(3);
  const line=(name,fontSize,bold,alignment,v)=>`Style: ${name},${f},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00141414,&H80000000,${bold},0,0,0,100,100,0,0,1,${Math.max(1,h/540).toFixed(3)},0,${alignment},${margin},${margin},${v},1`;
  const header=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${w}\nPlayResY: ${h}\nWrapStyle: 0\nScaledBorderAndShadow: yes\nYCbCr Matrix: None\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${line('Caption',size(.046,.05),0,2,captionMargin)}\n${line('Title',size(.075,.085),-1,5,0)}\n${line('Lower',size(.055,.052),-1,1,Math.round(h*.22))}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return header+burnedCues(plan).filter(c=>c.endFrame>offset&&c.startFrame<offset+count).map(c=>{
    const style={caption:'Caption',title:'Title','lower-third':'Lower'}[c.kind],layer=c.kind==='caption'?2:1;
    return `Dialogue: ${layer},${assTime(Math.max(c.startFrame-offset,0))},${assTime(Math.min(c.endFrame-offset,count))},${style},,0,0,0,,${c.text.replaceAll('\n','\\N')}`;
  }).join('\n')+'\n';
}
export function frameClockTextFilter(fps) {
  // fps has already passed the compiler's rational validation; validate again at this boundary.
  if(!/^\d+(?:\/\d+)?$/.test(fps))throw Error('text_frame_rate');
  const [n,d='1']=fps.split('/');
  return `setpts=N/TB,ass=shutter-text.ass:shaping=complex,setpts=N*${d}/${n}/TB`;
}
function fontEvidence(stderr) {
  if(stderr.length>=65536)throw Error('text_font_evidence_truncated');
  if(/failed to find any fallback with glyph|Could not find font|Error initializing filter/i.test(stderr))throw Error('text_font_or_glyph_unavailable');
  return [...new Set(stderr.split('\n').filter(l=>/fontselect:|libass API version:|libass source:|Shaper:|Using font provider/.test(l)).map(l=>l.replace(/^\[[^\]]+\]\s*/,'')))];
}
export async function burnTextPicture(plan,folder,input,output,{offset=0,count=plan.frames,still=false,signal}={}) {
  await fs.writeFile(path.join(folder,'shutter-text.ass'),makeFrameClockAss(plan,{offset,count}));
  const args=['-hide_banner','-v','info','-nostdin',...decoderArgs,'-i',input,'-map','0:v:0','-an','-vf',frameClockTextFilter(plan.fps),
    '-frames:v',String(count),'-filter_threads','1',...(still?['-c:v','png','-threads','1']:['-r',plan.fps,'-fps_mode','cfr','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-threads','2','-movflags','+faststart']),'-map_metadata','-1',output];
  try {
    const result=await inspectProcess('ffmpeg',args,{cwd:folder,signal,timeoutMs:900000,maxBytes:4*1024*1024});
    return {engine:'ffmpeg-libass',requestedFamily:textFont(),fontEvidence:fontEvidence(result.stderr),timing:'one-second-per-frame internal clock; original output clock restored',
      ffmpeg:(await runMedia('ffmpeg',['-version'],{timeoutMs:5000})).split('\n')[0]};
  } finally {await fs.rm(path.join(folder,'shutter-text.ass'),{force:true});}
}
export async function writeTextHandoff(plan,folder,{renderEvidence=null}={}) {
  const layer=normalizeTextLayer(plan.textLayer);if(!layer?.cues.length)return {names:[],files:[]};
  const names=['text-layer.json'];
  const captions=layer.cues.filter(c=>c.kind==='caption');
  if(captions.length) {
    names.push('captions.srt','captions.vtt');
    await fs.writeFile(path.join(folder,'captions.srt'),exportCaptions(layer,plan.fps,'srt'));
    await fs.writeFile(path.join(folder,'captions.vtt'),exportCaptions(layer,plan.fps,'vtt'));
  }
  await fs.writeFile(path.join(folder,'text-layer.json'),JSON.stringify({schema:'shutter-text-handoff-v1',fps:plan.fps,frames:plan.frames,planHash:plan.hash,textLayer:layer,
    review:textReview(layer,plan.frames,plan.fps),renderEvidence,
    limitations:['Native XML/OTIO handoffs reference clean shots and do not recreate the text layers. Import captions separately; recreate titles from this frame-anchored record.',
      'SRT/VTT times are floored to milliseconds (<1 ms early). This JSON retains exact output-frame boundaries.',
      'Installed fonts and shaping can differ across machines. No font file is bundled. Review rendered glyphs and wrapping.',
      'A burned-caption export also carries optional sidecars. Enabling both may display captions twice.']},null,2)+'\n');
  return {names,files:await Promise.all(names.map(async name=>({name,sha256:await fileDigest(path.join(folder,name))})))};
}
