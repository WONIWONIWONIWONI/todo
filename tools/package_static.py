"""Publish only public files; source, tests and admin requests are excluded."""
from pathlib import Path
import json
import re
import shutil
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parent.parent
OUT=Path('/tmp/rescene-public')
if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
for name in ['index.html','404.html','app.js','style.css','config.js','sample-data.js','sw.js','manifest.webmanifest','sitemap.xml','icons','images','styles','shared','music','schedule','calendar','alliances','guides','admin','data']:
    source=ROOT/name
    if source.is_dir(): shutil.copytree(source,OUT/name)
    elif source.is_file(): shutil.copy2(source,OUT/name)
# The 404 page links to GitHub Pages' /todo/ path; the mirror serves the site from its root.
missing = OUT / '404.html'
page = missing.read_text(encoding='utf-8')
if page.count('href="/todo/"') != 1:
    raise ValueError('Expected one /todo/ link in 404.html')
missing.write_text(page.replace('href="/todo/"', 'href="/"'), encoding='utf-8')
for name in ['admin-files.json']:
    (OUT/'shared'/name).unlink(missing_ok=True)

deployment = json.loads((ROOT / 'deployment.json').read_text(encoding='utf-8'))
namespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ET.register_namespace('', namespace)
sitemap_path = OUT / 'sitemap.xml'
sitemap = ET.parse(sitemap_path)
locations = sitemap.findall(f'{{{namespace}}}url/{{{namespace}}}loc')
if not locations:
    raise ValueError('Empty sitemap')
for location in locations:
    if not location.text or not location.text.startswith(deployment['primarySite']):
        raise ValueError(f'Unexpected sitemap location: {location.text}')
    location.text = deployment['mirrorSite'] + location.text.removeprefix(deployment['primarySite'])
sitemap.write(sitemap_path, encoding='utf-8', xml_declaration=True)

# Search ownership tags apply to the Workers homepage only.
homepage = OUT / 'index.html'
html = homepage.read_text(encoding='utf-8')
if html.count('</head>') != 1:
    raise ValueError('Expected one homepage head')
verification = (
    '  <meta name="naver-site-verification" content="cbf828c1f746257ebfbc8f77dc7cdfd141062974" />\n'
    '  <meta name="google-site-verification" content="E83MTfZ8Qi1DqO9Y3C4wb6rw7QpchasTLNe4j1eMyyk" />\n'
)
homepage.write_text(html.replace('</head>', verification + '</head>'), encoding='utf-8')

# Only the Workers copy uses the mirror's public Web Analytics site token.
token = deployment['mirrorAnalyticsToken']
if not re.fullmatch(r'[0-9a-f]{32}', token):
    raise ValueError('Invalid mirror Web Analytics site token')
beacon = re.compile(rb"""<script\b[^>]*\bdata-cf-beacon='[^']*'[^>]*></script>""")
snippet = (f"""<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" """
           f"""data-cf-beacon='{{"token": "{token}", "spa": true}}'></script>""").encode()
for page in OUT.rglob('*.html'):
    html = page.read_bytes()
    if b'data-cf-beacon' in html or page == OUT / 'index.html':
        updated, count = beacon.subn(snippet, html)
        if count != 1:
            raise ValueError(f'Expected one Web Analytics beacon in {page.relative_to(OUT)}')
        page.write_bytes(updated)
print('Public files prepared:',OUT)
