"""Build and validate without committing, pushing, or touching the operating site."""
from pathlib import Path
import re
import subprocess
import sys
ROOT = Path(__file__).resolve().parent.parent
def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)
def main():
    run(sys.executable, 'tools/build_style.py')
    run(sys.executable, 'tools/build_js.py')
    run(sys.executable, 'tools/build_data.py')
    for path in [ROOT / 'index.html', ROOT / 'admin/index.html']:
        text = path.read_text(); version = int(re.search(r'\?v=(\d+)', text)[1]) + 1
        path.write_text(re.sub(r'\?v=\d+', f'?v={version}', text))
    path = ROOT / 'sw.js'; text = path.read_text()
    version = re.search(r'app\.js\?v=(\d+)', (ROOT / 'index.html').read_text())[1]
    path.write_text(re.sub(r"const VERSION = 'v\d+'", f"const VERSION = 'v{version}'", text))
    run(sys.executable, 'tools/build_pages.py')
    run('node', 'tools/validate_data.mjs')
    run('node', '--test', *[str(p.relative_to(ROOT)) for p in sorted((ROOT/'tests').glob('*.test.mjs'))])
    run(sys.executable, 'tools/check_structure.py')
    run(sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py')
if __name__ == '__main__':
    main()
