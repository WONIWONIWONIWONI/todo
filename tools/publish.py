"""고친 내용을 사이트에 올리는 일을 한 번에 해요.

    python tools/publish.py "커밋 메시지"

순서: src/ → app.js 합치기(build_js.py) → CSV 검사 + sample-data.js 만들기 → 버전 올리기(index.html 4곳 · sw.js) → 탭 페이지·sitemap 만들기(build_pages.py)
      → 로컬 서버로 전체 점검(check_site.mjs) → 커밋 · push → 실제 사이트에 새 버전이 뜰 때까지 기다림.
중간에 하나라도 실패하면 거기서 멈추고 아무것도 올리지 않아요.
--no-check : 화면 점검을 건너뜀 (데이터만 바꿨고 급할 때만)
--ci       : GitHub Actions에서 관리자 저장 뒤에 돌 때 (봇 이름으로 커밋, push 뒤 Pages 빌드 요청)
"""
import re
import subprocess
import sys
import time
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIVE = 'https://woniwoniwoniwoni.github.io/todo/'
PORT = 8765
FILES = ['src', 'icons', 'sheet-templates', 'sample-data.js', 'index.html', 'music', 'schedule', 'calendar', 'alliances', 'guides', 'sitemap.xml', '404.html', 'manifest.webmanifest', 'sw.js', 'app.js', 'style.css', 'data', 'tools', '사용설명서.md', 'admin', 'admin-worker', '.github', 'config.js']


def run(*c, check=True):
    p = subprocess.run(c, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and p.returncode:
        print(p.stdout, p.stderr)
        sys.exit(f'✗ 실패: {" ".join(c)}')
    return p


args = [a for a in sys.argv[1:] if not a.startswith('--')]
msg = args[0] if args else '데이터 업데이트'

# 1) 검사 + 만들기
p = run(sys.executable, 'tools/build_js.py', check=False)
print(p.stdout.strip())
if p.returncode:
    print(p.stderr.strip())
    sys.exit('✗ app.js를 만들지 못해서 멈췄어요')
p = run(sys.executable, 'tools/build_data.py', check=False)
print(p.stdout.strip())
if p.returncode:
    sys.exit('✗ CSV에 틀린 곳이 있어서 멈췄어요')

# 2) 버전 올리기
idx = os.path.join(ROOT, 'index.html')
html = open(idx, encoding='utf-8').read()
cur = int(re.search(r'app\.js\?v=(\d+)', html).group(1))
new = cur + 1
open(idx, 'w', encoding='utf-8').write(re.sub(r'\?v=\d+', f'?v={new}', html))
sw = os.path.join(ROOT, 'sw.js')
s = open(sw, encoding='utf-8').read()
open(sw, 'w', encoding='utf-8').write(re.sub(r"const VERSION = 'v\d+'", f"const VERSION = 'v{new}'", s))
print(f'버전 v{cur} → v{new}')
print(run(sys.executable, 'tools/build_pages.py').stdout.strip())

# 3) 화면 점검 (로컬 서버가 없으면 잠깐 켬)
if '--no-check' not in sys.argv:
    server = None
    try:
        urllib.request.urlopen(f'http://localhost:{PORT}/', timeout=2)
    except Exception:
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(1.5)
    p = run('node', 'tools/check_site.mjs', check=False)
    if server:
        server.kill()
    print(p.stdout.strip())
    if p.returncode:
        print(p.stderr.strip())
        sys.exit('✗ 화면 점검에서 문제가 나와서 올리지 않았어요 (버전 숫자는 올라간 채로 둠)')

# 4) 올리기
run('git', 'add', '--', *[f for f in FILES if os.path.exists(os.path.join(ROOT, f))])
if not run('git', 'diff', '--cached', '--quiet', check=False).returncode:
    sys.exit('바뀐 것이 없어요')
CI = '--ci' in sys.argv
run('git', 'commit', '-q', '-m', f'v{new}: {msg}' if CI else f'v{new}: {msg}\n\nCo-Authored-By: Claude <noreply@anthropic.com>')
if run('git', 'push', '-q', check=False).returncode:
    run('git', 'pull', '--rebase', '-q')
    run('git', 'push', '-q')
if CI:
    run('gh', 'api', '--method', 'POST', 'repos/WONIWONIWONIWONI/todo/pages/builds', check=False)
print('push 완료, 실제 사이트 반영 기다리는 중…')

# 5) 실제 사이트 확인
for _ in range(48):
    try:
        body = urllib.request.urlopen(f'{LIVE}?nc={time.time()}', timeout=10).read().decode('utf-8', 'replace')
        if f'app.js?v={new}' in body:
            print(f'✓ 실제 사이트에 v{new} 반영됨')
            sys.exit(0)
    except Exception:
        pass
    time.sleep(5)
sys.exit(f'⚠ 4분 안에 v{new}가 안 보여요. 잠시 뒤 다시 확인해 주세요')
