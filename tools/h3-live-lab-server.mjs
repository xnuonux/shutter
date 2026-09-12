import http from 'node:http';

const key=process.env.FAL_API_KEY;
const token=process.env.SHUTTER_H3_LAB_TOKEN;
const port=Number(process.env.PORT||3000);
const budget=Number(process.env.SHUTTER_H3_LAB_BUDGET_USD||4);
if(!key||!token) throw Error('lab_missing_secret');

const queueBase='https://queue.fal.run/';
const pricingBase='https://api.fal.ai/v1/models/pricing';
const exampleImage='https://storage.googleapis.com/falserverless/example_inputs/hailuo23/pro_i2v_in.jpg';
const exampleEnd='https://storage.googleapis.com/falserverless/example_inputs/interpolate-end-frame.png';
const state={started:false,done:false,phase:'idle',startedAt:null,finishedAt:null,error:null,tests:[],prices:{},estimatedUsd:0,actualUsd:0,budget};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const rounded=n=>Math.round(n*1e6)/1e6;
function safeTest(t){return {name:t.name,endpoint:t.endpoint,state:t.state,estimatedUsd:t.estimatedUsd??null,actualUsd:t.actualUsd??null,requestId:t.requestId??null,video:t.video??null,expandedPrompt:t.expandedPrompt??null,seed:t.seed??null,timings:t.timings??null,error:t.error??null};}
function snapshot(){return {...state,tests:state.tests.map(safeTest)};}
async function fal(url,options={}){
  const r=await fetch(url,{...options,headers:{Authorization:'Key '+key,'content-type':'application/json',...(options.headers||{})},redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!r.ok) throw Error(`fal_http_${r.status}:${(await r.text()).slice(0,500)}`);
  return r;
}
async function livePrice(endpoint){
  if(state.prices[endpoint]) return state.prices[endpoint];
  const r=await fal(pricingBase+'?endpoint_id='+encodeURIComponent(endpoint));
  const data=await r.json();
  const row=(data.prices||[]).find(x=>x.endpoint_id===endpoint);
  if(!row||row.currency!=='USD') throw Error('fal_price_missing:'+endpoint);
  state.prices[endpoint]=row;
  return row;
}
async function quote(name,endpoint,input,ceiling){
  const row=await livePrice(endpoint);
  const unit=Number(row.unit_price||0);
  if(!Number.isFinite(unit)||unit<=0) throw Error('fal_price_invalid:'+endpoint);
  const resolutionMultiplier=input.resolution==='1080P'?3.2:input.resolution==='768P'?1.6:1;
  const estimated=rounded(unit*Number(input.duration||5)*resolutionMultiplier);
  if(estimated>ceiling) throw Error(`lab_quote_ceiling:${name}:${estimated}`);
  if(state.estimatedUsd+estimated>budget) throw Error('lab_budget_exceeded');
  state.estimatedUsd=rounded(state.estimatedUsd+estimated);
  return {row,estimated};
}
async function runOne(spec){
  const test={name:spec.name,endpoint:spec.endpoint,state:'quoting'};state.tests.push(test);
  try{
    const {row,estimated}=await quote(spec.name,spec.endpoint,spec.input,spec.ceiling);
    test.estimatedUsd=estimated;test.state='submitting';
    const submit=await fal(queueBase+spec.endpoint,{method:'POST',body:JSON.stringify(spec.input)});
    const receipt=await submit.json();
    if(!receipt.request_id||!receipt.status_url||!receipt.response_url) throw Error('fal_receipt_invalid');
    test.requestId=receipt.request_id;test.state='rendering';
    for(let i=0;i<180;i++){
      await sleep(4000);
      const sr=await fal(receipt.status_url);const status=await sr.json();
      if(['FAILED','CANCELLED'].includes(status.status)) throw Error('provider_'+status.status.toLowerCase());
      if(status.status!=='COMPLETED') continue;
      test.state='fetching';
      const rr=await fal(receipt.response_url);const unitsHeader=rr.headers.get('x-fal-billable-units');const result=await rr.json();
      const units=unitsHeader===null?null:Number(unitsHeader);
      const actual=Number.isFinite(units)?rounded(units*Number(row.unit_price)):estimated;
      test.actualUsd=actual;state.actualUsd=rounded(state.actualUsd+actual);
      if(state.actualUsd>budget+1e-9) throw Error('lab_actual_budget_exceeded');
      test.video=result.video?.url||result.data?.video?.url||null;
      test.expandedPrompt=result.expanded_prompt??result.data?.expanded_prompt??null;
      test.seed=result.seed??result.data?.seed??null;
      test.timings=result.timings??result.data?.timings??null;
      test.state='ready';return;
    }
    throw Error('provider_timeout');
  }catch(e){test.state='failed';test.error=e.message;throw e;}
}
async function runBatch(){
  state.started=true;state.phase='running';state.startedAt=new Date().toISOString();
  const common={duration:5,resolution:'480P',prompt_expansion_mode:'quality',enable_safety_checker:true,sync_mode:false};
  const matrix=[
    {name:'i2v-start',endpoint:'minimax/h3-max/image-to-video',ceiling:.2,input:{...common,image_url:exampleImage,prompt:'Preserve the subject and exact opening composition. Slow cinematic push in with natural environmental motion. Keep identity, clothing, object count, lighting direction and spatial layout coherent. No cuts, no subtitles, no text.'}},
    {name:'i2v-start-end-bridge',endpoint:'minimax/h3-max/image-to-video',ceiling:.2,input:{...common,image_url:exampleImage,end_image_url:exampleEnd,prompt:'Create one continuous cinematic movement from the supplied opening frame to the supplied ending frame. Respect both boundary compositions exactly enough for editorial use, avoid abrupt cuts, duplicate subjects or props, and arrive naturally at the ending frame. No text.'}},
    {name:'i2v-end-only',endpoint:'minimax/h3-max/image-to-video',ceiling:.2,input:{...common,end_image_url:exampleImage,prompt:'Begin in a plausible wider view of the same world and move naturally toward the supplied final frame. Preserve subject identity and scene logic. The last moment should settle into the supplied ending composition. No cuts or text.'}},
    {name:'camera-controls',endpoint:'minimax/h3-max/camera-controls',ceiling:.3,input:{...common,image_url:exampleImage,prompt:'Preserve the subject and scene while executing only the specified camera move.',camera_trajectory:[{time:0,elevation:0,azimuth:0,distance:1},{time:.55,elevation:8,azimuth:35,distance:.8},{time:1,elevation:0,azimuth:70,distance:1}]}},
    {name:'ref2v-state',endpoint:'minimax/h3-max/reference-to-video',ceiling:1,input:{...common,aspect_ratio:'adaptive',reference_image_urls:[exampleImage],prompt:'Image 1 controls the subject identity, clothing, materials and overall visual language. Render a clearly different camera angle in a compatible environment while preserving those traits. The subject performs one simple natural turn and remains visually consistent. No text.'}}
  ];
  try{
    for(const spec of matrix){state.phase=spec.name;await runOne(spec);}
    state.phase='complete';state.done=true;state.finishedAt=new Date().toISOString();
  }catch(e){state.error=e.message;state.phase='stopped-on-failure';state.done=true;state.finishedAt=new Date().toISOString();}
}
function auth(req){const u=new URL(req.url,'http://lab');return u.searchParams.get('token')===token?u:null;}
const server=http.createServer(async(req,res)=>{
  const u=auth(req);if(!u){res.writeHead(403,{'content-type':'application/json'});return res.end(JSON.stringify({error:'forbidden'}));}
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  try{
    if(u.pathname==='/smoke'){
      const endpoints=['minimax/h3-max/image-to-video','minimax/h3-max/camera-controls','minimax/h3-max/reference-to-video'];
      for(const ep of endpoints) await livePrice(ep);
      return res.end(JSON.stringify({ok:true,hasKey:true,budget,prices:state.prices}));
    }
    if(u.pathname==='/run'){
      if(!state.started) runBatch();
      res.statusCode=202;return res.end(JSON.stringify(snapshot()));
    }
    if(u.pathname==='/status') return res.end(JSON.stringify(snapshot()));
    if(u.pathname==='/stop'){res.end(JSON.stringify({ok:true,state:snapshot()}));setTimeout(()=>server.close(()=>process.exit(0)),50);return;}
    res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
});
server.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({type:'h3-lab-ready',port,budget})));
