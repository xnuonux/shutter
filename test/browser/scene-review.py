"""Real local scene playback, sound stream, seeking, and stale review withdrawal."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, os
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/scene-review';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'checks':[],'errors':[],'requests':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1300});page.set_default_timeout(30000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
    def check(name,value=True):
        assert value,name
        report['checks'].append(name)
    def req(route,body=None,method='GET'):
        r=page.request.fetch(BASE+route,method=method,data=body)
        assert r.ok,r.text()
        return r.json()
    try:
        assets=req('/api/media/state')['assets'];videos=[a for a in assets if a['kind']=='video' and a['media']['duration']>=4]
        master=next(a for a in assets if a['kind']=='audio' and a['media']['duration']>=4)
        made=req('/api/media/productions',{'title':'The rain · composed scene review','fps':'24','width':768,'height':512},'POST')
        pid=made['production']['id'];report['projectId']=pid;timeline=made['timeline']['timeline']
        timeline['clips']=[{'id':'opening','assetId':videos[0]['id'],'sourceStart':'0','frames':96,'fit':'contain'}]
        timeline['coverage']=[{'id':'rain-angle','assetId':videos[1]['id'],'sourceStart':'1.5','at':36,'frames':24,'fit':'contain'}]
        timeline['soundtrack']={'assetId':master['id'],'tailPolicy':'pad-silence'}
        timeline['textLayer']={'schema':'shutter-text-v1','captionDelivery':'burn-and-sidecar','cues':[{'id':'rain-title','kind':'title','text':'THE RAIN','startFrame':40,'endFrame':60}]}
        saved=req(f'/api/media/productions/{pid}/timeline',{'baseRevision':1,'timeline':timeline},'PUT');state=req('/api/media/state')
        page.goto(BASE+'/media-studio?project='+pid,wait_until='domcontentloaded')
        shell=page.locator('.scene-review-shell');shell.locator('summary').click()
        page.locator('#scene-review-in').fill('24');page.locator('#scene-review-out').fill('84')
        page.locator('#scene-review-run').click();video=page.locator('#scene-review-video');expect(video).to_be_visible()
        page.wait_for_function("()=>document.querySelector('#scene-review-video')?.readyState>=2")
        expect(page.locator('[data-review-frame]')).to_have_count(8)
        page.wait_for_function("()=>[...document.querySelectorAll('[data-review-frame] img')].every(i=>i.complete&&i.naturalWidth>0)")
        check('real composed playback has 60 frames and eight decoded samples',abs(video.evaluate('(v)=>v.duration')-2.5)<.03)
        check('saved revision, scene range and authored mix are visible',all(s in page.locator('#scene-review-status').inner_text() for s in ['revision 2','[24, 84)','authored sound mix']))
        check('exact mixed WAV is linked',page.locator('#scene-review-output a[download]').count()==1)
        page.locator('[data-review-frame]').last.click();page.wait_for_function("()=>Math.abs(document.querySelector('#scene-review-video').currentTime-59/24)<.03")
        check('sample click seeks the last actual playback frame')
        video.evaluate('(v)=>{v.currentTime=0;return v.play()}');page.wait_for_function("()=>document.querySelector('#scene-review-video').currentTime>.3");video.evaluate('(v)=>v.pause()')
        check('playback advances and browser decodes its audio stream',video.evaluate('(v)=>v.webkitAudioDecodedByteCount>0'))
        check('review preserves saved edit, assets, cuts and jobs',req('/api/media/state')==state and req(f'/api/media/productions/{pid}/timeline')==saved)
        shell.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'scene-review-desktop.png'))
        check('frame labels have visible text contrast',page.locator('.scene-review-frame span').first.evaluate('(e)=>getComputedStyle(e).color')=='rgb(237, 241, 245)')
        page.set_viewport_size({'width':390,'height':844});shell.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'scene-review-mobile.png'))
        check('mobile review stays within viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.locator('#scene-review-in').fill('25');expect(video).to_have_count(0);check('changed interval withdraws playback')
        def change_during_decode(route):
            response=route.fetch()
            page.evaluate("()=>{const e=document.querySelector('#scene-review-out');e.value='83';e.dispatchEvent(new Event('input',{bubbles:true}));}")
            route.fulfill(response=response)
        page.route('**/productions/*/review',change_during_decode)
        page.locator('#scene-review-run').click();page.wait_for_function('()=>!document.body.inert')
        page.unroute('**/productions/*/review',change_during_decode);expect(video).to_have_count(0);check('late response cannot replace changed interval')
        page.locator('#scene-review-in').fill('24');page.locator('#scene-review-out').fill('84');page.locator('#scene-review-run').click();expect(video).to_be_visible()
        page.evaluate("()=>{const e=document.querySelector('#width');e.value='770';e.dispatchEvent(new Event('change',{bubbles:true}));}")
        expect(video).to_have_count(0);expect(page.locator('#scene-review-run')).to_be_disabled();check('unsaved timeline change withdraws review and blocks stale rendering')
        check('draft change does not mutate saved scene',req(f'/api/media/productions/{pid}/timeline')==saved)
        # Restore this disposable draft explicitly and leave a ready review for the artist.
        page.evaluate("()=>{const e=document.querySelector('#width');e.value='768';e.dispatchEvent(new Event('change',{bubbles:true}));}")
        expect(page.locator('#scene-review-run')).to_be_enabled();page.locator('#scene-review-run').click();expect(video).to_be_visible()
        page.set_viewport_size({'width':1440,'height':1300})
        other=page.locator('#projects option').evaluate_all('(items)=>items.map(e=>e.value).find(id=>id&&id!==document.querySelector("#projects").value)')
        page.locator('#projects').select_option(other);expect(video).to_have_count(0);check('switching production withdraws previous playback')
        page.locator('#projects').select_option(pid);page.locator('#scene-review-in').fill('24');page.locator('#scene-review-out').fill('84');page.locator('#scene-review-run').click();expect(video).to_be_visible()
        shell.scroll_into_view_if_needed()
        check('no browser exceptions',not report['errors'])
        check('no paid requests',not any(r['method']=='POST' and any(x in r['url'] for x in ['/submit','/quote','/inserts','/run']) for r in report['requests']))
    finally:
        report['lastUrl']=page.url
        (OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8');browser.close()
print(json.dumps({k:report[k] for k in ['projectId','checks','errors']}))
