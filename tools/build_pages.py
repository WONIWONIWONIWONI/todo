"""index.html 하나로 탭마다 실제 페이지(…/todo/music/ 등)와 sitemap.xml을 만들어요.

    python tools/build_pages.py

index.html만 고치면 돼요. music/index.html 같은 탭 페이지는 이 도구가 매번 새로 만들어요(직접 고치지 말 것).
탭 페이지는 index.html과 같은 화면이고, 다른 것은 제목·설명·주소·첫 소개 글뿐이에요.
그래서 주소로 바로 들어와도 404를 거치지 않고, 검색엔진도 탭마다 따로 읽어요.
publish.py가 버전을 올린 다음 이 도구를 불러요.
"""
import datetime
import html
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://woniwoniwoniwoni.github.io/todo/'

# 탭 주소 → 제목 · 설명 · 첫 소개 글. src/90-main.js의 TABS와 같은 탭이에요.
PAGES = {
    'music': (
        '리센느 음방 · 음악방송 사전투표 · 실시간 투표 방법',
        '리센느 음방 출연 일정과 음악방송별 사전투표·실시간 투표 방법, 투표 앱과 반영 비율을 정리했어요.',
        '음악방송',
        '리센느(RESCENE) 출연 예정 음방과 사전투표 기간, 음악방송마다 쓰는 투표 앱·투표 방법·반영 비율을 한곳에 정리했어요.',
    ),
    'schedule': (
        '리센느 일정 · 스케줄',
        '리센느(RESCENE) 공식 일정을 Mnet Plus·blip 기준으로 달력과 목록으로 보여 줘요.',
        '리센느 일정',
        '리센느(RESCENE) 공식 스케줄을 Mnet Plus와 blip 일정을 합쳐서 달력과 목록으로 보여 줘요. 내 캘린더로 구독할 수도 있어요.',
    ),
    'calendar': (
        '리센느 연합 일정 · 투표 기간표',
        '리센느 연합 투표·스밍 일정을 기간표와 달력으로 정리했어요. MMA·MAMA·퍼스트브랜드 대상 투표 기간까지.',
        '연합 일정',
        '리센느 연합 투표와 스밍 일정을 기간표와 달력으로 보여 줘요. 줄 것과 받을 것을 나눠서 볼 수 있어요.',
    ),
    'alliances': (
        '리센느 연합 · 음총팀 가이드',
        '리센느와 연합한 팀, 서로 해 주는 투표, 음총팀 가이드를 모았어요.',
        '연합&기타',
        '리센느와 연합한 팀과 서로 해 주는 투표, 음총팀 가이드를 모았어요.',
    ),
}
# 예전 주소(…/todo/guides#mma). 화면은 사이트 스크립트가 알맞은 탭으로 보내고, 검색에는 안 올려요.
ALIASES = {'guides': 'alliances'}
GENERATED = '<!-- tools/build_pages.py가 index.html로 만든 파일이에요. 직접 고치지 말고 index.html을 고치세요. -->\n'


def sub1(pattern, repl, text):
    # 글자는 그대로 넣어요 (앞에서 잡은 부분을 다시 쓰려면 repl을 함수로)
    out, n = re.subn(pattern, repl if callable(repl) else (lambda m: repl), text, count=1)
    if n != 1:
        raise SystemExit(f'✗ index.html에서 {pattern} 을 찾지 못했어요')
    return out


def relocate(text):
    """index.html의 상대 주소(style.css, icons/…, music/)를 한 단계 아래 폴더에서도 맞게 고쳐요."""
    def fix(m):
        attr, q, url = m.group(1), m.group(2), m.group(3)
        if re.match(r'([a-z]+:|/|#)', url):
            return m.group(0)
        return f'{attr}={q}../{url[2:] if url.startswith("./") else url}'
    return re.sub(r'\b(href|src)=(["\'])([^"\']*)', fix, text)


# 네이버 서치어드바이저: 사이트 설명은 80자 이내
DESC_MAX = 80


def check_desc(where, text):
    if len(text) > DESC_MAX:
        raise SystemExit(f'✗ {where} 설명이 {len(text)}자예요. 네이버 기준 {DESC_MAX}자 이내로 줄여 주세요')


def page(src, slug):
    target = ALIASES.get(slug, slug)
    title, desc, h1, intro = PAGES[target]
    check_desc(target, desc)
    url = SITE + target + '/'
    e = html.escape
    out = src
    out = sub1(r'<title>[^<]*</title>', f'<title>{e(title)} · 리센느 오늘의 할일</title>', out)
    out = sub1(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{e(desc)}">', out)
    out = sub1(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{url}">', out)
    out = sub1(r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">', out)
    out = sub1(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{e(title)}">', out)
    out = sub1(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{e(desc)}">', out)
    out = sub1(r'<meta name="twitter:title" content="[^"]*">', f'<meta name="twitter:title" content="{e(title)}">', out)
    out = sub1(r'<meta name="twitter:description" content="[^"]*">', f'<meta name="twitter:description" content="{e(desc)}">', out)
    # 공유 미리보기 그림: 탭마다 따로 (icons/og-탭.png, tools/build_og.mjs로 만듦)
    img = f'{SITE}icons/og-{target}.png'
    out = sub1(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{img}">', out)
    out = sub1(r'<meta name="twitter:image" content="[^"]*">', f'<meta name="twitter:image" content="{img}">', out)
    out = sub1(r'<meta property="og:image:alt" content="[^"]*">', f'<meta property="og:image:alt" content="리센느 오늘의 할일 — {e(h1)}">', out)
    out = sub1(r'(<section class="page-head seo-intro">\s*)<h1>[^<]*</h1>\s*<p>[^<]*</p>',
               lambda m: m.group(1) + f'<h1>{e(h1)}</h1>\n      <p>{e(intro)}</p>', out)
    if slug in ALIASES:
        out = sub1(r'<meta name="description"', '<meta name="robots" content="noindex">\n  <meta name="description"', out)
    out = relocate(out)
    assert '\\1' not in out, f'{slug}: 바꾸기 글자(\\1)가 그대로 남았어요'
    return out.replace('<!doctype html>\n', '<!doctype html>\n' + GENERATED, 1)


def main():
    src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    check_desc('index.html', html.unescape(re.search(r'<meta name="description" content="([^"]*)"', src).group(1)))
    for slug in [*PAGES, *ALIASES]:
        d = os.path.join(ROOT, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n') as f:
            f.write(page(src, slug))
    day = datetime.date.today().isoformat()
    urls = [('', '1.0'), *[(s + '/', '0.8') for s in PAGES]]
    body = ''.join(f'  <url>\n    <loc>{SITE}{p}</loc>\n    <lastmod>{day}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>{pr}</priority>\n  </url>\n' for p, pr in urls)
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n')
    print(f'탭 페이지 {len(PAGES) + len(ALIASES)}개 · sitemap.xml 만듦')


if __name__ == '__main__':
    main()
