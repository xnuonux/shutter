"""Color Prep isolated DOM checks with actual modules, a fake API, and aborted networking.
Not a browser playback, real-device display, or full-server E2E qualification.
"""
from pathlib import Path
import json,re,hashlib,os,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
source={f:(ROOT/'public'/f).read_text() for f in ['color-contract.mjs','color-room.js','color-room.css','media-studio.css']}
report={'scope':'isolated actual ColorRoom UI; fake API; network aborted; no media playback','checks':[],'errors':[], 'source_sha256':{f:hashlib.sha256(s.encode()).hexdigest() for f,s in source.items()}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=browser.new_context(viewport={'width':1000,'height':1150});context.route('**/*',lambda r:r.abort());page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.set_content('<main style="max-width:860px;margin:24px auto;padding:0 16px"><p class="eyebrow">SHUTTER / SYNTHETIC UI FIXTURE</p><h1>Prepare the picture. Keep the original.</h1><div id="color"></div><p id="status"></p></main>')
 page.add_style_tag(content=source['media-studio.css']+'\n'+source['color-room.css']+'\n#status{position:static;margin-top:18px}')
 code=source['color-contract.mjs'];exports=re.findall(r'export (?:function|class|const) (\w+)',code);page.evaluate('window.Contract=(()=>{'+code.replace('export ','')+';return {'+','.join(exports)+'}})()')
 code=re.sub(r"import \{([^}]+)\} from './color-contract.mjs';",r'const {\1}=window.Contract;',source['color-room.js']).replace('export ','');page.evaluate('()=>{window.Room=(()=>{'+code+';return ColorRoom})()}')
 page.evaluate('''()=>{
 window.calls=[];window.messages=[];window.ready=[];window.originals=[];window.failProxy=false;
 window.sourceAsset={id:'asset_'+'1'.repeat(64),name:'Camera fixture.mp4',kind:'video',media:{color:{transfer:'bt709',primaries:'bt709',range:'tv'}}};
 window.state={colorLuts:[{id:'lut_'+'2'.repeat(64),name:'My conversion LUT',size:33,inputEncoding:'custom-log'},{id:'lut_'+'3'.repeat(64),name:'Creative look',size:17,inputEncoding:'rec709'}],derivations:[]};
 window.cut={revision:9,clips:['original-shot']};window.beforeCut=JSON.stringify(cut);
 window.room=new Room({getState:()=>state,notify:t=>{messages.push(t);document.querySelector('#status').textContent=t},refresh:async()=>{},onReady:async id=>ready.push(id),onSelect:async id=>originals.push(id),action:async fn=>{try{await fn()}catch(e){messages.push(e.message)}},api:async(url,options)=>{
 calls.push({url,options});const body=options.body instanceof File?null:JSON.parse(options.body);
 if(url.endsWith('/color-preview')){const result={id:'color_preview_00000000-0000-0000-0000-000000000001',sourceAssetId:sourceAsset.id,frame:body.frame==='last'?23:body.frame,beforeAssetId:'before',afterAssetId:'after',recipe:{settings:body.settings}};if(window.holdPreview)return new Promise(resolve=>window.releasePreview=()=>resolve(result));return result;}
 if(url.endsWith('/color-prepare'))return {asset:{id:'prepared-asset'}};
 if(url.endsWith('/proxy')){if(failProxy)throw Error('fixture_proxy_failure');return {id:'proxy-asset'};}
 if(url.startsWith('/api/media/color/luts')){const lut={id:'lut_'+'4'.repeat(64),name:'Imported.cube',size:2,inputEncoding:room.input.inputEncoding};state.colorLuts.push(lut);return lut;}
 throw Error('unexpected_url');}});
 room.attach(document.querySelector('#color'),sourceAsset);
 }''')
 def check(name,expr):
  assert page.evaluate(expr),name;report['checks'].append(name)
 def set_select(key,value): page.select_option('[data-color="'+key+'"]',value)
 check('attach does not guess input encoding or range','room.input.inputEncoding===""&&room.input.inputRange===""&&calls.length===0')
 check('LUT upload and prepare start disabled','document.querySelector("[data-color-lut]").disabled&&document.querySelector("[data-color-prepare]").disabled')
 page.click('[data-color-preview]');check('invalid unreviewed input causes no API request','calls.length===0&&messages.includes("color_input_encoding")')
 set_select('inputEncoding','custom-log');set_select('inputRange','limited');page.fill('[data-color="description"]','Synthetic log declaration');page.locator('[data-color="description"]').blur();page.check('[data-color="reviewed"]')
 check('matching-LUT chooser excludes creative SDR-only LUT','document.querySelector("[data-color=lutId]").options.length===2')
 page.click('[data-color-preview]');check('log input without conversion LUT is rejected','calls.length===0&&messages.includes("color_conversion_lut_required")')
 set_select('lutId','lut_'+'2'*64);page.click('[data-color-last]');check('last-frame preview sends explicit source and canonical settings','calls[0].url.includes(sourceAsset.id)&&JSON.parse(calls[0].options.body).frame==="last"&&room.preview.frame===23')
 check('matching reviewed preview enables prepare','!document.querySelector("[data-color-prepare]").disabled')
 # Temporarily show the actual recorded synthetic recipe for the screenshots.
 page.evaluate('window.screenshotSaved={asset:room.asset,input:room.input,preview:room.preview}')
 if (OUT/'color-demo.json').exists():
  page.evaluate('demo=>{state.colorLuts.push(demo.lut);room.asset={...sourceAsset,id:demo.preview.sourceAssetId};room.input=demo.preview.recipe.settings;room.preview=demo.preview;room.render()}',json.loads((OUT/'color-demo.json').read_text()))
 # Actual locally rendered test-pattern PNGs are embedded only for the screenshot fixture.
 if (OUT/'color-demo-before.png').exists() and (OUT/'color-demo-after.png').exists():
  page.evaluate('images=>document.querySelectorAll(".color-comparison img").forEach((img,i)=>img.src=images[i])',['data:image/png;base64,'+base64.b64encode((OUT/name).read_bytes()).decode() for name in ['color-demo-before.png','color-demo-after.png']])
 page.set_viewport_size({'width':390,'height':844});check('mobile inspector avoids horizontal overflow','document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'color-prep-dom-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1000,'height':1150});page.screenshot(path=str(OUT/'color-prep-dom-desktop.png'),full_page=True)
 page.evaluate('Object.assign(room,screenshotSaved);room.render()')
 set_select('inputRange','full');check('changing settings visibly invalidates prepare','document.querySelector("[data-color-prepare]").disabled&&document.querySelector(".color-stale")!==null')
 page.click('[data-color-preview]');page.click('[data-color-prepare]');check('build uses saved preview and creates viewing copy after editing copy','calls.at(-2).url.endsWith("/color-prepare")&&calls.at(-1).url==="/api/media/assets/prepared-asset/proxy"&&ready.at(-1)==="prepared-asset"')
 check('color workflow never edits the cut','JSON.stringify(cut)===beforeCut&&calls.every(c=>!c.url.includes("/timeline"))')
 page.evaluate('failProxy=true');page.click('[data-color-prepare]');check('failed optional proxy retains prepared editing copy and explains recovery','ready.length===2&&messages.at(-1).includes("retained")')
 page.evaluate('room.attach(document.querySelector("#color"),sourceAsset)');set_select('inputEncoding','rec709');set_select('inputRange','limited');page.check('[data-color="reviewed"]');page.evaluate('holdPreview=true');page.click('[data-color-preview]');page.wait_for_function('typeof releasePreview==="function"')
 page.evaluate('room.attach(document.querySelector("#color"),{...sourceAsset,id:"another-source"});releasePreview()');page.wait_for_timeout(20)
 check('late preview cannot attach itself to a newly selected source','room.asset.id==="another-source"&&room.preview===null')
 page.evaluate('''()=>{state.derivations=[{outputAssetId:'prepared',recipe:{operation:'color-preparation',sourceAssetId:sourceAsset.id}}];room.attach(document.querySelector('#color'),{...sourceAsset,id:'prepared',media:{color:{transfer:'bt709',primaries:'bt709',space:'bt709',range:null},colorPreparation:{schema:Contract.COLOR_VERSION,range:'limited'}}});}''')
 check('prepared asset blocks a second conversion UI','!document.querySelector("[data-color-preview]")&&document.body.textContent.includes("second input LUT is blocked")')
 page.click('[data-color-original]');check('original-link returns exact source identity','originals[0]===sourceAsset.id')
 page.evaluate('room.attach(document.querySelector("#color"),{...sourceAsset,media:{color:{transfer:"<img id=attack src=x onerror=window.attacked=true>"}}})')
 check('metadata text is escaped, not executable','!window.attacked&&!document.querySelector("#attack")&&document.body.textContent.includes("<img")')
 page.evaluate('room.attach(document.querySelector("#color"),{kind:"audio"})');check('audio does not expose irrelevant color processing','document.querySelector("#color").children.length===0')
 check('no uncaught UI exceptions','true' if not report['errors'] else 'false');browser.close()
report['passed']=len(report['checks']);(OUT/'color-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
