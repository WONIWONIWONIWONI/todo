"""Mark source notices done only after the released pages have been verified."""
import json
import subprocess
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
tx = json.loads((ROOT/'.admin/transaction.json').read_text())
for attempt in range(3):
    raw = subprocess.check_output(['gh','api',f'repos/{sys.argv[1]}/contents/data/inbox.json'], text=True)
    import base64
    before = json.loads(raw); data = json.loads(base64.b64decode(before['content']))
    changed = False
    for item in data.get('items', []):
        new = 'done' if str(item['id']) in tx.get('inboxDone',[]) else 'wait' if str(item['id']) in tx.get('inboxWait',[]) else None
        if new and item.get('state') != new: item['state'] = new; changed = True
    if not changed: break
    payload = {'message':'공지 처리 확정: 배포 확인 완료','sha':before['sha'],'content':base64.b64encode((json.dumps(data,ensure_ascii=False,indent=1)+'\n').encode()).decode()}
    p = subprocess.run(['gh','api','--method','PUT',f'repos/{sys.argv[1]}/contents/data/inbox.json','--input','-'],input=json.dumps(payload),text=True,capture_output=True)
    if p.returncode == 0: break
else: raise SystemExit('Publication succeeded; inbox finalization needs retry')
