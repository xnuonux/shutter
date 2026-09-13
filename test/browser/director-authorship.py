"""Director-authored records remain distinct through the actual Studio interface."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import os, json
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/director-workflow'; OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'checks':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    def check(name,value):
        assert value,name
        report['checks'].append(name)
    def req(route,body=None,method='GET'):
        r=page.request.fetch(BASE+route,method=method,data=json.dumps(body) if body is not None else None,headers={'content-type':'application/json'} if body is not None else None)
        assert r.ok,r.text()
        return r.json()
    try:
        state=req('/api/media/state'); videos=[a for a in state['assets'] if a['kind']=='video' and a['media']['duration']>=4]
        made=req('/api/media/productions',{'title':'Director-authored scene review','fps':'24','width':768,'height':512},'POST')
        pid=made['production']['id']; report['projectId']=pid
        tl=made['timeline']['timeline']; tl['clips']=[{'id':'opening','assetId':videos[0]['id'],'sourceStart':'0','frames':96,'fit':'contain'}]
        saved=req(f'/api/media/productions/{pid}/timeline',{'baseRevision':1,'timeline':tl},'PUT')
        req(f'/api/media/productions/{pid}/memory',{'baseRevision':0,'authoredBy':'director','moment':{'id':'note_'+pid,'assetId':videos[1]['id'],'startUs':1000000,'endUs':4000000,'label':'Orb turn, alternate view','notes':'A director observation of the marked source.','tags':['orb']}},'POST')
        req(f'/api/media/productions/{pid}/direction/opening',{'baseRevision':0,'timelineRevision':2,'authoredBy':'director','brief':{'goal':'Carry the turn through the cut.','continuity':['Keep the orb in hand.'],'query':'orb','coverage':{'at':36,'end':60,'sourceOffsetUs':500000}}},'PUT')
        req(f'/api/media/productions/{pid}/direction/opening/proposals',{'baseRevision':2,'directionRevision':1},'POST')
        page.goto(BASE+'/media-studio?project='+pid,wait_until='domcontentloaded')
        page.locator('#tool-director').click()
        expect(page.locator('[data-direction-candidate]')).to_have_count(1)
        page.locator('[data-direction-candidate]').click()
        expect(page.locator('.direction-observation')).to_contain_text('Director-authored source note')
        check('source candidate retains director authorship',True)
        page.locator('#direction-evidence').click()
        expect(page.locator('.direction-evidence-group')).to_have_count(4)
        page.locator('.direction-evidence-details').evaluate('(el)=>el.open=true')
        expect(page.locator('.direction-evidence-intent')).to_contain_text('Director-authored intent')
        page.locator('.direction-evidence-intent').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/'authored-intent.png'))
        check('actual source evidence retains director intent authorship',True)
        check('director notes do not grant artist acceptance',not page.locator('#direction-reviewed').is_checked() and page.locator('#direction-apply').is_disabled())
        page.locator('#tool-moments').click()
        page.locator('#memory-search').click()
        expect(page.locator('.memory-badge')).to_have_text('DIRECTOR NOTE')
        page.locator('[data-note]').click()
        expect(page.locator('#memory-source')).to_contain_text('director-authored')
        check('source library and note editor show saved authorship',True)
        page.locator('#memory-notes').fill('The artist revised this source description.')
        page.locator('#memory-save').click()
        expect(page.locator('.memory-badge')).to_have_text('ARTIST NOTE')
        check('an artist edit is attributed to the artist',True)
        check('source and intent work never edits the saved cut',req(f'/api/media/productions/{pid}/timeline')==saved)
        check('no browser errors',not report['errors'])
    finally:
        (OUT/'browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        browser.close()
print(json.dumps(report))
