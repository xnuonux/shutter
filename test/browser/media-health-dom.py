"""Actual recovery UI module, synthetic API and data, all networking aborted."""
from pathlib import Path
import re,json,hashlib,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
source={n:(ROOT/'public'/n).read_text() for n in ['media-health-room.js','media-health-room.css','media-studio.css']}
report={'scope':'Actual component modules with synthetic records and fake API, no server/browser playback certification. Networking aborted.','checks':[],'errors':[],'sha256':{n:hashlib.sha256(s.encode()).hexdigest() for n,s in source.items()}}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=b.new_context(viewport={'width':980,'height':940});context.route('**/*',lambda route:route.abort());page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.set_content('<main style="max-width:760px;margin:24px auto"><p class="eyebrow">SHUTTER · SOURCE RECOVERY</p><h1>Keep the cut.<br>Recover the original.</h1><p class="small">Synthetic interface fixture. Missing files are restored only when their bytes match; no take is substituted.</p><div class="panel"><div id="health"></div></div><div id="legacy"></div><p id="message" class="small"></p></main>')
 page.add_style_tag(content=source['media-studio.css']+'\n'+source['media-health-room.css'])
 page.evaluate('()=>{window.MediaHealthRoom=(()=>{'+source['media-health-room.js'].replace('export ','')+';return MediaHealthRoom})()}')
 page.evaluate('''()=>{
 window.messages=[];window.calls=[];window.project='demo';window.record=null;window.dirty=false;window.pending=false;window.busy=false;window.refreshes=0;
 window.fixture={schema:'shutter-media-health-v1',id:'report1',projectId:'demo',revision:4,completedAt:'2026-09-11T00:00:00Z',complete:true,allVerified:false,counts:{verified:1,missing:1,changed:1,unassessed:0},assets:[
 {assetId:'asset_'+'a'.repeat(64),name:'FX30 performance.mp4',status:'verified',reason:'sha256-match',roles:['picture 1','picture 3'],restoreEligible:false},
 {assetId:'asset_'+'b'.repeat(64),name:'Final song master.wav',status:'missing',reason:'file-missing',roles:['master song'],expectedBytes:4,recordKey:'reviewed-key',restoreEligible:true},
 {assetId:'asset_'+'c'.repeat(64),name:'Camera sound.wav',status:'changed',reason:'hash-mismatch',roles:['sound: Ambience'],restoreEligible:false}]};
 window.room=new MediaHealthRoom({root:document.querySelector('#health'),getProject:()=>project,getRecord:()=>record,isDirty:()=>dirty,hasPending:()=>pending,isBusy:()=>busy,
 api:async(url,options)=>{calls.push({url,options});if(window.failNext){failNext=false;throw Error('fixture request failed');}if(url.includes('/restore?'))return {status:'restored'};if(window.hold)return new Promise(resolve=>window.release=()=>resolve(structuredClone(fixture)));return structuredClone(fixture);},
 action:async fn=>{try{await fn()}catch(e){messages.push(e.message);document.querySelector('#message').textContent=e.message}},notify:m=>{messages.push(m);document.querySelector('#message').textContent=m},afterRestore:async()=>{refreshes++;}});
 document.querySelector('details').open=true;
 }''')
 def check(name,expression):
  assert page.evaluate(expression),name;report['checks'].append(name)
 check('scan disabled without a saved production','document.querySelector("#media-check").disabled')
 page.evaluate('record={revision:4,timeline:{clips:[]}};room.update();dirty=true');page.click('#media-check')
 check('unfinished draft cannot be passed off as scanned','calls.length===0&&messages.at(-1).includes("Save or discard")')
 page.evaluate('dirty=false;pending=true');page.click('#media-check');check('unfinished text form blocks scan','calls.length===0')
 page.evaluate('pending=false');page.click('#media-check');page.wait_for_function('room.report!==null')
 check('saved revision is sent explicitly','JSON.parse(calls[0].options.body).baseRevision===4')
 check('counts distinguish verified missing and changed','document.querySelector("#media-check-results").textContent.includes("1 verified · 1 missing · 1 changed")')
 check('only missing original gets a restore picker','document.querySelectorAll("#media-check-results input[type=file]").length===1')
 check('changed file is protected, not offered automatic overwrite','document.querySelectorAll(".media-health-asset")[2].textContent.includes("not overwritten")')
 page.set_input_files('input[type=file]',{'name':'different.wav','mimeType':'audio/wav','buffer':b'123'})
 check('wrong byte length blocks upload','document.querySelector(".media-health-asset button").disabled')
 page.set_input_files('input[type=file]',{'name':'renamed-original.wav','mimeType':'audio/wav','buffer':b'1234'})
 check('renaming does not disqualify a candidate','!document.querySelector(".media-health-asset button").disabled&&document.querySelector("#media-check-results").textContent.includes("Full checksum must match")')
 page.click('.media-health-asset button');page.wait_for_function('refreshes===1')
 check('restore sends exact asset identity and reviewed record key','calls.at(-1).url.includes("/assets/asset_"+"b".repeat(64)+"/restore?recordKey=reviewed-key")')
 check('restoration invalidates old health evidence and refreshes viewers','document.querySelector("#media-check-scope").textContent.includes("HISTORICAL")&&document.querySelectorAll("input[type=file]").length===0')
 page.click('#media-check');page.wait_for_function('!room.restored')
 page.evaluate('record.revision=5;room.update()');check('new saved revision makes previous report historical','document.querySelector("#media-check-scope").textContent.includes("HISTORICAL")')
 page.evaluate('record.revision=4;room.update();failNext=true');page.click('#media-check')
 check('failed recheck cannot leave old evidence displayed as current','room.historical()&&document.querySelector("#media-check-scope").textContent.includes("HISTORICAL")')
 page.evaluate('hold=true');page.click('#media-check');page.wait_for_function('typeof release==="function"')
 page.evaluate('project="other";room.update();release()');page.wait_for_timeout(10)
 check('late report cannot attach to a different production','room.report===null&&document.querySelector("#media-check-results").children.length===0')
 page.evaluate('hold=false;project="demo";fixture.complete=false;fixture.counts.unassessed=1;room.update()');page.click('#media-check')
 page.wait_for_function('room.report!==null');check('incomplete scan clearly refuses all-clear','document.querySelector("#media-check-scope").textContent.includes("not an all-clear")')
 page.evaluate('fixture.assets[0].name="<img id=attack src=x onerror=window.attacked=true>"');page.click('#media-check')
 check('asset names cannot create HTML','!window.attacked&&!document.querySelector("#attack")&&document.querySelector("#media-check-results").textContent.includes("<img")')
 page.evaluate('document.querySelector("#legacy").replaceChildren();fixture.assets[0].name="FX30 performance.mp4";fixture.complete=true;fixture.counts.unassessed=0;room.report=structuredClone(fixture);room.restored=false;room.update();document.querySelector("#message").textContent="Synthetic UI fixture · file verification and restoration are exercised separately with real local files."')
 page.set_viewport_size({'width':390,'height':844});check('recovery panel remains inside mobile viewport','document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'media-recovery-dom-mobile.png'),full_page=True)
 page.set_viewport_size({'width':980,'height':940});page.screenshot(path=str(OUT/'media-recovery-dom-desktop.png'),full_page=True)
 check('no uncaught component exceptions','true' if not report['errors'] else 'false');b.close()
report['passed']=len(report['checks']);(OUT/'media-health-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
