"""Deploy both Cloudflare components; credentials stay in environment variables."""
import os
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parent.parent
if not all(os.environ.get(k) for k in ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']):
    raise SystemExit('Cloudflare deployment needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in GitHub Actions Secrets. Source and drafts are preserved.')
subprocess.run([sys.executable,'tools/package_static.py'],cwd=ROOT,check=True)
subprocess.run(['npx','--yes','wrangler@4','deploy','--config','admin-worker/wrangler.toml'],cwd=ROOT,check=True)
project=json.loads((ROOT/'deployment.json').read_text())['pagesProject']
subprocess.run(['npx','--yes','wrangler@4','pages','deploy','/tmp/rescene-public','--project-name='+project,'--branch=main'],cwd=ROOT,check=True)
env={**os.environ,'VERIFY_URLS':'https://rescenefan.pages.dev/'}
subprocess.run([sys.executable,'tools/verify_live.py'],cwd=ROOT,env=env,check=True)
