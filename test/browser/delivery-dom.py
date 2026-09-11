"""Isolated Delivery Check DOM fixtures. No network, real media, playback or server E2E.
Uses actual module bodies in an empty Chromium document; all requests are aborted.
Optional TEST-ONLY dependencies: Python Playwright and a local Chromium executable.
"""
from pathlib import Path
import hashlib, json, os, re
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'verification'; OUT.mkdir(exist_ok=True)
files = ['delivery-contract.mjs','delivery-room.js','delivery-room.css','media-studio.css']
source = {name: (ROOT/'public'/name).read_text() for name in files}
report = {'scope': 'Isolated actual UI modules with fake API and controlled video properties; not real playback',
          'source_sha256': {name:hashlib.sha256(text.encode()).hexdigest() for name,text in source.items()},
          'checks': [], 'errors': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
    context = browser.new_context(viewport={'width':1280,'height':1050},device_scale_factor=1)
    context.route('**/*', lambda route: route.abort())
    page = context.new_page(); page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.set_content('<main style="max-width:1060px;margin:24px auto;padding:16px"><p>SHUTTER / SYNTHETIC DELIVERY REVIEW FIXTURE</p><div id="draft"><video></video></div><section id="delivery"><div class="viewer"><video aria-label="Saved delivery"></video></div></section></main>')
    page.add_style_tag(content=source['media-studio.css']+'\n'+source['delivery-room.css'])
    body=re.sub(r'^export ', '',source['delivery-contract.mjs'],flags=re.M)
    page.evaluate('()=>{'+body+';window.TestDelivery={deliveryOptions,deliveryScope};}')
    body=re.sub(r'^import .*?;\n','',source['delivery-room.js'],flags=re.M)
    body=re.sub(r'^export ', '',body,flags=re.M)
    page.evaluate('()=>{const {deliveryOptions,deliveryScope}=TestDelivery;'+body+';window.DeliveryRoom=DeliveryRoom;}')
    page.evaluate('''()=>{
      window.state={deliveryChecks:[]};window.record={revision:3};window.dirty=false;window.calls=[];window.notices=[];
      window.cut={id:'cut_fixture',revision:3,output:'asset_fixture'};
      const meter={status:'measured',integratedLufs:-18.2,truePeakDbtp:-1.5,samplePeakDbfs:-2.1,loudnessRangeLu:4.2,
        curve:{binSeconds:0.1,nonfiniteWindows:1,points:[{seconds:0.3,lufs:-23},{seconds:0.4,lufs:-21},{seconds:1,lufs:-19},{seconds:1.1,lufs:-18}]}};
      window.result={id:'delivery_fixture',cutId:cut.id,revision:3,outputAssetId:cut.output,outputSha256:'a'.repeat(64),
        status:'incomplete',finishedAt:'2026-09-11T00:00:00Z',options:TestDelivery.deliveryOptions(),
        audio:{encoded:meter,pcm:{...meter,integratedLufs:-18.3,truePeakDbtp:-1.8}},
        findings:[{subject:'encoded-picture',message:'Near-black interval: review the intended fade.',startSeconds:2,endSeconds:3,authoredStillClipIds:['photo']},
                  {subject:'encoded-audio',message:'Very quiet interval: check the closing pause.',startSeconds:3,endSeconds:4}],
        checks:[{code:'decoded-picture-count',status:'pass'},{code:'encoded-momentary-curve',status:'unassessed',reason:'delivery_nonfinite_meter_windows'}],
        notAssessed:['Not a conformance certificate. Color treatment and native application handoffs remain unassessed.']};
      window.room=new DeliveryRoom({getState:()=>state,getRecord:()=>record,isDirty:()=>dirty,
        api:async(url,options)=>{calls.push({url,...options});return {...structuredClone(result),options:JSON.parse(options.body)};},
        action:fn=>window.pending=fn(),notify:message=>notices.push(message)});
      const player=document.querySelector('#delivery video'),draft=document.querySelector('#draft video');
      window.savedPosition=0;window.draftPosition=0;window.pausedCount=0;
      Object.defineProperty(player,'currentTime',{get:()=>savedPosition,set:v=>savedPosition=v});
      Object.defineProperty(draft,'currentTime',{get:()=>draftPosition,set:v=>draftPosition=v});
      player.pause=()=>pausedCount++;player.play=()=>{throw Error('Unexpected autoplay');};
      room.attach(document.querySelector('#delivery'),cut);
    }''')
    def check(name, expression):
        assert page.evaluate(expression), name
        report['checks'].append({'name':name,'passed':True})
    check('no automatic analysis on opening', 'calls.length===0 && document.querySelector("[data-check-scope]").textContent.includes("No inspection")')
    check('default targets are observe only', 'document.querySelector("[name=targetLufs]").value==="" && document.querySelector("[name=truePeakCeilingDbtp]").value===""')
    check('read-only intent and no automatic fixes are visible', 'document.body.textContent.includes("READ ONLY") && document.body.textContent.includes("No remastering")')
    page.locator('[name=targetLufs]').fill('-23');page.locator('[name=toleranceLu]').fill('0.5')
    page.locator('[name=truePeakCeilingDbtp]').fill('-1');page.locator('[name=scanPicture]').uncheck()
    page.locator('button[type=submit]').click();page.evaluate('()=>window.pending')
    check('explicit scan sends bounded options to selected saved cut', 'calls.length===1 && calls[0].url==="/api/media/cuts/cut_fixture/check" && calls[0].method==="POST" && JSON.parse(calls[0].body).targetLufs===-23 && JSON.parse(calls[0].body).scanPicture===false')
    check('scan does not save or change current edit', 'record.revision===3 && !dirty && calls.every(c=>c.url.endsWith("/check"))')
    check('encoded audio and PCM measurements stay separate', 'document.querySelectorAll(".check-metric").length===2 && document.querySelectorAll(".check-metric strong")[0].textContent==="-18.2 LUFS" && document.querySelectorAll(".check-metric strong")[1].textContent==="-18.3 LUFS"')
    check('incomplete evidence is not displayed as an all-clear badge', 'document.body.textContent.includes("Some checks unavailable") && document.body.textContent.includes("unassessed")')
    check('JSON download identifies the historical report', 'document.querySelector(".check-report-link").getAttribute("href")==="/api/media/checks/delivery_fixture" && document.querySelector(".check-report-link").hasAttribute("download")')
    check('missing loudness bins are not connected by an invented trace', 'document.querySelector(".check-curve path").getAttribute("d").split("M").length===3 && document.querySelector(".check-curve").textContent.includes("omitted")')
    check('authored photographs are acknowledged in static/dark flags', 'document.body.textContent.includes("overlaps an authored photograph")')
    page.locator('.check-finding button').first.click()
    check('review seeks only saved delivery without autoplay', 'savedPosition===2 && draftPosition===0 && pausedCount===1')
    page.evaluate('dirty=true;room.updateScope()')
    check('unsaved edit makes measurement visibly historical', 'document.querySelector("[data-check-scope]").dataset.scope==="older-saved-render" && document.querySelector("[data-check-scope]").textContent.includes("does not cover")')
    page.evaluate('dirty=false;record.revision=4;room.updateScope()')
    check('new saved revision does not inherit an older report', 'document.querySelector("[data-check-scope]").dataset.scope==="older-saved-render"')
    page.evaluate('record.revision=3;room.updateScope()')
    check('matching saved revision restores exact scope, not certification', 'document.querySelector("[data-check-scope]").dataset.scope==="saved-render" && document.querySelector("[data-check-scope]").textContent.includes("not a certification")')
    page.locator('.delivery-check').screenshot(path=str(OUT/'delivery-check-dom-desktop.png'))
    page.set_viewport_size({'width':390,'height':844})
    check('report stays within 390px mobile viewport','document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(OUT/'delivery-check-dom-mobile.png'),full_page=True)
    page.evaluate('''()=>{room.report.findings=[{subject:'<img id="attack1" src=x>',message:'<img id="attack2" src=x onerror="window.attacked=true">'}];room.report.checks=[{status:'unassessed',code:'<img id="attack3">',reason:'<script>window.attacked=true</script>'}];room.render();}''')
    check('report text cannot inject HTML or script', '!window.attacked && !document.querySelector("#attack1,#attack2,#attack3") && document.querySelector(".check-findings").textContent.includes("<img")')
    page.evaluate('room.report.findings=Array.from({length:105},()=>({subject:"fixture",message:"observation"}));room.render()')
    check('long finding lists are bounded and explain omitted on-screen items', 'document.querySelectorAll(".check-finding").length===100 && document.body.textContent.includes("Showing 100 of 105")')
    page.evaluate('room.report.audio.encoded.integratedLufs=null;room.report.audio.encoded.truePeakDbtp=null;room.render()')
    check('unmeasurable loudness is never shown as zero', 'document.querySelector(".check-metric strong").textContent==="Not measurable"')
    page.evaluate('room.report.outputAssetId="wrong-output";room.render()')
    check('wrong-output report does not display measurements for this delivery', 'document.querySelector("[data-check-scope]").dataset.scope==="wrong-cut" && !document.querySelector(".check-metric")')
    check('no uncaught UI exceptions', 'true' if not report['errors'] else 'false')
    browser.close()
report['passed']=len(report['checks']);(OUT/'delivery-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
