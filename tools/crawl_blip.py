"""blip 리센느 스케줄을 받아 data/blip.json 으로 저장해요.

GitHub Actions(.github/workflows/blip.yml)가 3시간마다 실행해요.
blip은 브라우저에서 바로 불러올 수 없어서, 여기서 받아 사이트 파일로 둬요.
지난달 ~ 2달 뒤까지 받아요. 받기에 실패한 달은 예전 내용을 그대로 둬요.
"""
import json
import pathlib
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
UNIT_ID = 133  # 리센느
PAGE = 'https://blip.kr/artists/RESCENE/schedule'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'blip.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

# blip 일정 분류 번호 → 이름 (모르는 번호는 '기타')
TYPE_NAMES = {1: '방송', 2: '발매', 3: '굿즈', 4: '기념일', 5: '공연', 6: '이벤트'}


def fetch(year, month):
    url = f'{PAGE}?unitId={UNIT_ID}&year={year}&month={month}'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8')


def parse(page, year, month):
    # 페이지 안에 들어 있는 Next.js 데이터 조각을 모아서, 이 달 일정 목록을 찾음
    text = ''
    for body in re.findall(r'<script\b[^>]*>(.*?)</script>', page, re.S):
        m = re.fullmatch(r'\s*self\.__next_f\.push\((.*)\)\s*;?\s*', body, re.S)
        if not m:
            continue
        try:
            v = json.loads(m.group(1))
        except json.JSONDecodeError:
            continue
        if isinstance(v, list) and len(v) == 2 and v[0] == 1 and isinstance(v[1], str):
            text += v[1]
    found = []

    def visit(v):
        if isinstance(v, dict):
            if v.get('queryKey') == ['schedule', year, month, UNIT_ID]:
                st = v.get('state') or {}
                if st.get('status') == 'success' and isinstance(st.get('data'), list):
                    found.append(st['data'])
            for c in v.values():
                visit(c)
        elif isinstance(v, list):
            for c in v:
                visit(c)

    for line in text.splitlines():
        if ':' not in line:
            continue
        try:
            visit(json.loads(line.split(':', 1)[1]))
        except json.JSONDecodeError:
            continue
    if not found:
        raise ValueError('schedule data not found')
    return found[0]


def kst(s):
    return datetime.fromisoformat(str(s).replace('Z', '+00:00')).astimezone(KST)


def normalize(rec):
    title = str(rec.get('title') or '').strip()
    if title.startswith('<') and title.endswith('>'):
        title = title[1:-1].strip()
    start = kst(rec['startTime'])
    end = kst(rec.get('endTime') or rec['startTime'])
    if end < start:
        end = start
    allday = bool(rec.get('isAllday'))
    # 하루 종일 일정의 끝은 다음날 0시로 오는 경우가 있어 하루 당김
    end_date = end.date()
    if allday and end_date > start.date() and end.hour == 0 and end.minute == 0:
        end_date -= timedelta(days=1)
    field = rec.get('extField') or {}
    place = str(field.get('value') or '') if isinstance(field, dict) and field.get('key') == '장소' else ''
    h = rec.get('idHash') or ''
    link = f'https://s.blip.kr/s/{h}' if re.fullmatch(r'[A-Za-z0-9_-]{1,64}', str(h)) else f'{PAGE}?unitId={UNIT_ID}'
    members = [m.get('name') for m in rec.get('members') or [] if isinstance(m, dict) and m.get('name')]
    return {
        'id': str(rec.get('scheduleId')),
        'date': start.date().isoformat(),
        'end': end_date.isoformat(),
        'time': '' if allday else start.strftime('%H:%M'),
        'title': title,
        'type': TYPE_NAMES.get(rec.get('typeId'), '기타'),
        'place': place,
        'members': members,
        'link': link,
    }


def main():
    now = datetime.now(KST)
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8')).get('months', {})
        except Exception:
            old = {}
    months = {}
    ok = 0
    for off in (-1, 0, 1, 2):
        y, m = divmod(now.year * 12 + now.month - 1 + off, 12)
        m += 1
        key = f'{y}-{m:02d}'
        try:
            evs = [normalize(r) for r in parse(fetch(y, m), y, m) if isinstance(r, dict) and r.get('unitId') == UNIT_ID and r.get('title')]
            evs.sort(key=lambda e: (e['date'], e['time'] or '00:00', e['title']))
            months[key] = evs
            ok += 1
            print(f'[blip] {key}: {len(evs)}개', file=sys.stderr)
        except Exception as e:  # 실패한 달은 예전 내용 유지
            print(f'[blip] {key} 실패: {e}', file=sys.stderr)
            if key in old:
                months[key] = old[key]
    if not ok:
        print('[blip] 모두 실패, 파일을 바꾸지 않아요', file=sys.stderr)
        return 1
    # 예전 달 기록도 남겨 둠 (최근 12달)
    for k, v in old.items():
        months.setdefault(k, v)
    keep = sorted(months)[-12:]
    data = {'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'months': {k: months[k] for k in keep}}
    new_text = json.dumps(data, ensure_ascii=False, indent=1)
    # 내용이 같으면 시간만 바뀌는 커밋을 만들지 않음
    if OUT.exists():
        try:
            prev = json.loads(OUT.read_text(encoding='utf-8'))
            if prev.get('months') == data['months']:
                print('[blip] 바뀐 일정 없음', file=sys.stderr)
                return 0
        except Exception:
            pass
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(new_text + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main())
