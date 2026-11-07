"""Deploy the canonical GitHub Pages site's Cloudflare mirror or admin Worker.

Do not move canonical URLs: GitHub Pages /todo/ remains the main site.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
group = parser.add_mutually_exclusive_group()
group.add_argument('--mirror-only', action='store_true')
group.add_argument('--worker-only', action='store_true')
parser.add_argument('--skip-unchanged', action='store_true',
                    help='Skip mirror upload when the deployed revision is already current')
args = parser.parse_args()

if not all(os.environ.get(key) for key in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID')):
    raise SystemExit('Cloudflare deployment credentials missing; source preserved.')

config = json.loads((ROOT / 'deployment.json').read_text(encoding='utf-8'))

if not args.mirror_only:
    subprocess.run(
        ['npx', '--yes', 'wrangler@4', 'deploy', '--config', 'admin-worker/wrangler.toml'],
        cwd=ROOT, check=True,
    )

if not args.worker_only:
    subprocess.run([sys.executable, 'tools/package_static.py'], cwd=ROOT, check=True)
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    target = config['mirrorSite'].rstrip('/') + '/mirror-revision.txt'
    should_upload = True
    if args.skip_unchanged:
        try:
            request = urllib.request.Request(
                target + '?check=' + revision[:12],
                headers={'User-Agent': 'rescene-mirror-sync', 'Cache-Control': 'no-cache'},
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                existing = response.read().decode('ascii').strip()
            if existing == revision:
                should_upload = False
                print('Cloudflare mirror already current:', revision)
        except Exception as exc:
            print('Mirror revision unavailable; uploading:', type(exc).__name__)

    if should_upload:
        # The primary site must publish this release before its mirror does.
        # A GitHub Actions crawler commit alone may not trigger Pages automatically,
        # so each crawler that changes public files must request a Pages build.
        primary_env = {
            **os.environ,
            'VERIFY_URLS': config['primarySite'],
            'VERIFY_FILES': 'admin/admin.js sample-data.js data/blip.json data/inbox.json data/onair.json '
                            'data/lineup.json data/notice.json data/weekly.json data/rescene.ics',
        }
        subprocess.run(
            [sys.executable, 'tools/verify_live.py'],
            cwd=ROOT, env=primary_env, check=True,
        )
        (Path('/tmp/rescene-public') / 'mirror-revision.txt').write_text(
            revision + '\n', encoding='ascii',
        )
        subprocess.run(
            ['npx', '--yes', 'wrangler@4', 'deploy', '--config', 'mirror-worker/wrangler.toml'],
            cwd=ROOT, check=True,
        )

    # Check actual published data; crawler JSON/ICS changes do not bump app.js?v.
    env = {
        **os.environ,
        'VERIFY_URLS': config['mirrorSite'],
        'VERIFY_FILES': 'admin/admin.js sample-data.js data/blip.json data/inbox.json data/onair.json '
                        'data/lineup.json data/notice.json data/weekly.json data/rescene.ics',
        'VERIFY_REVISION': revision,
    }
    subprocess.run([sys.executable, 'tools/verify_live.py'], cwd=ROOT, env=env, check=True)
