import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {advanceSource} from '../public/music-edit.mjs';
test('scene MCP validates chronology and every scoped media route, including metadata-only and explicit audio',async t=>{
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==','base64'),audio=Buffer.from('ID3 synthetic test bytes'),hash=b=>createHash('sha256').update(b).digest('hex');
  const id='scene_review_'+'e'.repeat(64),prefix=`/api/media/productions/p/reviews/${id}`,sha='a'.repeat(64);let fault=null,mediaRequests=0;const requested=[];
  const manifest=()=>({schema:'shutter-scene-review-v1',id,projectId:'p',baseRevision:2,planHash:sha,startFrame:24,endFrame:48,fps:'24/1',
    preview:{url:prefix+'/preview',sha256:sha,fps:'24/1',frames:24,width:640,height:360,durationSeconds:1,audio:'mixed'},
    frames:[0,7,15,23].map((f,i)=>({index:i,previewFrame:f,sceneFrame:24+f,previewTime:advanceSource('0',f,'24/1'),sceneTime:advanceSource('0',24+f,'24/1'),url:prefix+'/frames/'+i,sha256:hash(jpeg)})),
    audio:{url:prefix+'/audio',sha256:hash(audio),waveUrl:prefix+'/wave',waveSha256:sha,startSample:48000,endSample:96000,samples:48000,sampleRate:48000,channels:2}});
  const server=createServer((req,res)=>{
    requested.push(req.url);
    if(req.method==='GET'){
      mediaRequests++;const sound=req.url.endsWith('/audio');
      if(fault==='redirect'){res.writeHead(302,{location:'http://example.invalid/'});return res.end();}
      res.writeHead(200,{'content-type':sound?(fault==='audio-mime'?'text/html':'audio/mpeg'):'image/jpeg'});
      return res.end(sound?(fault==='audio-large'?Buffer.alloc(1024*1024+1):fault==='audio-bytes'?Buffer.from('invalid'):audio):jpeg);
    }
    let body='';req.on('data',b=>body+=b);req.on('end',()=>{
      const input=JSON.parse(body);assert.deepEqual(input,{baseRevision:2,startFrame:24,endFrame:48,frameCount:4});
      const m=manifest();
      if(fault==='revision')m.baseRevision=3;if(fault==='scene-time')m.frames[1].sceneTime='0/1';if(fault==='order')m.frames.reverse();if(fault==='phase')m.frames[1].previewFrame++;
      if(fault==='frame-route')m.frames[0].url='/api/state';if(fault==='audio-route')m.audio.url='/api/state';if(fault==='wave-route')m.audio.waveUrl='/api/state';
      if(fault==='duration')delete m.preview.durationSeconds;if(fault==='fps')m.fps='1/1';if(fault==='count')m.frames.pop();if(fault==='sample-origin')m.audio.startSample=0;
      if(fault==='audio-hash')m.audio.sha256='0'.repeat(64);if(fault==='audio-none')m.preview.audio='none';
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(m));
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const bridge=spawn(process.execPath,['src/mcp.mjs'],{env:{...process.env,SHUTTER_URL:`http://127.0.0.1:${server.address().port}`},windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>{bridge.kill();server.closeAllConnections();server.close();});let sequence=0;const pending=new Map();
  createInterface({input:bridge.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('mcp_timeout')),5000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'review-test',version:'1'}});
  const tool=(await rpc('tools/list')).result.tools.find(t=>t.name==='shutter_review_scene');assert.equal(tool.annotations.idempotentHint,true);assert.equal(tool.annotations.openWorldHint,false);
  const call=extra=>rpc('tools/call',{name:'shutter_review_scene',arguments:{projectId:'p',baseRevision:2,startFrame:24,endFrame:48,frameCount:4,...extra}});
  const full=(await call({includeAudio:true})).result;assert.equal(full.isError,undefined);assert.equal(full.content.filter(b=>b.type==='image').length,4);assert.equal(full.content.filter(b=>b.type==='audio').length,1);
  const before=mediaRequests;assert.equal((await call({includeImages:false})).result.content.length,1);assert.equal(mediaRequests,before);
  for(const mode of ['revision','scene-time','order','phase','frame-route','audio-route','wave-route','duration','fps','count','sample-origin','audio-none']){
    fault=mode;const r=(await call({includeImages:false})).result;assert.equal(r.isError,true,mode);assert.equal(r.structuredContent.error,'scene_review_manifest_invalid',mode);assert.equal(mediaRequests,before);
  }
  for(const [mode,error] of [['audio-hash','evidence_frame_integrity'],['audio-mime','evidence_frame_invalid'],['audio-large','evidence_frame_too_large'],['audio-bytes','evidence_audio_invalid']]){
    fault=mode;const r=(await call({includeImages:false,includeAudio:true})).result;assert.equal(r.isError,true,mode);assert.equal(r.structuredContent.error,error,mode);assert.equal(r.content.some(b=>b.type==='audio'),false);
  }
  fault='redirect';assert.equal((await call({includeImages:false,includeAudio:true})).result.isError,true);assert.equal(requested.includes('/api/state'),false);
});
