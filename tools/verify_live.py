"""Verify a published app version, selected static data, and optional mirror SHA."""
import json
import os
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
config = json.loads((ROOT / 'deployment.json').read_text(encoding='utf-8'))
want = os.environ.get('RELEASE_VERSION') or re.search(
    r'app\.js\?v=(\d+)', (ROOT / 'index.html').read_text(encoding='utf-8')
)[1]
urls = os.environ.get('VERIFY_URLS', config['primarySite']).split()
verify_files = os.environ.get('VERIFY_FILES', '').split()
expected = {}
for name in verify_files:
    path = (ROOT / name).resolve()
    if not path.is_relative_to(ROOT) or not path.is_file():
        raise SystemExit('Invalid or missing release file: ' + name)
    expected[name] = path.read_bytes()
revision = os.environ.get('VERIFY_REVISION')
if revision:
    expected['mirror-revision.txt'] = (revision + '\n').encode('ascii')

pending = set(urls)
errors = {}
for attempt in range(48):
    for url in list(pending):
        try:
            def get(path):
                endpoint = url.rstrip('/') + '/' + path + '?verify=' + str(time.time_ns())
                request = urllib.request.Request(
                    endpoint, headers={'User-Agent': 'rescene-release-check', 'Cache-Control': 'no-cache'},
                )
                with urllib.request.urlopen(request, timeout=10) as response:
                    return response.read()

            if f'app.js?v={want}' not in get('').decode('utf-8'):
                raise ValueError('App version ' + str(want) + ' not live yet')
            for name, contents in expected.items():
                if get(name) != contents:
                    raise ValueError('Published file differs: ' + name)
            pending.remove(url)
            errors.pop(url, None)
        except Exception as exc:
            errors[url] = str(exc)
    if not pending:
        print('Published version verified:', want)
        if expected:
            print('Published files verified:', ', '.join(expected))
        break
    time.sleep(5)
else:
    raise SystemExit('Deployment not verified; source preserved. ' +
                     '; '.join(url + ': ' + errors.get(url, 'unknown') for url in sorted(pending)))
