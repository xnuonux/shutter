"""Artist direction -> source-backed proposal -> audition -> accepted edit, on the actual app."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json,os

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/direction-review';OUT.mkdir(parents=True,exist_ok=True)
base=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'checks':[],'errors':[],'requests':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(10000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
 def check(name,value):
  assert value,name;report['checks'].append(name);print(name,flush=True)
 def api(url,body=None,method='POST'):
  r=page.request.fetch(base+url,method=method,data=body);assert r.ok,r.text();return r.json()
 try:
  state=api('/api/media/state',method='GET');assets=[a for a in state['assets'] if a['kind']=='video' and (a.get('media') or {}).get('duration',0)>=4]
  first,second=assets[:2]
  created=api('/api/media/productions',{'title':'The orb · direction study','fps':'24','width':768,'height':512})
  project=created['production']['id'];report['projectId']=project
  edit=created['timeline']['timeline'];edit['clips']=[{'id':'opening','assetId':first['id'],'sourceStart':'0','frames':48,'fit':'contain'},{'id':'decision','assetId':first['id'],'sourceStart':'2','frames':48,'fit':'contain'}]
  edit['coverage']=[{'id':'cutaway','assetId':first['id'],'sourceStart':'0','at':42,'frames':12,'fit':'contain'}]
  before=api(f'/api/media/productions/{project}/timeline',{'baseRevision':1,'timeline':edit},'PUT')
  moment=api(f'/api/media/productions/{project}/memory',{'baseRevision':0,'moment':{'id':'orb_'+project,'assetId':second['id'],'startUs':1000000,'endUs':4000000,'label':'Sol considers the orb','notes':'Study label: a close view to review against the scene.','tags':['orb','close'],'favorite':True}})
  page.goto(base+'/media-studio?project='+project,wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible()
  canvas=page.locator('#cut-canvas');box=canvas.bounding_box();canvas.click(position={'x':box['width']*.72,'y':48})
  page.locator('#tool-director').click();expect(page.locator('#direction-shot')).to_have_value('decision')
  page.locator('#direction-goal').fill('Hold on Sol’s hesitation before the orb leaves his hand.')
  page.locator('#direction-continuity').fill('Check the orb’s hand and position.\nRain and coat must agree with the surrounding shots.')
  page.locator('#direction-query').fill('orb')
  page.locator('#tool-takes').click();page.locator('#tool-director').click()
  expect(page.locator('#direction-goal')).to_have_value('Hold on Sol’s hesitation before the orb leaves his hand.')
  check('Contextual direction follows the chosen shot and survives tool navigation',page.locator('#direction-shot').input_value()=='decision')
  page.locator('#direction-plan').click();expect(page.locator('[data-direction-candidate]')).to_have_count(1)
  check('Planning names the existing source without altering picture',api(f'/api/media/productions/{project}/timeline',method='GET')==before)
  page.locator('[data-direction-candidate]').click();expect(page.locator('#direction-apply')).to_be_disabled()
  page.locator('#direction-audition').click();expect(page.locator('#program-host')).to_have_attribute('data-audition','true')
  check('Audition uses the real Program viewer and keeps the saved edit',api(f'/api/media/productions/{project}/timeline',method='GET')==before)
  page.locator('#direction-end-audition').click();expect(page.locator('#program-host')).not_to_have_attribute('data-audition','true')
  page.locator('#direction-reviewed').check();page.locator('[data-continuity-check]').first.check();expect(page.locator('#direction-apply')).to_be_disabled()
  page.locator('[data-continuity-check]').nth(1).check();expect(page.locator('#direction-apply')).to_be_enabled()
  check('Each continuity requirement is explicitly reviewed before acceptance',page.locator('#direction-apply').is_enabled())
  page.screenshot(path=str(OUT/'proposal-desktop.png'))
  page.locator('#direction-apply').click();expect(page.locator('#status')).to_contain_text('Shot accepted')
  accepted=api(f'/api/media/productions/{project}/timeline',method='GET')
  check('Acceptance changes only the selected source and preserves scene coverage',accepted['timeline']['clips'][1]['assetId']==second['id'] and accepted['timeline']['clips'][1]['sourceStart']=='1/1' and accepted['timeline']['clips'][1]['frames']==48 and accepted['timeline']['clips'][0]==before['timeline']['clips'][0] and accepted['timeline']['coverage']==before['timeline']['coverage'])
  page.locator('#undo').click();expect(page.locator('#status')).to_contain_text('undo saved')
  check('Saved undo restores the exact prior picture',api(f'/api/media/productions/{project}/timeline',method='GET')['timeline']==before['timeline'])
  page.reload(wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible();canvas=page.locator('#cut-canvas');box=canvas.bounding_box();canvas.click(position={'x':box['width']*.72,'y':48});page.locator('#tool-director').click()
  expect(page.locator('#direction-goal')).to_have_value('Hold on Sol’s hesitation before the orb leaves his hand.')
  expect(page.locator('#direction-status')).to_contain_text('changed')
  check('Reload retains direction and exposes stale proposals',page.locator('#direction-goal').input_value().startswith('Hold on Sol'))
  page.locator('#direction-plan').click();expect(page.locator('[data-direction-candidate]')).to_have_count(1);page.locator('[data-direction-candidate]').click()
  page.locator('#direction-reviewed').check()
  for el in page.locator('[data-continuity-check]').all():el.check()
  page.locator('#direction-brief').evaluate('(el)=>el.open=true');page.locator('#direction-goal').fill('Changed intention')
  expect(page.locator('#direction-apply')).to_be_disabled()
  check('Editing the brief withdraws acceptance until proposals are rebuilt',page.locator('#direction-apply').is_disabled())
  canvas.click(position={'x':box['width']*.12,'y':48});page.once('dialog',lambda d:d.dismiss());page.locator('#tool-director').click();expect(page.locator('#direction-shot')).to_have_value('decision')
  check('Declining target change preserves unfinished direction on its original shot',page.locator('#direction-goal').input_value()=='Changed intention')
  opening=f'/api/media/productions/{project}/direction/opening'
  api(opening,{'baseRevision':0,'brief':{'goal':'Recovered opening direction','continuity':[],'query':'orb'}},'PUT')
  page.route('**'+opening,lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"Direction temporarily unavailable."}'))
  page.once('dialog',lambda d:d.accept());page.locator('#tool-director').click();expect(page.locator('#status')).to_contain_text('Direction temporarily unavailable')
  page.unroute('**'+opening)
  held=[];page.route('**'+opening,lambda r:held.append(r));page.locator('#tool-director').click()
  expect(page.locator('#direction-status')).to_contain_text('Loading')
  check('A loading direction cannot overwrite freshly typed notes',page.locator('#direction-brief').evaluate('(el)=>el.inert'))
  held[0].continue_();page.unroute('**'+opening);expect(page.locator('#direction-goal')).to_have_value('Recovered opening direction')
  check('A failed shot load can be retried without abandoning the workspace',page.locator('#direction-goal').input_value()=='Recovered opening direction')
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'proposal-mobile.png'),full_page=True)
  check('Director remains usable without horizontal page overflow on mobile',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('No uncaught browser exceptions',not report['errors'])
  check('No paid provider or generation submission',all(r['url'].startswith(base) or r['url'].startswith('blob:') for r in report['requests']) and not any(r['method']=='POST' and ('/inserts' in r['url'] or '/submit' in r['url'] or '/quote' in r['url']) for r in report['requests']))
 finally:
  page.screenshot(path=str(OUT/'last-state.png'));(OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8');browser.close()
