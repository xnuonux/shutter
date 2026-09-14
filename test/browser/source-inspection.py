"""Actual source inspection playback, frame navigation and stale UI withdrawal. No provider."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, os

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/source-inspection';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'checks':[],'errors':[],'requests':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(15000)
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
    def check(name,value):
        assert value,name
        report['checks'].append(name)
    def req(route,body=None,method='GET'):
        r=page.request.fetch(BASE+route,method=method,data=body)
        assert r.ok,r.text()
        return r.json()
    try:
        source=next(a for a in req('/api/media/state')['assets'] if a['kind']=='video' and a['media']['duration']>=4)
        made=req('/api/media/productions',{'title':'Source motion inspection review','fps':'24','width':768,'height':512},'POST')
        pid=made['production']['id'];report['projectId']=pid
        timeline=made['timeline']['timeline'];timeline['clips']=[{'id':'opening','assetId':source['id'],'sourceStart':'0','frames':96,'fit':'contain'}]
        before=req(f'/api/media/productions/{pid}/timeline',{'baseRevision':1,'timeline':timeline},'PUT')
        state=req('/api/media/state')
        page.goto(BASE+'/media-studio?project='+pid,wait_until='domcontentloaded')
        page.locator(f'#assets [data-asset="{source["id"]}"]').click()
        page.locator('#tool-moments').click()
        page.locator('.memory-author summary').click()
        page.locator('#memory-new').click()
        page.locator('#memory-in').fill('1');page.locator('#memory-out').fill('3')
        page.locator('#memory-label').fill('Unwritten observation')
        page.locator('#memory-inspect').click()
        video=page.locator('#memory-motion-preview');expect(video).to_be_visible()
        page.wait_for_function("()=>document.querySelector('#memory-motion-preview')?.readyState>=2")
        expect(page.locator('[data-motion-frame]')).to_have_count(8)
        page.wait_for_function("()=>[...document.querySelectorAll('[data-motion-frame] img')].every(i=>i.complete&&i.naturalWidth>0)")
        check('real playback is two seconds and eight images decode',abs(video.evaluate('(v)=>v.duration')-2)<0.02)
        check('motion inspection keeps the unsaved note form',page.locator('#memory-label').input_value()=='Unwritten observation' and 'not saved' in page.locator('#memory-form-status').inner_text())
        page.locator('[data-motion-frame]').last.click()
        page.wait_for_function("()=>Math.abs(document.querySelector('#memory-motion-preview').currentTime-47/24)<0.02")
        check('last sample navigates to the actual last playback frame',True)
        video.evaluate('(v)=>{v.currentTime=0;return v.play()}')
        page.wait_for_function("()=>document.querySelector('#memory-motion-preview').currentTime>0.2")
        video.evaluate('(v)=>v.pause()')
        check('playback advances through the selected source interval',True)
        check('inspection preserves the asset library and saved cut',req('/api/media/state')==state and req(f'/api/media/productions/{pid}/timeline')==before)
        check('sampling gaps and omitted sound are visible','silent playback' in page.locator('#memory-scout-results').inner_text() and 'between samples' in page.locator('#memory-scout-results').inner_text())
        video.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'motion-inspection.png'))
        page.set_viewport_size({'width':390,'height':844});video.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'motion-mobile.png'))
        check('mobile inspection stays within the viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        page.locator('#memory-in').fill('1.25');expect(video).to_have_count(0)
        check('changing source range removes obsolete playback',True)
        def change_during_decode(route):
            response=route.fetch()
            page.evaluate("()=>{const e=document.querySelector('#memory-out');e.value='2.75';e.dispatchEvent(new Event('input',{bubbles:true}));}")
            route.fulfill(response=response)
        page.route('**/assets/*/inspect',change_during_decode)
        page.locator('#memory-inspect').click();page.wait_for_function('()=>!document.body.inert')
        page.unroute('**/assets/*/inspect',change_during_decode)
        expect(video).to_have_count(0)
        check('late inspection cannot replace the newly chosen range',True)
        check('no notes were automatically written',req(f'/api/media/productions/{pid}/memory')['total']==0)
        check('no browser exceptions',not report['errors'])
        check('no paid requests',not any(r['method']=='POST' and any(x in r['url'] for x in ['/submit','/quote','/inserts','/run']) for r in report['requests']))
    finally:
        if page.locator('#memory-motion-preview').count():
            report['playbackState']=page.locator('#memory-motion-preview').evaluate('(v)=>({time:v.currentTime,duration:v.duration,readyState:v.readyState,error:v.error?.message,seekable:Array.from({length:v.seekable.length},(_,i)=>[v.seekable.start(i),v.seekable.end(i)]),buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])})')
        (OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8');browser.close()
print(json.dumps({k:report[k] for k in ['projectId','checks','errors']}))
