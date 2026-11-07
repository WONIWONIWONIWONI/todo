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
print('Generated code and local static dependencies OK')
