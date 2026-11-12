"""Check generated JS and local static dependencies without live API requests."""
from pathlib import Path
import re
import subprocess
ROOT = Path(__file__).resolve().parent.parent
for p in [ROOT/'app.js', ROOT/'admin/admin.js', *list((ROOT/'shared').glob('*.js'))]:
    subprocess.run(['node', '--check', str(p)], check=True)
for name in ['index.html', 'admin/index.html', 'music/index.html', 'schedule/index.html', 'calendar/index.html', 'alliances/index.html']:
    p = ROOT/name
    for url in re.findall(r'(?:src|href)=["\']([^"\']+)', p.read_text()):
        if re.match(r'(?:[a-z]+:|/|#)', url): continue
        path = (p.parent / url.split('?')[0].split('#')[0]).resolve()
        if path.suffix in {'.js', '.css', '.webmanifest', '.svg'}:
            assert path.is_file(), f'{name}: missing {url}'
# CSP 지문이 <head>의 한 줄 스크립트와 맞는지 (안 맞으면 다크 모드 깜빡임 방지 스크립트가 막혀요)
import base64, hashlib
for name in ['index.html', 'admin/index.html', 'music/index.html', 'schedule/index.html', 'calendar/index.html', 'alliances/index.html']:
    text = (ROOT/name).read_text(encoding='utf-8')
    for inline in re.findall(r'<script>(.*?)</script>', text, re.S):
        digest = base64.b64encode(hashlib.sha256(inline.encode('utf-8')).digest()).decode()
        assert f"'sha256-{digest}'" in text, f"{name}: CSP 지문을 'sha256-{digest}' 로 바꾸세요"
print('Generated code and local static dependencies OK')
