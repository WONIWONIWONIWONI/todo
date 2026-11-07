"""Keep editable CSS sections ordered; publish a single file to preserve loading and cache behavior."""
from pathlib import Path
import json
import sys
ROOT=Path(__file__).resolve().parent.parent
files=json.loads((ROOT/'styles/order.json').read_text())
text=''.join((ROOT/'styles'/name).read_text() for name in files)
out=ROOT/'style.css'
if '--check' in sys.argv:
    if out.read_text()!=text: raise SystemExit('style.css differs from styles/: run python tools/build_style.py')
else: out.write_text(text)
print('CSS sections match published stylesheet')
