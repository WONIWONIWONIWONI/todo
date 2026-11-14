"""Deploy the admin Worker or the old mirror's redirect Worker (AI-0050).

Do not move canonical URLs: GitHub Pages /todo/ is the only site.
"""
import argparse
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
group = parser.add_mutually_exclusive_group()
group.add_argument('--mirror-only', action='store_true', help='Deploy the redirect Worker only')
group.add_argument('--worker-only', action='store_true')
args = parser.parse_args()

if not all(os.environ.get(key) for key in ('CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID')):
    raise SystemExit('Cloudflare deployment credentials missing; source preserved.')

for name, skip in (('admin-worker', args.mirror_only), ('mirror-worker', args.worker_only)):
    if not skip:
        subprocess.run(
            ['npx', '--yes', 'wrangler@4', 'deploy', '--config', name + '/wrangler.toml'],
            cwd=ROOT, check=True,
        )
