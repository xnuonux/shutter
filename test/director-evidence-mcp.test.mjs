import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

test('MCP evidence enforces exact local images, request binding, bounded bytes and recoverable errors',async t=>{
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==','base64'),sha256=createHash('sha256').update(jpeg).digest('hex'),eid='evidence_'+'e'.repeat(64);
  let fault=null,imageRequests=0;const requests=[];
  const manifest=()=>({schema:'shutter-cutaway-evidence-v1',id:eid,projectId:'p',baseRevision:1,previewHash:'a'.repeat(64),coverageId:'cov',
    frames:['entry-main','entry-alternate','return-alternate','return-main'].map((role,index)=>({index,role,sceneFrame:index<2?0:23,sourceStart:'0/1',assetId:'asset_'+ 'a'.repeat(64),clipId:'cov',layer:'coverage',fit:'contain',url:`/api/media/productions/p/actions/evidence/${eid}/frames/${index}`,width:1,height:1,sha256}))});
  const server=createServer((req,res)=>{
    requests.push(req.url);
    if(req.url.includes('/frames/')){imageRequests++;if(fault==='redirect'){res.writeHead(302,{location:'http://example.invalid/'});return res.end();}res.writeHead(200,{'content-type':'image/jpeg'});return res.end(fault==='oversize'?Buffer.alloc(256*1024+1):fault==='bytes'?Buffer.from('not a jpeg'):jpeg);}
    let body='';req.on('data',b=>body+=b);req.on('end',()=>{
      const input=JSON.parse(body);assert.equal(req.url,'/api/media/productions/p/actions/evidence');
      if(Object.keys(input).some(k=>!['version','baseRevision','commands','previewHash','coverageId'].includes(k))){res.writeHead(400,{'content-type':'application/json'});return res.end('{"error":"extra_field"}');}
      const value=manifest();
      if(fault==='project')value.projectId='other';if(fault==='version')value.schema='future';if(fault==='route')value.frames[0].url='/api/state';if(fault==='hash')value.frames[0].sha256='0'.repeat(64);if(fault==='count')value.frames=[...value.frames,...value.frames];
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));
    });
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const bridge=spawn(process.execPath,['src/mcp.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,SHUTTER_URL:`http://127.0.0.1:${server.address().port}`},windowsHide:true,stdio:['pipe','pipe','pipe']});
  t.after(()=>{bridge.kill();server.closeAllConnections();server.close();});
  let sequence=0;const pending=new Map();createInterface({input:bridge.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>reject(Error('mcp_timeout')),5000);pending.set(id,m=>{clearTimeout(timer);resolve(m);});bridge.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
  const listed=await rpc('tools/list'),tool=listed.result.tools.find(t=>t.name==='shutter_inspect_cutaway');assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.annotations.idempotentHint,true);assert.equal(tool.annotations.openWorldHint,false);
  const args={projectId:'p',version:'shutter-actions-v1',baseRevision:1,commands:[{type:'coverage-add',coverage:{id:'cov',assetId:'asset_'+ 'a'.repeat(64),sourceStart:'0',at:0,frames:24,fit:'contain'}}],previewHash:'a'.repeat(64),coverageId:'cov'};
  const call=extra=>rpc('tools/call',{name:'shutter_inspect_cutaway',arguments:{...args,...extra}});
  const full=(await call()).result;assert.equal(full.isError,undefined);assert.equal(full.structuredContent.id,eid);assert.equal(full.content.filter(b=>b.type==='image').length,4);assert.match(full.content[1].text,/entry-main.*scene frame 0/);assert.deepEqual(Buffer.from(full.content[2].data,'base64'),jpeg);
  const count=imageRequests,only=(await call({includeImages:false})).result;assert.equal(only.content.length,1);assert.equal(imageRequests,count);
  for(const [mode,error] of [['project','evidence_manifest_invalid'],['version','evidence_manifest_invalid'],['route','evidence_manifest_invalid'],['count','evidence_manifest_invalid'],['hash','evidence_frame_integrity'],['oversize','evidence_frame_too_large'],['bytes','evidence_frame_invalid']]){
    fault=mode;const result=(await call()).result;assert.equal(result.isError,true,mode);assert.equal(result.structuredContent.error,error,mode);assert.equal(result.content.some(b=>b.type==='image'),false);
  }
  fault='route';assert.equal((await call({includeImages:false})).result.isError,true);assert.equal(requests.includes('/api/state'),false);
  fault='redirect';assert.equal((await call()).result.isError,true);
});
