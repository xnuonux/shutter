"""Real browser workspace navigation against the preserved local review project.
Moving a tool must not change the film, lose a direction or submit a provider job.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json,os

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/workspace-review';OUT.mkdir(parents=True,exist_ok=True)
base=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
project=os.environ.get('SHUTTER_REVIEW_PROJECT') or json.loads((ROOT/'work/browser-review/receipt.json').read_text(encoding='utf-8'))['projectId']
report={'checks':[],'errors':[],'requests':[],'projectId':project}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(8000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
 def check(name,value):
  assert value,name;report['checks'].append(name);print(name,flush=True)
 def saved():return page.request.get(base+f'/api/media/productions/{project}/timeline').json()
 try:
  page.goto(base+'/media-studio?project='+project,wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible()
  before=saved()
  expect(page.locator('#projects')).to_have_value(project)
  boxes={key:page.locator(key).bounding_box() for key in ['#program-host','#cut-canvas']}
  check('Program and the entire picture timeline fit together on desktop',all(b and b['y']>=0 and b['y']+b['height']<970 for b in boxes.values()))
  page.screenshot(path=str(OUT/'edit-desktop.png'))
  page.set_viewport_size({'width':1280,'height':800})
  compact=page.locator('#cut-canvas').bounding_box()
  check('Compact desktop keeps the picture timeline in view',compact['y']>=0 and compact['y']+compact['height']<775)
  page.screenshot(path=str(OUT/'edit-compact.png'));page.set_viewport_size({'width':1440,'height':1000})
  canvas=page.locator('#cut-canvas');box=canvas.bounding_box();canvas.click(position={'x':box['width']*.56,'y':48})
  second=before['timeline']['clips'][1]['id']
  page.locator('#cut-generate').click();expect(page.locator('#generate-shot')).to_have_value(second)
  page.locator('#generate-prompt').fill('Continue the rain as the camera follows her glance.')
  page.locator('#workspace-mode-sound').click();expect(page.locator('#sound-room')).to_be_visible();expect(page.locator('#text-room')).not_to_be_visible()
  expect(page.locator('#cut-play')).to_be_visible()
  page.locator('#workspace-mode-finish').click();expect(page.locator('#text-room')).to_be_visible();expect(page.locator('#sound-room')).not_to_be_visible()
  page.locator('#workspace-mode-edit').click();expect(page.locator('#generate-prompt')).to_have_value('Continue the rain as the camera follows her glance.')
  check('Workspace changes preserve the selected generation target and unfinished direction',page.locator('#generate-shot').input_value()==second)
  page.screenshot(path=str(OUT/'generate-desktop.png'))
  canvas.click(position={'x':box['width']*.12,'y':48});page.once('dialog',lambda d:d.dismiss());page.locator('#cut-generate').click()
  expect(page.locator('#generate-shot')).to_have_value(second)
  check('Declining a new target keeps the existing generation direction attached to its shot',page.locator('#generate-prompt').input_value().startswith('Continue the rain'))
  page.locator('#generate-reset').click()
  page.locator('#cut-takes').click();expect(page.locator('#memory-shot')).to_have_value(before['timeline']['clips'][0]['id'])
  check('Compare takes opens against the selected timeline shot',page.locator('.memory-takes').is_visible())
  page.locator('#tool-source').focus();page.keyboard.press('Space');expect(page.locator('#source-panel')).to_be_visible()
  check('Keyboard activation of a tool tab does not start timeline playback',page.locator('#cut-play').inner_text()=='Play')
  page.locator('#workspace-mode-deliver').click();expect(page.locator('#render')).to_be_visible()
  check('Delivery exposes the existing saved export and its explicit render control',page.locator('#delivery video').count()==1)
  page.locator('#workspace-mode-edit').click()
  page.locator('#new-production-button').click();expect(page.locator('#production-dialog')).to_be_visible();page.keyboard.press('Escape')
  check('Closing production creation retains the current saved project',saved()==before)
  page.locator('#cut-duplicate').click()
  key='shutter:local-draft:v1:'+project
  recovery=page.evaluate('(key)=>localStorage.getItem(key)',key)
  new_shot=json.loads(recovery)['timeline']['clips'][1]['id']
  box=canvas.bounding_box();canvas.click(position={'x':box['width']*.45,'y':48});page.locator('#cut-generate').click()
  expect(page.locator('#generate-shot')).to_have_value(new_shot);expect(page.locator('#generate-plan')).to_be_disabled()
  check('An unsaved new shot never falls back to generating a different saved shot',page.locator('#generate-shot').input_value()==new_shot)
  other=next(p['id'] for p in page.request.get(base+'/api/media/state').json()['productions'] if p['id']!=project)
  route='**/api/media/productions/'+other+'/timeline'
  page.route(route,lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"switch_unavailable"}'))
  page.once('dialog',lambda d:d.accept());page.locator('#projects').select_option(other)
  expect(page.locator('#status')).to_contain_text('switch unavailable')
  check('Failed production switching retains both the old selection and local recovery',page.locator('#projects').input_value()==project and page.evaluate('(key)=>localStorage.getItem(key)',key)==recovery)
  page.unroute(route);page.once('dialog',lambda d:d.accept());page.reload(wait_until='domcontentloaded')
  expect(page.locator('#restore-draft')).to_be_visible();expect(page.locator('#save')).to_be_disabled()
  check('Recovery decisions also protect the relocated header save controls',page.locator('#undo').is_disabled() and page.locator('#redo').is_disabled())
  page.locator('#discard-draft').click();expect(page.locator('#save')).to_be_enabled()
  page.set_viewport_size({'width':390,'height':844});page.locator('#workspace-material-toggle').click();expect(page.locator('#asset-search')).to_be_visible()
  search=page.locator('#asset-search').bounding_box()
  check('Mobile material opens within the current viewport',search['y']>=0 and search['y']+search['height']<844)
  page.screenshot(path=str(OUT/'edit-mobile.png'),full_page=True)
  page.locator('#close-material').click();expect(page.locator('#material-panel')).not_to_be_visible()
  page.screenshot(path=str(OUT/'program-mobile.png'),full_page=True)
  check('Mobile material access fits without horizontal page overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('Navigation and contextual tools leave the saved cut unchanged',saved()==before)
  check('No uncaught browser exceptions',not report['errors'])
  check('No provider or generation submission was contacted',all(r['url'].startswith(base) or r['url'].startswith('blob:') for r in report['requests']) and not any(r['method']=='POST' and ('/inserts' in r['url'] or '/quote' in r['url'] or '/submit' in r['url']) for r in report['requests']))
 finally:
  page.screenshot(path=str(OUT/'last-state.png'))
  (OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8');browser.close()
