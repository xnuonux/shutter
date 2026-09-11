"""Actual MemoryRoom modules, synthetic state/callbacks, no network or playback claims."""
from pathlib import Path
import json,re,hashlib,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
names=['text-edit.mjs','music-edit.mjs','memory-contract.mjs','memory-room.js','memory-room.css','media-studio.css']
source={name:(ROOT/'public'/name).read_text() for name in names}
report={'scope':'actual UI modules; fake API; all network aborted; not browser/server E2E','checks':[],'errors':[],'source_sha256':{k:hashlib.sha256(v.encode()).hexdigest() for k,v in source.items()}}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
 context=browser.new_context(viewport={'width':1240,'height':1050});context.route('**/*',lambda route:route.abort());page=context.new_page();page.set_default_timeout(5000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.set_content('<main style="max-width:1140px;margin:30px auto;padding:0 20px"><p class="eyebrow">SHUTTER / SYNTHETIC INTERFACE FIXTURE</p><h1>Find the moment.<br><em>Keep the performance.</em></h1><section id="memory" class="panel"></section><p id="status" style="position:static;margin:20px 0"></p></main>')
 page.add_style_tag(content=source['media-studio.css']+'\n'+source['memory-room.css'])
 namespaces={'text-edit.mjs':'Text','music-edit.mjs':'Edit','memory-contract.mjs':'Memory','memory-room.js':'Room'}
 for name,space in namespaces.items():
  code=source[name]
  for file,ns in namespaces.items():code=re.sub(r"import \{([^}]+)\} from './"+re.escape(file)+r"';",r'const {\1}=window.'+ns+';',code)
  exports=re.findall(r'export (?:function|class|const) (\w+)',code);page.evaluate('window.'+space+'=(()=>{'+code.replace('export ','')+';return {'+','.join(exports)+'}})()')
 page.evaluate('''()=>{
 window.project='demo';window.sourceId='asset_'+'b'.repeat(64);window.dirty=false;window.busy=false;window.messages=[];window.calls=[];window.notes=[];window.auditions=[];window.opens=[];
 window.assets=['a','b'].map((c,i)=>({id:'asset_'+c.repeat(64),name:i?'Alternate neon performance.mp4':'Original camera take.mp4',kind:'video',media:{kind:'video',duration:6}}));
 window.edit={format:'shutter-media-edit-v1',fps:'24',clips:[{id:'shot',assetId:assets[0].id,sourceStart:'0',frames:48,fit:'contain'}],soundtrack:{assetId:'master-do-not-change'}};window.record={revision:1,timeline:structuredClone(edit)};
 window.stack={id:'stack_demo',clipId:'shot',revision:0,timelineRevision:1,shotFrames:48,fps:'24',candidates:[]};
 window.notify=m=>{messages.push(m);document.querySelector('#status').textContent=m};
 if(!crypto.randomUUID){let n=0;crypto.randomUUID=()=> 'test-'+(++n)};window.confirm=()=>true;
 window.fakeApi=async(url,options={})=>{
 calls.push({url,method:options.method||'GET'});const input=options.body?JSON.parse(options.body):{};
 if(url.includes('/memory?')){const q=new URL('http://test'+url).searchParams.get('q');const found=notes.filter(n=>(n.label+' '+n.notes+' '+n.tags.join(' ')).toLowerCase().includes(q.toLowerCase()));const result={results:structuredClone(found),total:found.length,nextOffset:null};if(window.holdSearch===q)return new Promise(resolve=>window.releaseSearch=()=>resolve(result));return result;}
 if(url.endsWith('/memory')&&options.method==='POST'){const old=notes.find(n=>n.id===input.moment.id),m={...input.moment,revision:(old?.revision||0)+1,assetName:assets.find(a=>a.id===input.moment.assetId).name,evidence:'artist-authored'};notes=notes.filter(n=>n.id!==m.id);notes.push(m);return m;}
 if(url.includes('/memory/')&&options.method==='DELETE'){notes=notes.filter(n=>!url.endsWith(n.id));return {deleted:true};}
 if(url.endsWith('/memory-export'))return {moments:notes,stacks:[stack]};
 if(url.endsWith('/takes/shot')&&options.method==='POST'){
 const n=notes.find(n=>n.id===input.momentId);if(!stack.candidates.length)stack.candidates.push({id:'original',label:'Original selection',assetId:assets[0].id,sourceStart:'0/1',endUs:6000000,evidence:'saved-shot',fits:true,current:true});
 stack.candidates.push({id:n.id,label:n.label,assetId:n.assetId,sourceStart:n.startUs+'/1000000',endUs:n.endUs,momentId:n.id,momentRevision:n.revision,evidence:'artist-authored',fits:n.endUs-n.startUs>=2000000,current:false});stack.revision++;stack.timelineRevision=record.revision;return structuredClone(stack);}
 if(url.endsWith('/takes/shot/accept')){const c=stack.candidates.find(c=>c.id===input.candidateId);record={revision:record.revision+1,timeline:Memory.takeProposal(edit,'shot',c,assets.find(a=>a.id===c.assetId).media)};stack.timelineRevision=record.revision;for(const take of stack.candidates)take.current=take.id===c.id;return structuredClone(record);}
 if(url.endsWith('/takes/shot'))return structuredClone(stack);
 if(url.endsWith('/scout')){const result={id:'scout_fixture',sampledRanges:2,totalRanges:2,images:[{index:0,startUs:0,endUs:2000000,timeUs:1000000},{index:1,startUs:2000000,endUs:4000000,timeUs:3000000}]};if(window.holdScout)return new Promise(resolve=>window.releaseScout=()=>resolve(result));return result;}
 throw Error('Unexpected mock API '+url);
 };
 window.room=new Room.MemoryRoom({root:document.querySelector('#memory'),getEdit:()=>edit,getRecord:()=>record,getState:()=>({assets}),getSource:()=>sourceId,getProject:()=>project,isDirty:()=>dirty,isBusy:()=>busy,api:fakeApi,
 action:async fn=>{busy=true;try{return await fn()}catch(e){notify(e.message)}finally{busy=false}},notify,saveCut:async()=>{},applySaved:r=>{record=r;edit=structuredClone(r.timeline);dirty=false;room.update()},audition:(shot,c)=>auditions.push({shot,c}),clearAudition:()=>auditions.push({end:true}),openSource:(id,start,end)=>opens.push({id,start,end}),getSourceTime:()=>1.000001});
 room.download=(s,name)=>window.download={s,name};room.update();document.querySelector('.memory-room').open=true;
 }''')
 page.wait_for_function('calls.length>0')
 def check(name,expr):
  assert page.evaluate(expr),name;report['checks'].append(name);print(name,flush=True)
 def fill(label,start='0',end='4',notes='Useful performance. Original remains intact.'):
  page.evaluate("document.querySelector('.memory-author').open=true");page.click('#memory-new');page.fill('#memory-in',start);page.fill('#memory-out',end);page.fill('#memory-label',label);page.fill('#memory-notes',notes);page.fill('#memory-tags','night, close-up')
 check('opening memory does not mutate the saved cut','record.revision===1&&stack.candidates.length===0&&edit.clips[0].assetId===assets[0].id')
 fill('Night close-up','1.000001','4.000001');page.click('#memory-save');page.wait_for_function('notes.length===1&&!busy')
 check('saving words keeps exact microsecond boundaries','notes[0].startUs===1000001&&notes[0].endUs===4000001&&notes[0].evidence==="artist-authored"')
 page.click('[data-note]');page.fill('#memory-label','Night close-up, revised');page.click('#memory-save');page.wait_for_function('notes[0].revision===2')
 check('editing only a label does not round stored timing to milliseconds','notes[0].startUs===1000001&&notes[0].endUs===4000001')
 page.click('[data-peek]');check('found moment opens the source at its own in/out','opens.at(-1).start===1.000001&&opens.at(-1).end===4.000001')
 page.click('[data-collect]');page.wait_for_function('stack.candidates.length===2&&!busy')
 check('collecting preserves an original alternative without changing edit','stack.candidates[0].id==="original"&&record.revision===1&&edit.clips[0].assetId===assets[0].id')
 page.locator('[data-audition]').nth(1).click();check('audition targets the chosen shot without saving it','auditions.at(-1).shot==="shot"&&record.revision===1&&document.querySelector("#memory-stack-status").textContent.includes("AUDITIONING")')
 page.locator('[data-accept]').nth(1).click();page.wait_for_function('record.revision===2&&!busy')
 check('explicit acceptance preserves cut length and master','edit.clips[0].assetId===assets[1].id&&edit.clips[0].frames===48&&edit.soundtrack.assetId==="master-do-not-change"')
 page.evaluate('dirty=true;room.update()');check('dirty cut disables old take decisions until reloaded','[...document.querySelectorAll("[data-accept],[data-audition]")].every(b=>b.disabled)&&document.querySelector("#memory-stack-status").textContent.includes("changed")')
 page.evaluate('dirty=false;room.update()');page.click('#memory-original');check('end-audition control is non-destructive','auditions.at(-1).end&&record.revision===2')
 fill('Too short','0','0.001');page.click('#memory-save');page.wait_for_function('notes.length===2&&!busy');page.locator('[data-collect]').nth(1).click();page.wait_for_function('stack.candidates.length===3&&!busy')
 check('short alternative is retained but its action buttons are disabled','document.querySelectorAll("[data-accept]")[2].disabled&&document.querySelectorAll("[data-audition]")[2].disabled')
 page.click('#memory-new');page.fill('#memory-label','Not yet saved');page.click('#memory-load-stack');check('unfinished form cannot be silently ignored for a take operation','room.pending&&messages.at(-1).includes("Save or discard")')
 page.click('#memory-discard');page.fill('#memory-in','0');page.fill('#memory-out','4');page.click('#memory-scout');page.wait_for_function('room.scout!==null&&!busy')
 check('scout presents range evidence without automatically saving notes','document.querySelectorAll(".scout-tile").length===2&&notes.length===2')
 page.click('[data-range="1"]');check('scout selection fills a range for review rather than inventing its content','document.querySelector("#memory-in").value==="2.000000"&&document.querySelector("#memory-out").value==="4.000000"&&room.pending&&notes.length===2')
 page.click('#memory-discard');fill('<img id=attack src=x onerror=window.attacked=true>');page.click('#memory-save');page.wait_for_function('notes.length===3&&!busy')
 check('HTML-shaped source descriptions remain plain text','!document.querySelector("#attack")&&!window.attacked&&document.querySelectorAll(".memory-card")[2].textContent.includes("<img")')
 # Older result must never replace the latest query result.
 page.evaluate('()=>{holdSearch="Night";document.querySelector("#memory-query").value="Night";window.slow=room.search()}');page.wait_for_function('typeof releaseSearch==="function"')
 page.evaluate('async()=>{document.querySelector("#memory-query").value="Too short";await room.search();releaseSearch();await slow;}')
 check('late search response cannot replace a newer query','room.results.length===1&&room.results[0].label==="Too short"')
 page.evaluate('holdSearch=null;document.querySelector("#memory-query").value=""');page.click('#memory-search')
 page.click('#memory-export');check('notebook export carries metadata without changing timeline','JSON.parse(download.s).moments.length===3&&record.revision===2')
 page.evaluate('()=>{holdScout=true;document.querySelector("#memory-in").value="0";document.querySelector("#memory-out").value="4";window.previousScout=room.scout;window.slowScout=room.scoutRange()}');page.wait_for_function('typeof releaseScout==="function"')
 page.evaluate('async()=>{document.querySelector("#memory-in").value="1";releaseScout();await slowScout;}')
 check('late scout from edited range cannot become the current analysis','room.scout===previousScout')
 # Project identity invalidates asynchronous query state.
 page.evaluate('()=>{holdSearch="Night";document.querySelector("#memory-query").value="Night";window.slowProject=room.search()}');page.wait_for_function('typeof releaseSearch==="function"')
 page.evaluate('async()=>{project="another";room.update();releaseSearch();await slowProject;}')
 check('late result cannot attach to another production','room.results.length===0&&room.stack===null')
 page.evaluate('project="demo";room.update();holdSearch=null;document.querySelector("#memory-query").value=""');page.click('#memory-search');page.click('#memory-load-stack')
 page.evaluate('''async()=>{notes[1].label='Brief reaction · limited source';notes[2].label='Blue-hour wide';notes[2].notes='Hold through the final line.';stack.candidates[2].label=notes[1].label;await room.search();await room.loadStack();document.querySelector('#status').textContent='Synthetic interface fixture · no camera media or audio is playing.';}''')
 page.set_viewport_size({'width':390,'height':844});check('mobile controls stay inside viewport','document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'production-memory-mobile.png'),full_page=True)
 page.set_viewport_size({'width':1240,'height':1050});page.evaluate('document.querySelector(".memory-author").open=false');page.screenshot(path=str(OUT/'production-memory-desktop.png'),full_page=True)
 check('no uncaught component exceptions','true' if not report['errors'] else 'false');browser.close()
report['passed']=len(report['checks']);(OUT/'memory-dom-checks.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
