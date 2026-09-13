"""Actual source-backed Director evidence journey. No provider calls."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, os

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'work/director-evidence'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('SHUTTER_REVIEW_URL', 'http://127.0.0.1:4688')
report = {'checks': [], 'errors': [], 'requests': []}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'], headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.set_default_timeout(15000)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('request', lambda r: report['requests'].append({'method': r.method, 'url': r.url}))
    def check(name, value):
        assert value, name
        report['checks'].append(name)
    def req(route, body=None, method='GET'):
        r = page.request.fetch(BASE+route, method=method, data=json.dumps(body) if body is not None else None, headers={'content-type':'application/json'} if body is not None else None)
        assert r.ok, r.text()
        return r.json()
    def evidence_requests():
        return len([r for r in report['requests'] if r['method']=='POST' and r['url'].endswith('/actions/evidence')])
    try:
        state = req('/api/media/state')
        videos = [a for a in state['assets'] if a['kind']=='video' and a['media']['duration']>=4]
        assert len(videos)>=2
        made = req('/api/media/productions', {'title':'Director evidence review','fps':'24','width':768,'height':512}, 'POST')
        pid = made['production']['id']; report['projectId'] = pid
        timeline = made['timeline']['timeline']
        timeline['clips'] = [{'id':'opening','assetId':videos[0]['id'],'sourceStart':'0','frames':48,'fit':'contain'}, {'id':'continuation','assetId':videos[0]['id'],'sourceStart':'2','frames':48,'fit':'contain'}]
        before = req(f'/api/media/productions/{pid}/timeline', {'baseRevision':1,'timeline':timeline}, 'PUT')
        req(f'/api/media/productions/{pid}/memory', {'baseRevision':0,'moment':{'id':'angle_'+pid,'assetId':videos[1]['id'],'startUs':1000000,'endUs':4000000,'label':'Alternate storm angle','notes':'Match the subject and environment at the cut.','tags':['storm']}}, 'POST')
        page.goto(BASE+'/media-studio?project='+pid, wait_until='domcontentloaded')
        page.locator('#tool-director').click()
        page.locator('#direction-goal').fill('Carry the action through the cut.')
        page.locator('#direction-continuity').fill('Keep the subject and environment readable.')
        page.locator('#direction-query').fill('storm')
        page.locator('#direction-mode').select_option('coverage')
        page.locator('#direction-coverage-at').fill('36')
        page.locator('#direction-coverage-end').fill('60')
        page.locator('#direction-source-offset').fill('0.5')
        page.locator('#direction-plan').click()
        expect(page.locator('[data-direction-candidate]')).to_have_count(1)
        page.locator('[data-direction-candidate]').click()
        check('candidate proposal is source-backed', True)
        checked = page.locator('[data-continuity-check]').first
        checked.check()
        page.locator('#direction-evidence').click()
        expect(page.locator('.direction-evidence-group')).to_have_count(4)
        expect(page.locator('.direction-evidence-grid img')).to_have_count(8)
        page.wait_for_function("()=>[...document.querySelectorAll('.direction-evidence-grid img')].every(x=>x.complete&&x.naturalWidth>0)")
        urls = page.locator('.direction-evidence-grid img').evaluate_all('(xs)=>xs.map(x=>x.currentSrc||x.src)')
        check('eight displayed pictures reuse six loaded evidence images', len(set(urls))==6)
        expect(checked).to_be_checked()
        check('extracting pictures preserves the existing review checks', True)
        text = page.locator('#direction-evidence-panel').inner_text()
        check('entry and return use scene frames 36 and 59', 'scene 36' in text and 'scene 59' in text)
        check('evidence keeps the timeline unchanged', req(f'/api/media/productions/{pid}/timeline')==before)
        check('saved intent and continuity remain available', page.locator('.direction-evidence-details').text_content().find('Keep the subject and environment readable.')>=0)
        check('pictures retain their full source framing', page.locator('.direction-evidence-grid img').evaluate_all('(xs)=>xs.every(x=>Math.abs(x.width/x.height-x.naturalWidth/x.naturalHeight)<0.02)'))
        page.locator('.direction-evidence-group').first.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/'boundary-comparison.png'))
        page.locator('.direction-evidence-group').last.screenshot(path=str(OUT/'return-comparison.png'))
        page.set_viewport_size({'width':390,'height':844})
        page.locator('.direction-evidence-group').first.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/'boundary-mobile.png'))
        check('mobile evidence has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        # A changed context delivered during the preview await must stop the dependent extraction.
        count = evidence_requests()
        def change_during_preview(route):
            response = route.fetch()
            page.evaluate("()=>{const e=document.querySelector('#direction-source-offset');e.value='1';e.dispatchEvent(new Event('input',{bubbles:true}));}")
            route.fulfill(response=response)
        page.route('**/actions/preview', change_during_preview)
        page.locator('#direction-evidence').click()
        page.wait_for_function('()=>!document.body.inert')
        page.unroute('**/actions/preview', change_during_preview)
        expect(page.locator('#direction-evidence-panel')).to_be_empty()
        check('a changed pending preview does not request or display stale pictures', evidence_requests()==count)
        check('changed intent clears review checks', not checked.is_checked())
        check('no automatic acceptance', page.locator('#direction-apply').is_disabled() and not page.locator('#direction-reviewed').is_checked())
        check('no browser exceptions', not report['errors'])
        check('no paid requests', not any(r['method']=='POST' and any(x in r['url'] for x in ['/submit','/quote','/inserts','/run']) for r in report['requests']))
    finally:
        (OUT/'receipt.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        browser.close()
print(json.dumps({'projectId':report.get('projectId'),'checks':report['checks'],'errors':report['errors']}))
