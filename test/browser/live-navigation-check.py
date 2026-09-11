"""One ordinary localhost navigation. Stop on administrative denial; no workaround."""
from pathlib import Path
import subprocess,json,os,select
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'verification'
server=subprocess.Popen(['node','--loader','./test/helpers/media-server-loader.mjs','./test/helpers/media-http-server.mjs'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
report={'scope':'ordinary navigation to disposable parent server; provider/3D modules disabled by test loader','policy_changes':False,'playback_qualified':False}
try:
 if not select.select([server.stdout],[],[],12)[0]:raise RuntimeError('server startup timeout')
 info=json.loads(server.stdout.readline());url=f'http://127.0.0.1:{info["port"]}/media-studio'
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('SHUTTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True)
  page=browser.new_page()
  try:
   response=page.goto(url,wait_until='domcontentloaded',timeout=15000)
   report.update(status='navigation-succeeded',http_status=response.status if response else None,title=page.title())
  except Exception as e:report.update(status='navigation-failed',error=str(e))
  browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=8)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'live-navigation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
