"""Publish only public files; source, tests and admin requests are excluded."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parent.parent
OUT=Path('/tmp/rescene-public')
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
for name in ['index.html','404.html','app.js','style.css','config.js','sample-data.js','sw.js','manifest.webmanifest','sitemap.xml','icons','images','styles','shared','music','schedule','calendar','alliances','guides','admin','data']:
    source=ROOT/name
    if source.is_dir(): shutil.copytree(source,OUT/name)
    elif source.is_file(): shutil.copy2(source,OUT/name)
for name in ['admin-files.json']:
    (OUT/'shared'/name).unlink(missing_ok=True)
print('Public files prepared:',OUT)
