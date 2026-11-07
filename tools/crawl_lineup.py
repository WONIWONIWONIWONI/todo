"""방송사 공식 출연진 공지를 읽어 리센느가 나오는지 data/lineup.json 으로 저장해요.

    python tools/crawl_lineup.py           # 받아서 저장
    python tools/crawl_lineup.py --test    # 고르는 규칙만 확인 (인터넷 안 씀)

GitHub Actions(.github/workflows/onair.yml)가 편성표와 같이 3시간마다 실행해요.
방송사가 방송 2~3일 전에 올리는 출연진 글을 읽어요 (X 'NEXT WEEK' 예고는 로그인이 필요해서 못 읽어요).
  - 인기가요: SBS 홈페이지 '이번주 출연진' 게시판 ("[1329회] 11월 1일 인기가요 출연진")
  - 뮤직뱅크: KBS 홈페이지 '미리보기' 게시판 ("10월 30일 예고편" · 본문 "<<뮤직뱅크 10월 30일 출연자>>")
  - 음악중심: MBC '예고보기' (방송일 · 회차 · 제목에 출연진)
엠카운트다운 · 쇼챔피언 · 더쇼 · 쇼케이팝은 읽을 수 있는 공식 글이 없어서 음방.csv 로 직접 넣어요.
리센느가 있으면 사이트가 '리센느 출연'으로 보여 줘요 (src/50-music.js musicAppearances).
받기에 실패한 음방은 예전 내용을 그대로 둬요. 오래 새 글이 없으면 자료 점검(health_check.py)이 알려 줘요.
"""
import html
import json
import pathlib
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'lineup.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
RESCENE = re.compile(r'리센느|RESCENE', re.I)
KEEP = 28  # 지난 방송은 4주까지만 남겨요
MBC_ID = '1000788100000100000'
KBS_BBS = 'T2000-0027-04-22552'


def get(url, referer=''):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', **({'Referer': referer} if referer else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def text(s):
    """HTML → 글자만"""
    return html.unescape(re.sub(r'<[^>]+>', ' ', str(s or '')))


def md_date(s, today):
    """'11월 1일' → 오늘에서 가장 가까운 해의 날짜 (12월 ↔ 1월 넘어갈 때)"""
    m = re.search(r'(\d{1,2})\s*월\s*(\d{1,2})\s*일', s or '')
    if not m:
        return None
    best = None
    for y in (today.year - 1, today.year, today.year + 1):
        try:
            d = date(y, int(m.group(1)), int(m.group(2)))
        except ValueError:
            continue
        if best is None or abs((d - today).days) < abs((best - today).days):
            best = d
    return best


def sbs(today):
    board = 'https://api.board.sbs.co.kr/bbs/V2.0/basic/board'
    out = {}
    for p in get(f'{board}/lists?action_type=json&board_code=inkigayo_bd02&offset=0&limit=6').get('list') or []:
        t = p.get('TITLE') or ''
        if '출연진' not in t:
            continue
        d = md_date(t, today)
        if not d:
            continue
        body = (get(f'{board}/detail/{p["NO"]}?action_type=json&board_code=inkigayo_bd02').get('Response_Data_For_Detail') or {}).get('CONTENT')
        ep = re.search(r'(\d+)\s*회', t)
        out[d.isoformat()] = {'rescene': bool(RESCENE.search(text(body))), 'ep': ep.group(1) if ep else '',
                              'link': f'https://programs.sbs.co.kr/enter/gayo/board/54772?cmd=view&page=1&board_no={p["NO"]}'}
    return out


def kbs(today):
    url = f'https://cfpbbsapi.kbs.co.kr/board/v1/list?bbs_id={KBS_BBS}&page=1&page_size=6&contents_yn=Y&notice_yn=N&kbs_board_auth=0'
    out = {}
    for p in get(url, 'https://pbbs.kbs.co.kr/').get('data') or []:
        t = p.get('title') or ''
        body = text(p.get('post_contents'))
        if '예고' not in t or '출연자' not in body:  # 출연자 목록이 있는 예고 글만
            continue
        d = md_date(t, today)
        if not d:
            continue
        out[d.isoformat()] = {'rescene': bool(RESCENE.search(body)), 'ep': '',
                              'link': f'https://program.kbs.co.kr/2tv/enter/musicbank/board.html?smenu=9725de&bbs_loc={KBS_BBS},read,,{p.get("post_no")},{p.get("id")}'}
    return out


def mbc(today):
    out = {}
    for p in get(f'https://playvod.imbc.com/api/PreviewList?programId={MBC_ID}&curPage=1&pageSize=6').get('ContList') or []:
        d = str(p.get('BroadDate') or '')[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d):
            continue
        out[d] = {'rescene': bool(RESCENE.search(text(p.get('ContentTitle')) + ' ' + text(p.get('Preview')))), 'ep': str(p.get('ContentNumber') or ''),
                  'link': f'https://playvod.imbc.com/Templete/PreView?bid={MBC_ID}'}
    return out


# 음방 아이디(src/50-music.js MUSIC_SHOWS) → 읽는 곳
SOURCES = {'inkigayo': sbs, 'musicbank': kbs, 'musiccore': mbc}


def merge(old, got, lo):
    """예전 것 + 새로 받은 것 (새것 우선), 오래된 날짜는 빼요"""
    return dict(sorted({d: v for d, v in {**(old or {}), **got}.items() if d >= lo}.items()))


def main():
    now = datetime.now(KST)
    today = now.date()
    try:
        prev = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    except Exception:
        prev = {}
    old = prev.get('shows') or {}
    lo = (today - timedelta(days=KEEP)).isoformat()
    shows, ok = {}, 0
    for sid, fetch in SOURCES.items():
        try:
            got = fetch(today)
            ok += 1
        except Exception as e:
            print(f'[lineup] {sid}: 실패 ({e})', file=sys.stderr)
            got = {}
        shows[sid] = merge(old.get(sid), got, lo)
        print(f'[lineup] {sid}: ' + ', '.join(f"{d[5:]}{' 리센느' if v['rescene'] else ''}" for d, v in shows[sid].items()), file=sys.stderr)
    if not ok:
        print('[lineup] 모두 실패, 파일을 바꾸지 않아요', file=sys.stderr)
        return 1
    if shows == old:
        print('[lineup] 바뀐 출연진 없음', file=sys.stderr)
        return 0
    OUT.write_text(json.dumps({'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'shows': shows}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('[lineup] 저장함', file=sys.stderr)
    return 0


def self_test():
    t = date(2026, 11, 4)
    assert md_date('[1329회] 11월 1일 인기가요 출연진', t) == date(2026, 11, 1)
    assert md_date('1월 3일 예고편', date(2026, 12, 30)) == date(2027, 1, 3), '해 넘김'
    assert md_date('12월 27일 예고편', date(2027, 1, 2)) == date(2026, 12, 27), '지난해 말'
    assert md_date('예고편', t) is None
    assert RESCENE.search(text('<p>- RESCENE (리센느) [Pulse]</p>')) and RESCENE.search('Rescene') and not RESCENE.search('ATEEZ, RIIZE')
    assert text('A&amp;B<br>C') == 'A&B C'
    old = {'2026-10-01': {'rescene': False}, '2026-10-25': {'rescene': False}}
    got = {'2026-11-01': {'rescene': True}, '2026-10-25': {'rescene': True}}
    assert merge(old, got, '2026-10-07') == {'2026-10-25': {'rescene': True}, '2026-11-01': {'rescene': True}}, '새것 우선 · 오래된 것 빼기'
    assert merge(old, {}, '2026-10-07') == {'2026-10-25': {'rescene': False}}, '못 받으면 예전 값'
    src = (ROOT / 'sheet-templates' / '음방정보.csv').read_text(encoding='utf-8')
    assert all(f'\n{s},' in src for s in SOURCES), '음방정보.csv 아이디'
    print('✓ crawl_lineup 규칙 확인')


if __name__ == '__main__':
    if '--test' in sys.argv:
        self_test()
        sys.exit(0)
    sys.exit(main())
