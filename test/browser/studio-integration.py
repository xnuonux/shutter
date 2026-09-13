"""Real localhost editor journey with existing footage. No generation or provider calls."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import hashlib,json,math,os,shutil,struct,wave

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'work/browser-review';OUT.mkdir(parents=True,exist_ok=True)
INPUT=OUT/'input';INPUT.mkdir(exist_ok=True)
MANIFEST=Path(os.environ['SHUTTER_REVIEW_MANIFEST'])
originals=Path(os.environ.get('SHUTTER_REVIEW_ASSETS','C:/dev/shutter/data/assets'))
manifest=json.loads(MANIFEST.read_text(encoding='utf-8'))
videos=[a for a in manifest['assets'] if a['kind']=='video'][:2]
paths=[]
for a in videos:
 target=INPUT/a['name'];shutil.copyfile(originals/a['filename'],target);paths.append(target)
song=INPUT/'Quiet timing reference.wav'
with wave.open(str(song),'wb') as wav:
 wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(48000)
 wav.writeframes(b''.join(struct.pack('<hh',int(90*math.sin(i/41)),int(90*math.sin(i/43))) for i in range(12*48000)))
paths.append(song)
digests={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
base=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'scope':'actual browser and actual parent server, existing H3 footage, disposable project; no provider requests','checks':[],'pageErrors':[],'requests':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1040})
 page.set_default_timeout(15000)
 page.on('pageerror',lambda e:report['pageErrors'].append(str(e)))
 page.on('dialog',lambda d:d.accept())
 page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
 def check(name,value):
  assert value,name;report['checks'].append(name);print(name,flush=True)
 try:
  page.goto(base+'/media-studio',wait_until='domcontentloaded')
  expect(page.locator('#health')).to_contain_text('Local media tools ready')
  page.locator('#new-production-button').click()
  page.locator('#new-project input[name=title]').fill('The rain · coverage integration')
  page.locator('#new-project button[type=submit]').click();expect(page.locator('#editing')).to_be_visible()
  project=page.locator('#projects').input_value();report['projectId']=project
  page.locator('.format-settings > summary').click()
  page.locator('#fps').select_option('24')
  for key,value in [('width','832'),('height','480')]:page.locator('#'+key).fill(value);page.locator('#'+key).press('Tab')
  page.locator('.format-settings > summary').click()
  page.locator('#files').set_input_files([str(p) for p in paths])
  expect(page.locator('#status')).to_contain_text('Imports verified')
  def select(name):page.locator('[data-asset="asset_'+digests[name]+'"]').click()
  for v in videos:
   select(v['name']);page.locator('#add-source').click()
  page.locator('.numeric-edit').evaluate('(e)=>e.open=true')
  for i in range(2):
   field=page.locator(f'#clips [data-index="{i}"] [data-field="frames"]');field.fill('120');field.press('Tab')
  select(song.name);page.locator('#add-source').click()
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved revision')
  def saved():return page.request.get(base+f'/api/media/productions/{project}/timeline').json()
  initial=saved();check('Imported footage and WAV form a saved 240-frame cut',initial['plan']['frames']==240 and initial['timeline']['soundtrack']['assetId']=='asset_'+digests[song.name])
  page.locator('#build-waveform').click();expect(page.locator('#wave-label')).to_contain_text('channel-separated')
  canvas=page.locator('#cut-canvas');box=canvas.bounding_box();canvas.click(position={'x':box['width']*0.12,'y':48})
  select(videos[1]['name']);page.locator('#cut-replace').click();page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved revision')
  replaced=saved();check('Take replacement preserves shot duration and song clock',replaced['plan']['frames']==240 and replaced['timeline']['clips'][0]['assetId']=='asset_'+digests[videos[1]['name']] and replaced['timeline']['soundtrack']==initial['timeline']['soundtrack'])
  select(videos[0]['name']);page.locator('#cut-replace').click();page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved revision')
  beforeCoverage=saved()
  select(videos[1]['name']);page.locator('.coverage-room').evaluate('(e)=>e.open=true')
  for key,value in [('coverage-at','96'),('coverage-end','144'),('coverage-source','1')]:page.locator('#'+key).fill(value)
  page.locator('#coverage-place').click();expect(page.locator('#coverage-list')).to_contain_text('Reveal main view')
  page.locator('#save').click();expect(page.locator('#status')).to_contain_text('Saved revision')
  covered=saved();check('Coverage spans the render boundary without adding runtime',covered['plan']['frames']==240 and covered['timeline']['clips']==beforeCoverage['timeline']['clips'] and covered['timeline']['coverage'][0]['at']==96)
  page.locator('#clips [data-index="1"] [data-remove]').click();expect(page.locator('#status')).to_contain_text('coverage range')
  check('Detailed edit refuses a removal that would strand coverage',page.locator('#clips [data-index]').count()==2 and saved()['timeline']==covered['timeline'])
  page.reload(wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible()
  check('Cold browser reload preserves the exact saved cut',saved()['timeline']==covered['timeline'])
  page.locator('.coverage-room').evaluate('(e)=>e.open=true')
  page.locator('[data-view-coverage]').click();expect(page.locator('#cut-video')).to_have_attribute('data-asset','asset_'+digests[videos[1]['name']])
  page.locator('#cut-play').click()
  page.wait_for_function("() => Number(document.querySelector('#cut-frame').textContent.match(/^frame (\\d+)/)?.[1])>=150",timeout=12000)
  page.locator('#cut-play').click()
  state=page.locator('#cut-video').evaluate('(v)=>({time:v.currentTime,paused:v.paused,asset:v.dataset.asset,ready:v.readyState})')
  check('Playback returns to elapsed main source time after coverage',state['ready']>=2 and 1.1<state['time']<2.2)
  report['playbackReturn']=state
  page.locator('#workspace-mode-deliver').click();page.locator('#color-consent').check();page.locator('#render').click()
  expect(page.locator('#status')).to_contain_text('Handoff files are ready',timeout=120000)
  current=page.request.get(base+'/api/media/state').json();cut=[c for c in current['cuts'] if c['projectId']==project][-1]
  report['cutId']=cut['id'];report['outputAssetId']=cut['output'];report['timeline']=saved()
  check('Actual saved export contains the resolved coverage and 240 frames',cut['plan']['frames']==240 and len(cut['plan']['pictureClips'])==3 and 'timeline.otio' in cut['bridgeFiles'])
  (OUT/'preview.mp4').write_bytes(page.request.get(base+'/media/'+cut['output']).body())
  page.locator('#workspace-mode-edit').click();page.locator('#program-host').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'studio-desktop.png'))
  page.locator('.coverage-room').evaluate('(e)=>e.open=true');page.locator('#cut-canvas').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'studio-timeline.png'))
  page.evaluate('(id)=>localStorage.setItem("shutter.project",id)',project)
  page.goto(base+'/#edit',wait_until='domcontentloaded')
  expect(page.locator('#open-media-edit')).to_have_attribute('href','/media-studio?project='+project)
  page.locator('#open-media-edit').click();expect(page.locator('#editing')).to_be_visible()
  check('Original Edit page opens the new production in Studio without changing it',saved()['timeline']==covered['timeline'])
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'studio-mobile.png'),full_page=True)
  check('Mobile page contains the studio without horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('No uncaught browser exceptions',not report['pageErrors'])
  check('No provider endpoint was contacted',all(r['url'].startswith(base) or r['url'].startswith('blob:') for r in report['requests']))
  check('Original H3 files remain unchanged',all(hashlib.sha256((originals/a['filename']).read_bytes()).hexdigest()==digests[a['name']] for a in videos))
 finally:
  report['lastStatus']=page.locator('#status').inner_text() if page.locator('#status').count() else '';report['url']=page.url
  (OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
  page.screenshot(path=str(OUT/'last-state.png'))
  browser.close()
