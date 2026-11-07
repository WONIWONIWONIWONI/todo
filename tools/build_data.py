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


texts = {n: read(n) for n in ['연합.csv', '할일.csv', '가이드.csv', '투표종류.csv', '색묶음.csv', '뮤직웨이브.csv', '투표앱.csv', '음방정보.csv']}
for opt in ['음방.csv', '음방안내.csv']:
    if os.path.exists(os.path.join(T, opt)):
        texts[opt] = read(opt)
R = {n: rows_of(t) for n, t in texts.items()}

need_cols('연합.csv', R['연합.csv'], texts['연합.csv'], ['아이디', '상대아티스트', '상대팬덤', '상대총공계정'])
need_cols('할일.csv', R['할일.csv'], texts['할일.csv'], ['아이디', '연합아이디', '구분', '투표종류', '내용', '시작일', '종료일', '반복', '링크'])
need_cols('가이드.csv', R['가이드.csv'], texts['가이드.csv'], ['아이디', '이름', '바로가기'])

allies = unique_ids('연합.csv', R['연합.csv'])
unique_ids('가이드.csv', R['가이드.csv'])
unique_ids('할일.csv', R['할일.csv'])
for n, r in enumerate(R['가이드.csv'], 2):
    check_link(f'가이드.csv {n}줄', r.get('바로가기', ''))

for n, r in enumerate(R['할일.csv'], 2):
    w = f"할일.csv {n}줄 ({r.get('아이디', '')})"
    kind = (r.get('구분') or '').strip()
    cadence = (r.get('참여 주기') or '').strip()
    if cadence and (kind == '받을 것' or not re.fullmatch(r'매시간 1회|틈날 때마다|[1-9][0-9]*(분|시간)마다', cadence)):
        errors.append(f'{w}: 참여 주기 또는 구분을 확인해 주세요')
    if kind not in ('자체', '줄 것', '받을 것'):
        errors.append(f'{w}: 구분은 자체 / 줄 것 / 받을 것 중 하나예요 → "{kind}"')
    a = (r.get('연합아이디') or '').strip()
    if kind in ('줄 것', '받을 것') and not a:
        errors.append(f'{w}: 연합 할 일인데 연합아이디가 비었어요')
    if a and a not in allies:
        errors.append(f'{w}: 연합아이디 {a} 가 연합.csv에 없어요')
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


# ---------- 사이트 설정 표 (관리자 모드에서 고쳐요) ----------
need_cols('투표종류.csv', R['투표종류.csv'], texts['투표종류.csv'], ['투표종류', '묶음'])
need_cols('색묶음.csv', R['색묶음.csv'], texts['색묶음.csv'], ['묶음', '색'])
need_cols('뮤직웨이브.csv', R['뮤직웨이브.csv'], texts['뮤직웨이브.csv'], ['이름', '링크', '방 번호', '방 종류'])
need_cols('투표앱.csv', R['투표앱.csv'], texts['투표앱.csv'], ['아이디', '이름', '안드로이드 패키지', '아이폰 앱 번호', '앱 주소', '아이폰 앱 주소', '앱 링크', '아이폰도 앱 링크로', '홈페이지'])
need_cols('음방정보.csv', R['음방정보.csv'], texts['음방정보.csv'], ['아이디', '음방', '요일', '시작', '끝', '채널', '사전투표 앱', '실시간 앱'])


def keyed(name, col):
    """col 칸이 비지 않고 겹치지 않는지. 값 목록을 돌려줘요"""
    seen = []
    for n, r in enumerate(R[name], 2):
        v = (r.get(col) or '').strip()
        if not v:
            errors.append(f'{name} {n}줄: {col} 칸이 비었어요')
        elif v in seen:
            errors.append(f'{name} {n}줄: {col} "{v}" 가 두 번 있어요')
        seen.append(v)
    return seen


groups = keyed('색묶음.csv', '묶음')
if '기타' not in groups:
    errors.append('색묶음.csv: "기타" 묶음은 꼭 있어야 해요 (모르는 종류가 들어가는 곳)')
for n, r in enumerate(R['색묶음.csv'], 2):
    if not re.match(r'^#[0-9a-fA-F]{6}$', (r.get('색') or '').strip()):
        errors.append(f'색묶음.csv {n}줄: 색은 #과 6자리 (예: #1f8a4c) → "{r.get("색", "")}"')
keyed('투표종류.csv', '투표종류')
for n, r in enumerate(R['투표종류.csv'], 2):
    g = (r.get('묶음') or '').strip()
    if g not in groups:
        errors.append(f'투표종류.csv {n}줄: 묶음 "{g}" 가 색묶음.csv에 없어요')

for n, r in enumerate(R['뮤직웨이브.csv'], 2):
    w = f'뮤직웨이브.csv {n}줄'
    if not (r.get('이름') or '').strip():
        errors.append(f'{w}: 이름이 비었어요')
    if not (r.get('링크') or '').startswith('https://'):
        errors.append(f'{w}: 링크는 https:// 로 시작해야 해요')
    check_link(w, r.get('링크', ''))
    service = (r.get('서비스') or '멜론').strip()
    if service not in ('멜론', '지니', '스테이션헤드'):
        errors.append(f'{w}: 서비스는 멜론·지니·스테이션헤드 중 하나예요')
    if service != '멜론':
        continue
    if not re.match(r'^\d+$', (r.get('방 번호') or '').strip()) or not re.match(r'^\w+$', (r.get('방 종류') or '').strip()):
        errors.append(f'{w}: 방 번호는 숫자, 방 종류는 영어 한 낱말 (예: 67634585 · user)')

apps = keyed('투표앱.csv', '아이디')
for n, r in enumerate(R['투표앱.csv'], 2):
    w = f'투표앱.csv {n}줄 ({r.get("아이디", "")})'
    if not re.match(r'^[a-z0-9]+$', (r.get('아이디') or '').strip()):
        errors.append(f'{w}: 아이디는 영어 소문자 · 숫자만')
    if not (r.get('이름') or '').strip() or not (r.get('안드로이드 패키지') or '').strip():
        errors.append(f'{w}: 이름 · 안드로이드 패키지는 꼭 채워요')
    if not re.match(r'^\d+$', (r.get('아이폰 앱 번호') or '').strip()):
        errors.append(f'{w}: 아이폰 앱 번호는 숫자 (앱스토어 주소의 id 뒤 숫자)')
    for c in ['앱 링크', '홈페이지']:
        check_link(f'{w} {c}', r.get(c, ''))
    for c in ['앱 주소', '아이폰 앱 주소']:
        v = (r.get(c) or '').strip()
        if v and not re.match(r'^[a-z][a-z0-9+.-]*://', v):
            errors.append(f'{w}: {c}는 "이름://" 꼴이에요 → "{v}"')
    if (r.get('아이폰도 앱 링크로') or '').strip() not in ('', '예'):
        errors.append(f'{w}: 아이폰도 앱 링크로 칸은 비우거나 "예"')

WK = re.compile(r'^\S+ \d{1,2}:\d{2} ~ \S+ \d{1,2}:\d{2}$')
shows = keyed('음방정보.csv', '아이디')
code = open(os.path.join(root, 'src', '50-music.js'), encoding='utf-8').read()
_re = code[code.find('const MG_RE'):]
known_re = set(re.findall(r"^    (\w+): /", _re[:_re.find('};')], re.M))
for i in sorted(known_re - set(shows)):
    errors.append(f'음방정보.csv: 음방 {i} 줄이 없어요')
for n, r in enumerate(R['음방정보.csv'], 2):
    w = f'음방정보.csv {n}줄 ({r.get("아이디", "")})'

    def g(c):
        return (r.get(c) or '').strip()
    if g('아이디') not in known_re:
        errors.append(f'{w}: 모르는 음방 아이디예요 (새 음방은 Claude에게: src/50-music.js MG_RE)')
    if g('요일') not in list('일월화수목금토'):
        errors.append(f'{w}: 요일은 일 · 월 · 화 · 수 · 목 · 금 · 토 중 한 글자')
    for c in ['시작', '끝']:
        if not TIME.match(g(c)):
            errors.append(f'{w}: {c}은 HH:MM (예: 18:00) → "{g(c)}"')
    for p in ['사전투표', '실시간']:
        for k in re.split(r'[,\s]+', g(p + ' 앱')):
            if k and k not in apps:
                errors.append(f'{w}: {p} 앱 "{k}" 가 투표앱.csv에 없어요')
    if not g('사전투표 앱'):
        errors.append(f'{w}: 사전투표 앱은 꼭 채워요')
    if g('사전투표 시간') and not WK.match(g('사전투표 시간')):
        errors.append(f'{w}: 사전투표 시간은 "목 12:00 ~ 토 12:00" 꼴이에요')
    for line in g('점수 항목').split('\n'):
        if line.strip() and not re.search(r'\d\s*%.*\|', line):
            errors.append(f'{w}: 점수 항목 줄은 "음원 40% | 기준" 꼴이에요 → "{line.strip()}"')
    if g('시청자위원회') and not WK.match(g('시청자위원회').split('|')[0].strip()):
        errors.append(f'{w}: 시청자위원회는 "수 09:00 ~ 목 11:00 | 어디서" 꼴이에요')
    if g('문자투표') and '|' not in g('문자투표'):
        errors.append(f'{w}: 문자투표는 "#0505 | 보낼 글" 꼴이에요')
    for c in ['결방 시작', '결방 끝']:
        if g(c) and not DATE.match(g(c)):
            errors.append(f'{w}: {c}은 YYYY-MM-DD → "{g(c)}"')
    if g('결방 끝') and not g('결방 시작'):
        errors.append(f'{w}: 결방 끝만 있고 결방 시작이 비었어요')
    if g('결방 시작') and not (g('결방 제목') and g('결방 설명')):
        errors.append(f'{w}: 결방을 넣으면 결방 제목 · 결방 설명도 채워요')
    check_link(f'{w} 결방 출처', g('결방 출처'))
    for line in g('공식 링크').split('\n'):
        if line.strip():
            if '|' not in line:
                errors.append(f'{w}: 공식 링크 줄은 "이름 | https://주소" 꼴이에요')
            else:
                check_link(f'{w} 공식 링크', line.split('|', 1)[1].strip())

if '음방안내.csv' in R:
    # 음방 설명 글 (아이디 = 음방정보.csv 아이디)
    known = {r.get('아이디', '').strip() for r in R['음방정보.csv']}
    for i in unique_ids('음방안내.csv', R['음방안내.csv']) - known:
        errors.append(f'음방안내.csv: 아이디 {i} 는 없는 음방이에요 ({", ".join(sorted(known))} 중 하나)')
    for n, r in enumerate(R['음방안내.csv'], 2):
        for k, v in r.items():
            if v and re.search(r'dcinside|dcimg', v, re.I):
                errors.append(f'음방안내.csv {n}줄 {k}: 디시 주소는 넣지 않아요')

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
# 사이트 설정 표: 투표 종류 순서 · 색 묶음 · 뮤직웨이브 버튼 · 투표 앱 · 음방 기본 정보
data.update({'camps': texts['투표종류.csv'], 'groups': texts['색묶음.csv'], 'waves': texts['뮤직웨이브.csv'], 'apps': texts['투표앱.csv'], 'musicshows': texts['음방정보.csv']})
if '음방안내.csv' in texts:
    data['musicinfo'] = texts['음방안내.csv']  # 음방 투표 방법 설명 글
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
