"""sheet-templates 폴더의 CSV로 sample-data.js(사이트 정리본)를 다시 만든다.

데이터를 고칠 때는 sheet-templates/*.csv 를 고친 뒤 사이트 폴더에서 실행:
    python tools/build_data.py
만들기 전에 CSV를 검사해요. 틀린 곳이 있으면 어디가 틀렸는지 적고 멈춰요 (sample-data.js는 그대로).
경고(⚠)는 만들기는 하되 한 번 보라는 뜻이에요.
"""
import csv
import io
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # 윈도우 창에서도 ✗ ⚠ 가 보이게
except Exception:
    pass

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(root, 'sheet-templates')


def read(name):
    with open(os.path.join(T, name), encoding='utf-8') as f:
        return f.read()


def rows_of(text):
    return list(csv.DictReader(io.StringIO(text.lstrip('﻿'))))


# ---------- 검사 ----------
errors, warns = [], []
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
DATETIME = re.compile(r'^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$')
TIME = re.compile(r'^\d{1,2}:\d{2}$')
MUSIC_SHOWS = {'쇼케이팝', '더쇼', '쇼챔피언', '엠카운트다운', '뮤직뱅크', '음악중심', '인기가요'}


def need_cols(name, rows, text, cols):
    head = next(csv.reader(io.StringIO(text.lstrip('﻿'))), [])
    miss = [c for c in cols if c not in head]
    if miss:
        errors.append(f'{name}: 칸이 없어요 → {", ".join(miss)}')


def check_link(where, url):
    if not url:
        return
    for u in url.split():
        if re.match(r'^(구글폼|카톡):추후$', u):  # 링크 공지 전 (누를 수 없는 버튼)
            continue
        if not re.match(r'^https?://', u):
            errors.append(f'{where}: 링크가 http(s)로 시작하지 않아요 → {u}')
        if re.search(r'dcinside|dcimg', u, re.I) and not re.match(r'^https?://gall\.dcinside\.com/bgsmsylytb/?$', u, re.I):  # 예외: 이승윤 갤러리
            errors.append(f'{where}: 디시 링크는 넣지 않아요 → {u}')


def unique_ids(name, rows):
    seen = set()
    for n, r in enumerate(rows, 2):
        i = (r.get('아이디') or '').strip()
        if not i:
            errors.append(f'{name} {n}줄: 아이디가 비었어요')
        elif i in seen:
            errors.append(f'{name} {n}줄: 아이디 {i} 가 두 번 있어요')
        seen.add(i)
    return seen


texts = {n: read(n) for n in ['연합.csv', '할일.csv', '가이드.csv']}
for opt in ['음방.csv', '음방달력.csv']:
    if os.path.exists(os.path.join(T, opt)):
        texts[opt] = read(opt)
R = {n: rows_of(t) for n, t in texts.items()}

need_cols('연합.csv', R['연합.csv'], texts['연합.csv'], ['아이디', '상대아티스트', '상대팬덤', '상대총공계정'])
need_cols('할일.csv', R['할일.csv'], texts['할일.csv'], ['아이디', '연합아이디', '구분', '투표종류', '내용', '시작일', '종료일', '반복', '링크'])
need_cols('가이드.csv', R['가이드.csv'], texts['가이드.csv'], ['아이디', '플랫폼', '분류', '바로가기'])

allies = unique_ids('연합.csv', R['연합.csv'])
guides = unique_ids('가이드.csv', R['가이드.csv'])
unique_ids('할일.csv', R['할일.csv'])
for n, r in enumerate(R['가이드.csv'], 2):
    check_link(f'가이드.csv {n}줄', r.get('바로가기', ''))

for n, r in enumerate(R['할일.csv'], 2):
    w = f"할일.csv {n}줄 ({r.get('아이디', '')})"
    kind = (r.get('구분') or '').strip()
    if kind not in ('자체', '줄 것', '받을 것'):
        errors.append(f'{w}: 구분은 자체 / 줄 것 / 받을 것 중 하나예요 → "{kind}"')
    a = (r.get('연합아이디') or '').strip()
    if kind in ('줄 것', '받을 것') and not a:
        errors.append(f'{w}: 연합 할 일인데 연합아이디가 비었어요')
    if a and a not in allies:
        errors.append(f'{w}: 연합아이디 {a} 가 연합.csv에 없어요')
    g = (r.get('가이드아이디') or '').strip()
    if g and g not in guides:
        errors.append(f'{w}: 가이드아이디 {g} 가 가이드.csv에 없어요')
    s, e = (r.get('시작일') or '').strip(), (r.get('종료일') or '').strip()
    for label, v in (('시작일', s), ('종료일', e)):
        if v and not DATE.match(v):
            errors.append(f'{w}: {label}은 YYYY-MM-DD 로 → "{v}"')
    if s and e and DATE.match(s) and DATE.match(e) and e < s:
        errors.append(f'{w}: 종료일({e})이 시작일({s})보다 빨라요')
    rep = (r.get('반복') or '').strip()
    if rep not in ('', '매일', '요일', '1회', '기간 중 1회'):
        warns.append(f'{w}: 반복 "{rep}" 은 매일 / 요일 / 1회 / 기간 중 1회 중 하나로 쓰면 확실해요')
    t = (r.get('마감시간') or '').strip()
    if t and not TIME.match(t):
        errors.append(f'{w}: 마감시간은 HH:MM 으로 → "{t}"')
    check_link(w, r.get('링크', ''))
    check_link(w + ' 인증링크', r.get('인증링크', ''))
    camp, title = (r.get('투표종류') or '').strip(), (r.get('내용') or '').strip()
    if camp and title.startswith(camp):
        warns.append(f'{w}: 제목에 상 이름({camp})이 또 있어요. 제목은 "그룹 + 부문"만 (할일_등록양식.md)')
    if not title:
        errors.append(f'{w}: 내용(제목)이 비었어요')

if '음방달력.csv' in R:
    for n, r in enumerate(R['음방달력.csv'], 2):
        w = f"음방달력.csv {n}줄 ({r.get('아이디', '')})"
        kind = (r.get('구분') or '').strip()
        if kind not in ('방송', '생방송투표', '사전투표', '시청자위원회', '안내'):
            errors.append(f'{w}: 구분이 이상해요 → "{kind}"')
        show = (r.get('음방') or '').strip()
        if kind != '안내' and show not in MUSIC_SHOWS:
            errors.append(f'{w}: 음방 이름을 모르겠어요 → "{show}" (쓸 수 있는 것: {" / ".join(sorted(MUSIC_SHOWS))})')
        for label in ('시작', '종료'):
            v = (r.get(label) or '').strip()
            if v and not DATETIME.match(v):
                errors.append(f'{w}: {label}은 YYYY-MM-DD 또는 YYYY-MM-DD HH:MM → "{v}"')

if '음방.csv' in R:
    for n, r in enumerate(R['음방.csv'], 2):
        w = f"음방.csv {n}줄 ({r.get('아이디', '')})"
        show = (r.get('음방') or '').strip()
        if show and show not in MUSIC_SHOWS:
            errors.append(f'{w}: 음방 이름을 모르겠어요 → "{show}"')
        v = (r.get('방송일') or '').strip()
        if v and not DATE.match(v):
            errors.append(f'{w}: 방송일은 YYYY-MM-DD → "{v}"')
        check_link(w, r.get('출처', ''))

for x in warns:
    print('⚠', x)
if errors:
    print('\n데이터에 틀린 곳이 있어서 sample-data.js를 만들지 않았어요:')
    for x in errors:
        print('✗', x)
    sys.exit(1)

# ---------- 만들기 ----------
data = {'alliances': texts['연합.csv'], 'tasks': texts['할일.csv'], 'guides': texts['가이드.csv']}
if '음방.csv' in texts:
    data['music'] = texts['음방.csv']          # 음방 출연·사전투표 (리센느가 확정된 것만)
if '음방달력.csv' in texts:
    data['musicCal'] = texts['음방달력.csv']   # 음방 주간 달력 (그림 일정표를 옮긴 것, 할 일은 안 만들어요)
out = os.path.join(root, 'sample-data.js')
body = 'window.SAMPLE_DATA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n'
old = open(out, encoding='utf-8').read() if os.path.exists(out) else ''
m = re.search(r"window\.DATA_UPDATED = '([^']*)'", old)
# 정보 기준 시각: 내용이 바뀐 때만 새로 (한국 시간). 사이트 맨 위·맨 아래에 보여요.
if body in old and m:
    updated = m.group(1)
else:
    updated = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%dT%H:%M')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// 사이트에 들어 있는 정리본. sheet-templates 폴더의 CSV로 만들어요 (tools/build_data.py).\n')
    f.write(body)
    f.write("window.DATA_UPDATED = '" + updated + "';\n")
print('sample-data.js 다시 만듦:', sum(t.count('\n') - 1 for t in data.values()), '줄', f'(경고 {len(warns)}개)' if warns else '')
