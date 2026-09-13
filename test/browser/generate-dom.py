"""Isolated Generate UI checks. Fake state/API; no provider, server, billing or playback qualification."""
from pathlib import Path
import json,re,hashlib,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
source=(ROOT/'public'/'generate-room.js').read_text();css=(ROOT/'public'/'generate-room.css').read_text()
report={'scope':'actual GenerateRoom source against fake timeline/API; all media/provider networking stubbed','checks':[],'errors':[],'source_sha256':hashlib.sha256(source.encode()).hexdigest()}
asset_a='asset_a';asset_b='asset_b';project='prod_demo'
timeline={'revision':7,'timeline':{'format':'shutter-media-edit-v1','fps':'24','width':1920,'height':1080,'clips':[{'id':'a','assetId':asset_a,'sourceStart':'0/1','frames':48,'fit':'cover'},{'id':'b','assetId':asset_b,'sourceStart':'0/1','frames':72,'fit':'contain'}]},'plan':{'clips':[{'id':'a','assetId':asset_a,'sourceKind':'video','frames':48},{'id':'b','assetId':asset_b,'sourceKind':'video','frames':72}]}}
state={'assets':[{'id':asset_a,'name':'Camera A.mp4','kind':'video'},{'id':asset_b,'name':'Camera B.mp4','kind':'video'}]}
planned={'id':'insert_'+'1'*64,'revision':1,'state':'planned','timelineRevision':7,'current':True,'request':{'clipId':'a','kind':'new-angle','prompt':'new adjacent angle','duration':5,'resolution':'480P','quality':'balanced'},'renderProfile':{'tier':'draft'},'references':[{'assetId':'ref_image','kind':'image','role':'appearance-state','authority':'appearance-state','sourceClipId':'a'},{'assetId':'ref_video','kind':'video','role':'motion-time','authority':'motion-time','sourceClipId':'a','audioIncluded':False}],'disclosure':{'leavesDeviceOnSubmission':['prompt','1 derived PNG reference image','1 derived motion reference video'],'staysLocal':['camera originals','master soundtrack'],'submissionState':'not-submitted'},'spending':{'hardLimitUsd':.5}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 page=browser.new_page(viewport={'width':1200,'height':1000});page.set_default_timeout(2000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.set_content(f'''<body><select id="projects"><option value="{project}" selected>Demo</option></select><span id="revision">SAVED REVISION 7</span><button id="save">Save cut</button><form id="new-project"></form><section id="memory-room"><details><select id="memory-shot"><option value="a">A</option></select><button id="memory-load-stack"></button></details></section><div id="text-form-status"></div><section id="generate-room"></section></body>''')
 page.add_style_tag(content=':root{--line:#393944;--muted:#999;--ink:#eee}.secondary{} .tag{} .small{} .notice{} .check{}'+css)
 page.evaluate('''({timeline,state,planned})=>{
 window.__fixture={timeline,state,planned:structuredClone(planned),inserts:[],calls:[]};
 window.confirm=()=>true;window.crypto.randomUUID=()=> 'fixture-key';
 window.fetch=async(url,opt={})=>{__fixture.calls.push({url,method:opt.method||'GET',body:opt.body?JSON.parse(opt.body):null});let data;
 if(url==='/api/media/state')data=__fixture.state;
 else if(url==='/api/media/productions/prod_demo/timeline')data=__fixture.timeline;
 else if(url.startsWith('/api/media/productions/prod_demo/inserts?'))data={results:__fixture.inserts};
 else if(url==='/api/media/productions/prod_demo/inserts'&&opt.method==='POST'){data=structuredClone(__fixture.planned);__fixture.inserts=[data];}
 else if(url.endsWith('/quote')){data={...__fixture.inserts[0],revision:2,state:'quoted',quote:{outputUsd:.25,referenceInputUsd:.08,estimatedUsd:.33,reservedUsd:.34,variableReferenceCost:true},spending:{hardLimitUsd:.5,authorized:false}};__fixture.inserts=[data];}
 else if(url.endsWith('/submit')){data={...__fixture.inserts[0],revision:3,state:'rendering',providerId:'provider_receipt'};__fixture.inserts=[data];}
 else if(url.endsWith('/reconcile')){data={...__fixture.inserts[0],revision:4,state:'ready-insert',outputAssetId:'generated_asset',providerEvidence:{expandedPrompt:'ONE NEW adjacent shot. No internal cuts. non_diegetic_music: N/A',estimatedUsd:.33,reservedUsd:.34,actualUsd:.35506,billableUnits:7.1012,requestId:'provider_receipt',visualContinuityStatus:'unreviewed'},audioHandling:{policy:'isolated-never-auto-mix',generatedAudioStreams:1,masterChanged:false}};__fixture.inserts=[data];}
 else if(url.includes('/inserts/')&&(!opt.method||opt.method==='GET'))data=__fixture.inserts[0];
 else throw Error('unexpected '+url);
 return {ok:true,status:200,json:async()=>structuredClone(data)};};
 }''',{'timeline':timeline,'state':state,'planned':planned})
 code="(function(){"+source.replace('export class GenerateRoom','class GenerateRoom').replace("if(root){const room=new GenerateRoom(root);window.__shutterGenerateRoom=room;if(sessionStorage.getItem('shutter-generate-open')){sessionStorage.removeItem('shutter-generate-open');root.querySelector('details').open=true;}room.sync().catch(()=>{});}", "window.__GenerateRoom=GenerateRoom;")+"})()"
 page.evaluate(code);page.evaluate("window.__shutterGenerateRoom=Reflect.construct(window.__GenerateRoom,[document.querySelector('#generate-room')]); document.querySelector('#generate-room details').open=true;")
 page.evaluate("window.__shutterGenerateRoom.sync()")
 page.locator('#generate-room > details.generate-room').evaluate('(d)=>d.open=true');page.wait_for_timeout(20)
 def check(name,expr):assert page.evaluate(expr),name;report['checks'].append(name)
 check('Faithful and Draft are defaults',"document.querySelector('#generate-quality').value==='balanced'&&document.querySelector('#generate-resolution').value==='480P'")
 page.locator('input[name="generate-intent"][value="new-angle"]').check(force=True);page.wait_for_timeout(10)
 check('New Angle disables unqualified 1080P finish',"document.querySelector('#generate-resolution option[value=\"1080P\"]').disabled")
 page.fill('#generate-prompt','new adjacent angle');page.check('#generate-color');page.click('#generate-plan');page.wait_for_timeout(20)
 check('Plan is local and reveals still plus visual tail',"__fixture.calls.some(c=>c.url==='/api/media/productions/prod_demo/inserts'&&c.method==='POST')&&document.querySelectorAll('.generate-refs figure').length===2&&document.querySelector('#generate-lifecycle').textContent.includes('motion reference video')")
 check('Plan has no submit button before quote',"!document.querySelector('#generate-submit')")
 page.click('#generate-quote');page.wait_for_timeout(10)
 check('Quote separates variable reference reserve',"document.querySelector('.generate-quote').textContent.includes('Reference reserve')&&document.querySelector('#generate-submit')")
 page.click('#generate-submit');page.wait_for_timeout(10)
 check('Unchecked authorization blocks provider submit',"!__fixture.calls.some(c=>c.url.endsWith('/submit'))&&document.querySelector('#generate-help').textContent.includes('Confirm the exact quote')")
 page.check('#generate-authorize');page.click('#generate-submit');page.wait_for_timeout(10)
 check('Explicit authorization submits once',"__fixture.calls.filter(c=>c.url.endsWith('/submit')).length===1&&document.querySelector('#generate-lifecycle').textContent.includes('rendering')")
 page.click('#generate-reconcile');page.wait_for_timeout(10)
 check('Returned media keeps provider expansion distinct and audio isolated',"document.querySelector('.generate-result video')&&document.querySelector('.generate-evidence').textContent.includes('not independent continuity proof')&&document.querySelector('#generate-lifecycle').textContent.includes('audio is isolated')")
 check('Ready insert requires separate visual review before Apply',"document.querySelector('#generate-reviewed')&&document.querySelector('#generate-apply')")
 page.set_viewport_size({'width':390,'height':844});check('Generate panel stays in mobile viewport',"document.documentElement.scrollWidth<=innerWidth+1")
 check('No uncaught component exceptions','true' if not report['errors'] else 'false');browser.close()
report['passed']=len(report['checks']);(OUT/'generate-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
