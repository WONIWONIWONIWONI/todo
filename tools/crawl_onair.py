"""방송사 공식 편성표에서 음방 방송 시간을 받아 data/onair.json 으로 저장해요.

    python tools/crawl_onair.py           # 받아서 저장
    python tools/crawl_onair.py --test    # 고르는 규칙만 확인 (인터넷 안 씀)

GitHub Actions(.github/workflows/onair.yml)가 3시간마다 실행해요.
음방마다 방송 요일의 3주 전 ~ 2주 뒤 날짜를 봐요.
  - 편성표에 있으면 그 시작 · 끝 시간 → 사이트가 평소와 다르면 '시간 변경'으로 보여 줘요
  - 그날 편성표는 나왔는데 그 음방이 없으면 off → 사이트에 '결방'
  - 편성표가 아직 안 나왔거나 받기에 실패한 날짜는 예전 내용을 그대로 둬요 (없으면 사이트는 평소 시간)
평소 요일 · 시간은 sheet-templates/음방정보.csv 에서 읽어요 (고칠 곳은 거기 한 곳, 관리자 모드 "음악방송 · 음방 기본 정보").
최근 3번이 모두 평소 시간과 다르면 notes 에 남기고, 자료 점검(health_check.py)이 알려 줘요.
엠카운트다운(Mnet)은 받을 수 있는 공식 편성표가 없어서 빠져 있어요 (결방은 음방정보.csv 결방 칸에 직접).
"""
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'onair.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
MOVED = 5        # 평소와 이만큼(분) 이상 다르면 시간 변경
NEAR = 240       # 평소 시간 앞뒤 이만큼(분) 안에 있는 것만 그 회차로 봐요 (새벽 · 밤 재방송 빼기)
BACK, AHEAD = 21, 14

# 음방 아이디 → (방송사, 채널, 제목 규칙)
SOURCES = {
    'showkpop': ('arirang', 'CH_K', r'SHOW\s*K-?POP'),
    'theshow': ('sbs', 'Fil', r'^\s*더\s*쇼'),           # SBS LIFE
    'showchamp': ('mbcplus', 'P_music', r'쇼\s*챔피언'),  # MBC M
    'musicbank': ('kbs', '12', r'뮤직\s*뱅크'),           # KBS2
    'musiccore': ('mbc', 'MBC', r'음악\s*중심'),
    'inkigayo': ('sbs', 'SBS', r'인기가요'),
}
RERUN = re.compile(r'\(재\)|재방')


def get(url, data=None):
    headers = {'User-Agent': UA, 'Accept': 'application/json'}
    if data is not None:
        data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def hm(s):
    """'1705' · '17050000' · '17:05' → '17:05'"""
    s = re.sub(r'\D', '', str(s or ''))
    return f'{s[:2]}:{s[2:4]}' if len(s) >= 4 else ''


# 방송사별: 그날 편성 목록 [{start, end, title, rerun}] (편성표가 아직 없으면 빈 목록)
def kbs(ch, d):
    ymd = d.strftime('%Y%m%d')
    days = get('https://static.api.kbs.co.kr/mediafactory/v1/schedule/weekly?rtype=json&local_station_code=00'
               f'&channel_code={ch}&program_planned_date_from={ymd}&program_planned_date_to={ymd}')
    return [{'start': hm(s.get('service_start_time') or s.get('program_planned_start_time')),
             'end': hm(s.get('service_end_time') or s.get('program_planned_end_time')),
             'title': s.get('program_title') or '', 'rerun': s.get('rerun_classification') == '재방'}
            for day in days if isinstance(day, dict) for s in day.get('schedules') or []]


def mbc(ch, d):
    rows = get(f'https://control.imbc.com/Schedule/TV?sDate={d:%Y%m%d}&sType=ALL') or []
    return [{'start': hm(x.get('StartTime')), 'end': hm(x.get('EndTime')), 'title': x.get('Title') or '', 'rerun': False} for x in rows]


def mbcplus(ch, d):
    rows = get(f'https://control.imbc.com/Schedule/MBCPlus?sDate={d:%Y%m%d}&sType={ch}') or []
    return [{'start': hm(x.get('StartTime')), 'end': hm(x.get('EndTime')), 'title': x.get('ProgramTitle') or '', 'rerun': False} for x in rows]


def sbs(ch, d):
    try:
        rows = get(f'https://static.cloud.sbs.co.kr/schedule/{d.year}/{d.month}/{d.day}/{ch}.json')
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):  # 아직 안 올라온 날짜
            return []
        raise
    return [{'start': hm(x.get('start_time')), 'end': hm(x.get('end_time')), 'title': x.get('title') or '', 'rerun': False} for x in rows or []]


def arirang(ch, d):
    body = {'address': 'https://script.arirang.com/api/v1/bis/listScheduleV3.do', 'method': 'POST', 'headers': {},
            'body': {'data': {'dmParam': {'chanId': ch, 'broadYmd': f'{d:%Y%m%d}', 'planNo': '1'}}}}
    rows = (get('https://www.arirang.com/v1.0/open/external/proxy', body).get('responseBody') or {}).get('dsSchWeek') or []
    return [{'start': hm(x.get('broadHm')), 'end': '', 'title': x.get('displayNm') or x.get('pgmNm') or '', 'rerun': False}
            for x in rows if str(x.get('broadYmd') or f'{d:%Y%m%d}') == f'{d:%Y%m%d}']


FETCH = {'kbs': kbs, 'mbc': mbc, 'mbcplus': mbcplus, 'sbs': sbs, 'arirang': arirang}
mins = lambda t: int(t[:2]) * 60 + int(t[3:5])


def pick(rows, pattern, regular):
    """그날 목록에서 그 음방 본방 고르기. 목록이 비면 None(모름), 없으면 {'off': True}"""
    rows = [r for r in rows if r['start']]
    if not rows:
        return None
    rows.sort(key=lambda r: mins(r['start']))
    for i, r in enumerate(rows):  # 끝 시간이 없으면 다음 프로그램 시작 시간
        if not r['end'] and i + 1 < len(rows):
            r['end'] = rows[i + 1]['start']
    hits = [r for r in rows if re.search(pattern, r['title'], re.I) and not r['rerun'] and not RERUN.search(r['title'])
            and abs(mins(r['start']) - mins(regular)) <= NEAR]
    if not hits:
        return {'off': True}
    best = min(hits, key=lambda r: abs(mins(r['start']) - mins(regular)))
    return {'start': best['start'], 'end': best['end']} if best['end'] else {'start': best['start']}


def shows():
    """sheet-templates/음방정보.csv 에서 아이디 · 이름 · 요일(0=일 … 6=토) · 평소 시간"""
    import csv
    with open(ROOT / 'sheet-templates' / '음방정보.csv', encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    return {r['아이디']: {'day': '일월화수목금토'.index(r['요일']), 'name': r['음방'], 'time': r['시작']} for r in rows if r.get('요일') in list('일월화수목금토')}


def stale_note(show, days, today):
    """지난 방송 최근 3번이 모두 평소 시간과 다르면 한 줄"""
    past = [(d, v) for d, v in sorted(days.items()) if d < today and v.get('start')][-3:]
    if len(past) == 3 and all(abs(mins(v['start']) - mins(show['time'])) >= MOVED for _, v in past):
        got = ' · '.join(f"{d[5:].replace('-', '/')} {v['start']}" for d, v in past)
        return f"{show['name']}: 최근 3번 방송({got})이 모두 평소 {show['time']}와 달라요. 관리자 모드 「음악방송 · 음방 기본 정보」의 시작 시간을 확인해 주세요."
    return ''


def main():
    now = datetime.now(KST)
    today = now.date()
    try:
        prev = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    except Exception:
        prev = {}
    old = prev.get('air') or {}
    lo, hi = (today - timedelta(days=BACK)).isoformat(), (today + timedelta(days=AHEAD)).isoformat()
    info = shows()
    air, notes, ok, fail = {}, [], 0, 0
    for sid, (kind, ch, pattern) in SOURCES.items():
        show = info.get(sid)
        if not show:
            print(f'[onair] {sid}: 음방정보.csv 에서 못 찾음', file=sys.stderr)
            fail += 1
            continue
        days = {d: v for d, v in (old.get(sid) or {}).items() if lo <= d <= hi}  # 못 받은 날짜는 예전 값
        for k in range(-BACK, AHEAD + 1):
            d = today + timedelta(days=k)
            if (d.weekday() + 1) % 7 != show['day']:  # 파이썬 월=0 → 사이트 일=0
                continue
            try:
                got = pick(FETCH[kind](ch, d), pattern, show['time'])
                ok += 1
            except Exception as e:
                print(f'[onair] {show["name"]} {d}: 실패 ({e})', file=sys.stderr)
                fail += 1
                continue
            if got is not None:
                days[d.isoformat()] = got
        air[sid] = dict(sorted(days.items()))
        note = stale_note(show, air[sid], today.isoformat())
        if note:
            notes.append(note)
        print(f'[onair] {show["name"]}: ' + ', '.join(f"{d[5:]} {v.get('start', '결방')}" for d, v in air[sid].items()), file=sys.stderr)
    if not ok:
        print('[onair] 모두 실패, 파일을 바꾸지 않아요', file=sys.stderr)
        return 1
    if air == prev.get('air') and notes == prev.get('notes', []):
        print('[onair] 바뀐 편성 없음', file=sys.stderr)
        return 0
    data = {'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'air': air, 'notes': notes}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[onair] 저장함 (실패 {fail}건)', file=sys.stderr)
    return 0


def self_test():
    reg = '17:05'
    rows = [{'start': '05:00', 'end': '06:30', 'title': '뮤직뱅크', 'rerun': True},
            {'start': '16:45', 'end': '', 'title': '뮤직뱅크', 'rerun': False},
            {'start': '18:15', 'end': '19:00', 'title': '뉴스', 'rerun': False},
            {'start': '23:50', 'end': '', 'title': '뮤직뱅크(재)', 'rerun': False}]
    assert pick(rows, r'뮤직\s*뱅크', reg) == {'start': '16:45', 'end': '18:15'}, '본방 고르기 · 끝 시간 채우기'
    assert pick([], r'뮤직뱅크', reg) is None, '편성표 없음 = 모름'
    assert pick(rows[2:3], r'뮤직뱅크', reg) == {'off': True}, '편성표에 없음 = 결방'
    assert pick([{'start': '02:00', 'end': '03:00', 'title': '뮤직뱅크', 'rerun': False}], r'뮤직뱅크', reg) == {'off': True}, '새벽 방송은 그 회차 아님'
    assert hm('17050000') == '17:05' and hm('1700') == '17:00' and hm('18:00') == '18:00'
    s = {'name': '뮤직뱅크', 'time': '17:15'}
    days = {'2026-10-16': {'start': '17:05'}, '2026-10-23': {'start': '17:05'}, '2026-10-30': {'start': '17:05'}, '2026-11-06': {'start': '16:45'}}
    assert stale_note(s, days, '2026-11-04'), '최근 3번 모두 다름'
    assert not stale_note({**s, 'time': '17:05'}, days, '2026-11-04'), '평소대로면 조용히'
    assert set(shows()) >= set(SOURCES), 'MUSIC_SHOWS 읽기'
    print('✓ crawl_onair 규칙 확인')


if __name__ == '__main__':
    if '--test' in sys.argv:
        self_test()
        sys.exit(0)
    sys.exit(main())
