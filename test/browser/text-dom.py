"""Actual Finish UI, fake state/callbacks, all network aborted. Not playback certification."""
from pathlib import Path
import json,re,hashlib,os,base64
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
source={f:(ROOT/'public'/f).read_text() for f in ['text-edit.mjs','text-room.js','text-room.css','media-studio.css','music-room.css']}
report={'scope':'actual TextRoom modules with synthetic state/callbacks; networking aborted; no server or playback qualification','checks':[],'errors':[], 'source_sha256':{f:hashlib.sha256(s.encode()).hexdigest() for f,s in source.items()}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=browser.new_context(viewport={'width':1180,'height':1140});context.route('**/*',lambda r:r.abort());page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.set_content('<main style="max-width:1060px;margin:28px auto;padding:0 20px"><p class="eyebrow">SHUTTER / SYNTHETIC UI FIXTURE</p><h1>Your song. Your picture. Your words.</h1><p class="small">Finish · editable titles and captions</p><div id="monitor" class="program-view" style="position:relative;width:100%;max-width:560px;height:315px;background:#14151d;overflow:hidden"></div><div id="text"></div><p id="status"></p></main>')
 page.add_style_tag(content=source['media-studio.css']+'\n'+source['music-room.css']+'\n'+source['text-room.css']+'\n#status{position:static;margin-top:18px}')
 code=source['text-edit.mjs'];exports=re.findall(r'export (?:function|class|const) (\w+)',code);page.evaluate('window.Contract=(()=>{'+code.replace('export ','')+';return {'+','.join(exports)+'}})()')
 code=re.sub(r"import \{([^}]+)\} from './text-edit.mjs';",r'const {\1}=window.Contract;',source['text-room.js']).replace('export ','');page.evaluate('()=>{window.TextModule=(()=>{'+code+';return {TextRoom,paintDraftText}})()}')
 page.evaluate('''()=>{
 window.messages=[];window.historyEdits=[];window.proofCalls=[];window.downloads=[];window.frame=0;window.project='demo';window.busy=false;
 window.edit={format:'shutter-media-edit-v1',fps:'24/1',width:1280,height:720,clips:[{id:'shot-a',frames:96},{id:'shot-b',frames:96}],soundtrack:{assetId:'untouched-master'}};
 window.initialPicture=JSON.stringify(edit.clips);window.initialSound=JSON.stringify(edit.soundtrack);
 if(!crypto.randomUUID){let n=0;crypto.randomUUID=()=> 'fixture-'+(++n);}
 window.repaint=()=>TextModule.paintDraftText(document.querySelector('#monitor'),edit,frame);
 window.room=new TextModule.TextRoom({root:document.querySelector('#text'),getEdit:()=>edit,getFrame:()=>frame,getProject:()=>project,isBusy:()=>busy,notify:m=>{messages.push(m);document.querySelector('#status').textContent=m},seek:f=>{frame=f;repaint()},onEdit:next=>{historyEdits.push(edit);edit=next;room.update();repaint()},reviewFrame:async f=>{proofCalls.push(f);const result={revision:12,frame:f,imageAssetId:'proof-asset',planHash:'synthetic-ui-plan'};if(window.holdProof)return new Promise(resolve=>window.releaseProof=()=>resolve(result));return result;}});
 room.download=(content,name,type)=>downloads.push({content,name,type});room.update();repaint();document.querySelector('.text-room').open=true;
 }''')
 def check(name,expr):
  assert page.evaluate(expr),name;report['checks'].append(name)
 def add(kind,start,end,text):
  page.click('#text-new');page.select_option('#text-kind',kind);page.fill('#text-start',str(start));page.fill('#text-end',str(end));page.fill('#text-words',text);page.click('#text-apply')
 check('old edit opens without adding a text layer','edit.textLayer===undefined&&historyEdits.length===0')
 page.fill('#text-words','Unapplied words');check('typing does not mutate the composition','room.pending&&edit.textLayer===undefined')
 page.click('#text-proof');check('proof cannot silently ignore unfinished form','proofCalls.length===0&&messages.at(-1).includes("Apply or discard")')
 page.click('#text-discard');add('title',0,48,'SHUTTER\nYOUR OWN CUT')
 check('title authoring leaves original picture and song untouched','edit.textLayer.cues.length===1&&edit.textLayer.cues[0].kind==="title"&&JSON.stringify(edit.clips)===initialPicture&&JSON.stringify(edit.soundtrack)===initialSound')
 add('caption',24,72,'One song. One picture.')
 page.evaluate('frame=24;repaint()');check('draft monitor shows captions and titles in their shared interval','document.querySelectorAll(".draft-text").length===2&&document.querySelector(".text-sidecar-note").textContent.includes("SIDECAR")')
 page.select_option('#text-delivery','burn-and-sidecar');check('burn is explicit and removes sidecar-only monitor label','edit.textLayer.captionDelivery==="burn-and-sidecar"&&!document.querySelector(".text-sidecar-note")')
 page.evaluate('frame=72;repaint()');check('exclusive caption ending removes text on that frame','document.querySelectorAll(".draft-text").length===0')
 page.fill('#text-find','one song');check('word search narrows the cue list','document.querySelectorAll(".text-cue").length===1')
 page.click('[data-text-select]');check('cue selection seeks to its exact start','frame===24&&room.selected===edit.textLayer.cues[1].id')
 page.fill('#text-words','One song. A new picture.');page.click('#text-apply');check('update edits the existing cue rather than appending','edit.textLayer.cues.length===2&&edit.textLayer.cues[1].text.includes("new picture")')
 page.click('#text-srt');page.click('#text-vtt');check('downloads contain caption text but not title','downloads.length===2&&downloads[0].content.includes("new picture")&&!downloads[0].content.includes("SHUTTER")&&downloads[1].content.startsWith("WEBVTT")')
 page.fill('#text-find','');page.evaluate("document.querySelector('.text-import').open=true")
 page.set_input_files('#text-file',{'name':'review.srt','mimeType':'text/plain','buffer':b'1\n00:00:03,000 --> 00:00:04,000\nImported words\n'})
 page.wait_for_function('room.importCandidate!==null');check('file selection creates a review, not an immediate edit','edit.textLayer.cues.length===2&&document.querySelector("#text-import-preview").textContent.includes("1 cues")')
 page.click('#text-import-apply');check('applying the import appends frame-quantized captions','edit.textLayer.cues.length===3&&edit.textLayer.cues[2].startFrame===72&&edit.textLayer.cues[2].endFrame===96')
 page.set_input_files('#text-file',{'name':'bad.vtt','mimeType':'text/vtt','buffer':b'WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nStyled\n'})
 page.wait_for_function('document.querySelector("#text-import-preview").textContent.includes("not applied")')
 check('unsupported style is rejected atomically','room.importCandidate===null&&document.querySelector("#text-import-apply").disabled&&edit.textLayer.cues.length===3')
 page.set_input_files('#text-file',{'name':'replace.vtt','mimeType':'text/vtt','buffer':b'WEBVTT\n\n00:02.000 --> 00:03.000\nA &amp; B\n'})
 page.wait_for_function('room.importCandidate!==null');page.select_option('#text-import-mode','replace-captions');page.click('#text-import-apply')
 check('replace-caption operation retains the authored title','edit.textLayer.cues.length===2&&edit.textLayer.cues[0].kind==="title"&&edit.textLayer.cues[1].text==="A & B"')
 page.evaluate("frame=48;repaint()");page.click('#text-proof');page.wait_for_function('room.review!==null')
 check('proof requests the selected global frame','proofCalls.at(-1)===48&&document.querySelector("#text-proof-result").textContent.includes("Revision 12, output frame 48")')
 page.select_option('#text-delivery','sidecar');check('changing delivery marks prior proof historical','document.querySelector("#text-proof-result").textContent.includes("HISTORICAL")')
 page.click('#text-proof');page.wait_for_function('!document.querySelector("#text-proof-result").textContent.includes("HISTORICAL")')
 check('unchanged refreshed proof is visibly current','room.review.signature===JSON.stringify(edit)')
 # Hold one read, reject a newer oversized selection, and ensure the late first file stays discarded.
 page.evaluate('''()=>{window.slowImport=room.readImport({name:'slow.srt',size:50,arrayBuffer:()=>new Promise(resolve=>window.releaseImport=()=>resolve(new TextEncoder().encode('1\\n00:00:05,000 --> 00:00:06,000\\nToo late').buffer))});}''')
 page.evaluate("async()=>{try{await room.readImport({name:'huge.srt',size:1048577})}catch{};releaseImport();await slowImport;}")
 check('new invalid selection invalidates an older in-flight import','room.importCandidate===null&&document.querySelector("#text-import-apply").disabled')
 # Show literal markup as text, never HTML, in both cue list and draft monitor.
 add('title',120,144,'<img id=attack src=x onerror=window.attacked=true>')
 page.evaluate('frame=120;repaint()');check('title markup is literal rather than executable','!window.attacked&&!document.querySelector("#attack")&&document.querySelector(".draft-text").textContent.startsWith("<img")')
 page.evaluate('frame=0;repaint();holdProof=true');page.click('#text-proof');page.wait_for_function('typeof releaseProof==="function"')
 page.evaluate('project="other";room.update();releaseProof()');page.wait_for_timeout(10)
 check('late proof cannot attach to another production','room.review===null&&document.querySelector("#text-proof-result").children.length===0')
 page.evaluate('holdProof=false;project="demo";room.update();frame=0;repaint()')
 # A genuine locally rendered proof is embedded only inside the synthetic UI fixture.
 if (OUT/'demo'/'compositor-frame.png').exists():
  demo=json.loads((OUT/'demo'/'demo-record.json').read_text());data='data:image/png;base64,'+base64.b64encode((OUT/'demo'/'compositor-frame.png').read_bytes()).decode()
  page.evaluate('''({data,demo})=>{edit=demo.timeline;frame=demo.proof.frame;room.selected='lyric-one';room.update();document.querySelector('#monitor').innerHTML='<img alt="Actual locally rendered synthetic composition" style="height:100%;width:100%;object-fit:contain">';document.querySelector('#monitor img').src=data;room.review={...demo.proof,signature:JSON.stringify(edit)};room.showProof();document.querySelector('#text-proof-result img').src=data;document.querySelector('#text-import-preview').textContent='Choose a file to inspect before applying it.';document.querySelector('#status').textContent='Synthetic render · actual local compositor output. Surrounding interface state is a test fixture.';}''',{'data':data,'demo':demo})
 page.evaluate('document.querySelector(".text-import").open=false')
 page.set_viewport_size({'width':390,'height':844});check('mobile Finish workspace stays inside viewport','document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'finish-text-dom-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1180,'height':1140});page.screenshot(path=str(OUT/'finish-text-dom-desktop.png'),full_page=True)
 check('no uncaught UI exceptions','true' if not report['errors'] else 'false');browser.close()
report['passed']=len(report['checks']);(OUT/'text-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
