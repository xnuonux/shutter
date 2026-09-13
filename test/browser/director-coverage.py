"""Actual source-backed cutaway across a main-shot boundary, including playback and export."""
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,os,io,wave,subprocess

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'work/director-coverage';OUT.mkdir(parents=True,exist_ok=True)
base=os.environ.get('SHUTTER_REVIEW_URL','http://127.0.0.1:4688')
report={'checks':[],'errors':[],'requests':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ['SHUTTER_TEST_CHROMIUM'],headless=True)
 page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(12000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('request',lambda r:report['requests'].append({'method':r.method,'url':r.url}))
 def check(name,value):
  assert value,name;report['checks'].append(name);print(name,flush=True)
 def api(url,body=None,method='POST'):
  r=page.request.fetch(base+url,method=method,data=body);assert r.ok,r.text();return r.json()
 def seek(frame):
  page.locator('#cut-home').click();page.locator('#cut-next').evaluate('(el,n)=>{for(let i=0;i<n;i++)el.click()}',frame)
  expect(page.locator('#cut-frame')).to_contain_text(f'frame {frame} /')
 def picture(asset,time):
  video=page.locator('#program-host video');expect(video).to_have_attribute('data-asset',asset)
  try:page.wait_for_function('([id,t])=>{const v=document.querySelector("#program-host video");return v.dataset.asset===id&&v.readyState>=2&&Math.abs(v.currentTime-t)<0.06}',arg=[asset,time])
  except Exception:
   print({'wanted':time,'video':video.evaluate('(v)=>({asset:v.dataset.asset,time:v.currentTime,ready:v.readyState})')},flush=True);raise
 try:
  state=api('/api/media/state',method='GET');videos=[a for a in state['assets'] if a['kind']=='video' and (a.get('media') or {}).get('duration',0)>=4];a,b=videos[:2]
  audio=io.BytesIO()
  with wave.open(audio,'wb') as wav:wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(bytes(192000*4))
  response=page.request.post(base+'/api/media/assets?name=Four-second%20timing%20reference.wav',data=audio.getvalue(),headers={'content-type':'application/octet-stream'});assert response.ok;song=response.json()
  made=api('/api/media/productions',{'title':'The storm · timed cutaway','fps':'24','width':768,'height':512});project=made['production']['id'];report['projectId']=project
  edit=made['timeline']['timeline'];edit['clips']=[{'id':'opening','assetId':a['id'],'sourceStart':'0','frames':48,'fit':'contain'},{'id':'continuation','assetId':a['id'],'sourceStart':'2','frames':48,'fit':'contain'}];edit['soundtrack']={'assetId':song['id'],'tailPolicy':'pad-silence'}
  before=api(f'/api/media/productions/{project}/timeline',{'baseRevision':1,'timeline':edit},'PUT')
  api(f'/api/media/productions/{project}/memory',{'baseRevision':0,'moment':{'id':'storm_'+project,'assetId':b['id'],'startUs':1000000,'endUs':4000000,'label':'The storm from another angle','notes':'Review action timing and the orb’s position against the main view.','tags':['storm']}})
  page.goto(base+'/media-studio?project='+project,wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible();page.locator('#tool-director').click()
  page.locator('#direction-goal').fill('Carry the action through the cut without stopping time.');page.locator('#direction-continuity').fill('Match the orb and hand position across entry and return.');page.locator('#direction-query').fill('storm')
  page.locator('#direction-mode').select_option('coverage');page.locator('#direction-coverage-at').fill('36');page.locator('#direction-coverage-end').fill('60');page.locator('#direction-source-offset').fill('0.5')
  page.locator('#direction-plan').click();expect(page.locator('[data-direction-candidate]')).to_have_count(1);page.locator('[data-direction-candidate]').click()
  expect(page.locator('#direction-review')).to_contain_text('2.50');check('Director shows the scene interval and elapsed return before acceptance',api(f'/api/media/productions/{project}/timeline',method='GET')==before)
  page.locator('#direction-audition').click();expect(page.locator('#program-host')).to_have_attribute('data-audition','true')
  for frame,asset,t in [(35,a['id'],35/24),(36,b['id'],1.5),(59,b['id'],1.5+23/24),(60,a['id'],2.5)]:seek(frame);picture(asset,t)
  check('Audition enters at frame 36 and returns to the main source at elapsed frame 60',api(f'/api/media/productions/{project}/timeline',method='GET')==before)
  seek(42);picture(b['id'],1.75);page.locator('.tool-body').evaluate('(el)=>el.scrollTop=0');page.screenshot(path=str(OUT/'cutaway-audition.png'))
  page.locator('#direction-end-audition').click();picture(a['id'],1.75)
  page.locator('#direction-reviewed').check();page.locator('[data-continuity-check]').check();expect(page.locator('#direction-apply')).to_be_disabled();page.locator('#direction-aligned').check();expect(page.locator('#direction-apply')).to_be_enabled()
  check('Source-to-scene alignment is a separate explicit review decision',page.locator('#direction-apply').is_enabled())
  page.locator('#direction-apply').click();expect(page.locator('#status')).to_contain_text('Cutaway accepted');accepted=api(f'/api/media/productions/{project}/timeline',method='GET')
  check('Acceptance adds only the cutaway and preserves all main footage and sound',accepted['timeline']['clips']==before['timeline']['clips'] and accepted['timeline']['soundtrack']==before['timeline']['soundtrack'] and accepted['timeline']['coverage'][0]['at']==36 and accepted['timeline']['coverage'][0]['frames']==24)
  seek(36);picture(b['id'],1.5);seek(60);picture(a['id'],2.5);check('Accepted Program playback follows the same source alignment as audition',True)
  page.reload(wait_until='domcontentloaded');expect(page.locator('#editing')).to_be_visible();page.locator('#tool-director').click();expect(page.locator('#direction-mode')).to_have_value('coverage');expect(page.locator('#direction-source-offset')).to_have_value('0.5')
  check('Cutaway interval and source alignment survive reopening',page.locator('#direction-coverage-end').input_value()=='60')
  page.locator('#workspace-mode-deliver').click();page.locator('#color-consent').check();page.locator('#render').click();expect(page.locator('#delivery video')).to_be_visible(timeout=60000)
  output=api('/api/media/state',method='GET')['cuts'];cut=next(c for c in reversed(output) if c['projectId']==project)
  (OUT/'cutaway-proof.mp4').write_bytes(page.request.get(base+'/media/'+cut['output']).body());report['cutId']=cut['id']
  check('The accepted cutaway exports through the real local renderer', (OUT/'cutaway-proof.mp4').stat().st_size>1000)
  probe=json.loads(subprocess.check_output([os.environ['SHUTTER_FFPROBE'],'-v','error','-count_frames','-show_streams','-of','json',str(OUT/'cutaway-proof.mp4')],text=True));v=next(s for s in probe['streams'] if s['codec_type']=='video');sound=next(s for s in probe['streams'] if s['codec_type']=='audio')
  check('Decoded export retains 96 video frames and the four-second stereo soundtrack',int(v['nb_read_frames'])==96 and abs(float(v['duration'])-4)<0.001 and sound['channels']==2 and abs(float(sound['duration'])-4)<0.001);report['exportProbe']=probe
  page.locator('#workspace-mode-edit').click();page.locator('#undo').click();expect(page.locator('#status')).to_contain_text('undo saved');check('Saved undo restores the exact edit from before the cutaway',api(f'/api/media/productions/{project}/timeline',method='GET')['timeline']==before['timeline'])
  page.locator('#direction-plan').click();expect(page.locator('[data-direction-candidate]')).to_have_count(1);page.locator('[data-direction-candidate]').click();page.locator('#direction-brief').evaluate('(el)=>el.open=true');page.locator('#direction-source-offset').fill('1');expect(page.locator('#direction-apply')).to_be_disabled()
  check('Changing source alignment invalidates the reviewed proposal',page.locator('#direction-status').inner_text().startswith('Direction changed'))
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(OUT/'cutaway-mobile.png'),full_page=True);check('Cutaway controls fit a mobile workspace',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  check('No uncaught browser errors',not report['errors']);check('No paid provider or generation request',all(r['url'].startswith(base) or r['url'].startswith('blob:') for r in report['requests']) and not any(r['method']=='POST' and any(s in r['url'] for s in ['/inserts','/submit','/quote']) for r in report['requests']))
 finally:
  page.screenshot(path=str(OUT/'last-state.png'));(OUT/'receipt.json').write_text(json.dumps(report,indent=2),encoding='utf-8');browser.close()
