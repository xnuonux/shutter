"""Isolated DOM fixture checks, NOT network E2E or playback certification.
Uses the actual UI source in an empty Chromium document with a fake API/storage.
All network requests are aborted. No policy or browser security setting is changed.
Requires optional Python Playwright + a local Chromium executable (not app deps).
"""
import json, re, math, os, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
source={name:(ROOT/'public'/name).read_text() for name in ['music-edit.mjs','edit-recovery.mjs','music-room.js','media-studio.js','media-studio.html','media-studio.css','music-room.css']}
html=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>', '', source['media-studio.html'],flags=re.S)
assets=[dict(id='asset_'+str(i)*64,name=name,kind=kind,mime=mime,bytes=300000,media=dict(kind=kind,width=640,height=360,duration=10,audio=[dict(sampleRate=48000,bits=24,channels=2)] if kind=='audio' else [],fps=dict(n=24,d=1))) for i,name,kind,mime in [(1,'Night performance.mp4','video','video/mp4'),(2,'Moonlight closeup.mp4','video','video/mp4'),(3,'Finished master.wav','audio','audio/wav'),(4,'Cover portrait.png','image','image/png')]]
timeline=dict(format='shutter-media-edit-v1',fps='24',width=1920,height=1080,clips=[dict(id='shot_'+str(i),assetId=assets[i-1]['id'],sourceStart='0',frames=48,fit='contain') for i in [1,2]]+[dict(id='photo',assetId=assets[3]['id'],sourceStart='0',frames=48,fit='cover')],soundtrack=dict(assetId=assets[2]['id'],tailPolicy='pad-silence'),colorPolicy='unmanaged-sdr',audioPolicy='soundtrack-or-silence',cadencePolicy='wallclock-nearest',music=dict(schema='shutter-music-map-v1',bpm='96',beatsPerBar=4,beatUnit=4,offsetFrames=0),markers=[dict(id='chorus',frame=72,label='First chorus',kind='chorus')])
record=dict(id='timeline_demo',projectId='demo',revision=1,timeline=timeline,plan=dict(hash='fixture-hash-1'))
state=dict(assets=assets,productions=[dict(id='demo',title='Midnight / Music Cut')],timelines=[record],cuts=[],derivations=[])
peaks=[]
for c in range(2):
 p=[]
 for i in range(500):
  amplitude=(0.2+0.65*abs(math.sin(i*.017)))*(0.45+0.55*abs(math.sin(i*.19+c)))
  p.extend([-amplitude,amplitude])
 peaks.append(p)
wave=dict(channels=2,sampleRate=48000,samplesPerBin=960,sampleFrames=480000,peaks=peaks)
report={'scope':'isolated DOM fixtures; fake API/storage; no media playback or server/browser E2E','checks':[],'errors':[],'source_sha256':{name:hashlib.sha256(text.encode()).hexdigest() for name,text in source.items()}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=browser.new_context(viewport=dict(width=1440,height=1100),device_scale_factor=1)
 context.route('**/*',lambda route:route.abort())
 page=context.new_page();page.on('pageerror',lambda error:report['errors'].append(str(error)))
 page.set_content(html);page.add_style_tag(content=source['media-studio.css']+'\n'+source['music-room.css'])
 page.evaluate('''({state,record,wave})=>{
 window.fixtureState=state;window.fixtureRecord=record;window.fixtureWave=wave;window.fixtureStorage=new Map();
 Object.defineProperty(window,'localStorage',{value:{getItem:k=>fixtureStorage.get(k)||null,setItem:(k,v)=>fixtureStorage.set(k,String(v)),removeItem:k=>fixtureStorage.delete(k)}});
 history.replaceState=()=>{};window.confirm=()=>true;window.prompt=()=> 'Visual hit';
 if(!crypto.randomUUID){let n=0;crypto.randomUUID=()=> 'fixture-'+(++n);}
 window.fetch=async(url,options={})=>{let data;
 if(url==='/api/media/state')data=fixtureState;
 else if(url==='/api/media/health')data={tools:{ffmpeg:'fixture',ffprobe:'fixture'}};
 else if(url.endsWith('/waveform'))data=fixtureWave;
 else if(url==='/api/media/productions/demo/timeline'){
  if(options.method==='PUT'){const input=JSON.parse(options.body);if(input.baseRevision!==fixtureRecord.revision)return {ok:false,status:409,json:async()=>({error:'revision_conflict'})};fixtureRecord={...fixtureRecord,revision:fixtureRecord.revision+1,timeline:input.timeline,plan:{hash:'fixture-hash-'+(fixtureRecord.revision+1)}};}
  data=fixtureRecord;
 }else throw Error('Unexpected fixture URL '+url);
 return {ok:true,status:200,json:async()=>structuredClone(data)};
 };
 }''',dict(state=state,record=record,wave=wave))
 for filename,name in [('music-edit.mjs','TestEdit'),('edit-recovery.mjs','TestRecovery')]:
  exports=re.findall(r'export (?:function|class|const) (\w+)',source[filename])
  page.evaluate('window.'+name+'=(()=>{'+source[filename].replace('export ','')+';return {'+','.join(exports)+'};})()')
 room=re.sub(r"import \{([^}]+)\} from './music-edit.mjs';",r'const {\1}=window.TestEdit;',source['music-room.js']).replace('export class','class')
 page.evaluate('window.TestRoom=(()=>{'+room+';return {MusicRoom};})()')
 main=source['media-studio.js']
 for file,namespace in [('music-room.js','TestRoom'),('music-edit.mjs','TestEdit'),('edit-recovery.mjs','TestRecovery')]:
  main=re.sub(r"import \{([^}]+)\} from './"+re.escape(file)+r"';",r'const {\1}=window.'+namespace+';',main)
 main+='\nwindow.fixtureApi={room,loadProject,offerRecovery,getDraft:()=>draft,getRecord:()=>record};'
 page.evaluate('(async()=>{'+main+'})()')
 page.evaluate("fixtureApi.loadProject('demo')")
 def check(name,expression):
  assert page.evaluate(expression),name;report['checks'].append(name)
 check('actual modules boot and draw the selected production',"document.querySelector('#project-title').textContent==='Midnight / Music Cut'")
 page.evaluate('fixtureApi.room.seek(24)');page.click('#cut-split')
 check('split button performs atomic picture split',"fixtureApi.getDraft().clips.length===4 && fixtureApi.getDraft().clips[0].frames===24 && fixtureApi.getDraft().clips[1].frames===24")
 check('local recovery binds unsaved draft to current saved revision',"JSON.parse([...fixtureStorage.values()][0]).baseRevision===1")
 page.click('#undo');check('undo restores local draft without fake server save',"fixtureApi.getDraft().clips.length===3 && fixtureApi.getRecord().revision===1")
 page.click('#redo');check('redo restores local split',"fixtureApi.getDraft().clips.length===4")
 page.click('#save');check('explicit save clears recovery and advances saved revision',"fixtureApi.getRecord().revision===2 && fixtureStorage.size===0")
 page.evaluate("document.querySelector('.music-map').open=true")
 page.fill('#song-bpm','73');page.click('#song-apply');check('song-map controls persist an explicit tempo',"fixtureApi.getDraft().music.bpm==='73/1'")
 page.fill('#asset-search','portrait');check('material search narrows assets',"document.querySelectorAll('#assets [data-asset]').length===1")
 check('library events do not attach source-selection handlers to program media',"document.querySelector('#cut-video').onclick===null && document.querySelector('#cut-audio').onclick===null")
 page.fill('#asset-search','');page.evaluate('fixtureApi.room.seek(180)');page.click('#add-cue')
 check('cue can be placed on the song beyond current picture',"fixtureApi.getDraft().markers.some(m=>m.frame===180&&m.label==='Visual hit')")
 check('no picture beyond the cut is displayed as a frozen ending',"document.querySelector('#cut-empty').hidden===false")
 page.evaluate("fixtureApi.room.seek(12);document.querySelector('.music-map').open=false")
 page.screenshot(path=str(OUT/'music-cut-dom-desktop.png'),full_page=True)
 page.set_viewport_size(dict(width=390,height=844))
 page.screenshot(path=str(OUT/'music-cut-dom-mobile.png'),full_page=True)
 check('mobile page avoids horizontal viewport overflow',"document.documentElement.scrollWidth <= innerWidth+1")
 # Simulate a newer saved revision while the earlier draft is retained. No real API involved.
 page.evaluate("fixtureRecord.revision++;fixtureRecord.plan.hash='newer-revision';fixtureApi.getDraft().clips.length;window.confirm=()=>false")
 # A separate recovery pure test verifies exact revision binding; component tests target UI locks.
 page.evaluate("const key=TestRecovery.recoveryKey('demo');const local=JSON.parse(fixtureStorage.get(key));local.baseRevision=0;fixtureStorage.set(key,JSON.stringify(local));fixtureApi.offerRecovery()")
 check('conflicting recovery blocks edit commands without discarding the draft',"document.querySelector('#editing').inert && !document.querySelector('#recovery-notice').hidden && !document.querySelector('#restore-draft')")
 page.evaluate('window.conflictDraftBefore=JSON.stringify(fixtureApi.getDraft())');page.keyboard.press('Control+z')
 check('keyboard cannot mutate a conflicted recovery state',"document.querySelector('#editing').inert && JSON.stringify(fixtureApi.getDraft())===window.conflictDraftBefore")
 check('no uncaught UI exceptions',str(len(report['errors'])==0).lower())
 browser.close()
report['passed']=len(report['checks']);(OUT/'music-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
