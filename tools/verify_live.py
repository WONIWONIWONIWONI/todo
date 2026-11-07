"""Wait for a specific version; a timeout preserves valid source and its draft."""
import os
import json
from pathlib import Path
import re
import time
import urllib.request
ROOT=Path(__file__).resolve().parent.parent
want=os.environ.get('RELEASE_VERSION') or re.search(r'app\.js\?v=(\d+)',(ROOT/'index.html').read_text())[1]
urls=os.environ['VERIFY_URLS'].split() if os.environ.get('VERIFY_URLS') else json.loads((ROOT/'deployment.json').read_text())['sites'][:1]
pending=set(urls)
for attempt in range(48):
    for url in list(pending):
        try:
            request=urllib.request.Request(url+'?verify='+str(time.time()),headers={'User-Agent':'rescene-release-check'})
            with urllib.request.urlopen(request,timeout=10) as r: text=r.read().decode()
            if f'app.js?v={want}' in text: pending.remove(url)
        except Exception: pass
    if not pending: print('Published version verified:',want);break
    time.sleep(5)
else: raise SystemExit('Deployment not verified; source preserved. Retry: '+', '.join(pending))
