"""blip 리센느 스케줄을 받아 data/blip.json 으로 저장하고,
Mnet Plus + blip 일정을 합친 구독용 캘린더 파일 data/rescene.ics 도 만들어요.

GitHub Actions(.github/workflows/blip.yml)가 3시간마다 실행해요.
blip은 브라우저에서 바로 불러올 수 없어서, 여기서 받아 사이트 파일로 둬요.
지난달 ~ 2달 뒤까지 받아요. 받기에 실패한 달은 예전 내용을 그대로 둬요.
"""
import hashlib
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
    stamp = now.strftime('%Y-%m-%dT%H:%M:%S+09:00')
    try:
        prev = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {}
    except Exception:
        prev = {}
    months = {k: months[k] for k in keep}
    mnet, mnet_months = write_ics(months, now)
    # Mnet Plus 일정 사본: 사이트가 Mnet Plus에 바로 연결되지 않을 때 대신 보여 줘요 (받은 달만 바꾸고 나머지는 유지)
    slim = lambda e: {k: e[k] for k in ('id', 'date', 'time', 'title', 'type')}
    mnet_store = {**(prev.get('mnet') or {}), **{k: [slim(e) for e in v] for k, v in mnet_months.items()}}
    mnet_store = {k: mnet_store[k] for k in sorted(mnet_store)[-12:]}
    # Mnet Plus 공식 일정이 바뀌었는지 (지문으로 비교, 못 받았으면 예전 값 유지)
    mnet_hash = hashlib.sha1(json.dumps(mnet, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:16] if mnet else prev.get('mnet_hash', '')
    blip_changed = prev.get('months') != months
    mnet_changed = bool(mnet) and mnet_hash != prev.get('mnet_hash')
    data = {'updated': stamp if blip_changed or not prev.get('updated') else prev['updated'],
            'mnet_updated': stamp if mnet_changed or not prev.get('mnet_updated') else prev['mnet_updated'],
            'mnet_hash': mnet_hash, 'months': months, 'mnet': mnet_store}
    # 내용이 같으면 시간만 바뀌는 커밋을 만들지 않음
    if not blip_changed and not mnet_changed and prev.get('mnet_hash') == mnet_hash and prev.get('mnet') == mnet_store:
        print('[blip] 바뀐 일정 없음', file=sys.stderr)
    else:
        print(f'[blip] 바뀜: blip {blip_changed}, Mnet Plus {mnet_changed}', file=sys.stderr)
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return 0


# ---------- 구독용 캘린더 파일 (Mnet Plus + blip) ----------
MNET_API = 'https://artist.mnetplus.world/svc/stg/rescene-official/space/api/v1/calendar'
MNET_PAGE = 'https://artist.mnetplus.world/main/stg/rescene-official/schedule'
ICS = OUT.parent / 'rescene.ics'


def mnet_month(y, m):
    last = (datetime(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    start = datetime(y, m, 1, tzinfo=KST).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    end = datetime(y, m, last, 23, 59, 59, tzinfo=KST).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    q = f'startAt={start}&startAtForAllDay={y}-{m:02d}-01&endAt={end}&endAtForAllDay={y}-{m:02d}-{last:02d}'
    req = urllib.request.Request(f'{MNET_API}?{q}', headers={'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://artist.mnetplus.world/'})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode('utf-8'))
    out = []
    for ev in d.get('events') or []:
        title = str(ev.get('title') or '').strip()
        if not title:
            continue
        if ev.get('allDay'):
            date, time = str(ev.get('startAtAllDay'))[:10], ''
        else:
            t = kst(ev['startAt'])
            date, time = t.date().isoformat(), t.strftime('%H:%M')
        out.append({'id': str(ev.get('id')), 'date': date, 'end': date, 'time': time, 'title': title,
                    'type': (ev.get('label') or {}).get('name', ''), 'place': '', 'link': f'{MNET_PAGE}/{y}/{m:02d}', 'src': 'Mnet Plus'})
    return out


def ics_escape(v):
    return str(v or '').replace('\\', '\\\\').replace('\n', '\\n').replace(',', '\\,').replace(';', '\\;')


def fold(line):
    # 캘린더 파일은 한 줄이 75바이트를 넘으면 접어야 함
    b = line.encode('utf-8')
    if len(b) <= 75:
        return line
    parts, cur = [], b''
    for ch in line:
        c = ch.encode('utf-8')
        if len(cur) + len(c) > (75 if not parts else 74):
            parts.append(cur.decode('utf-8'))
            cur = b''
        cur += c
    parts.append(cur.decode('utf-8'))
    return '\r\n '.join(parts)


def write_ics(blip_months, now):
    events = []
    seen = set()
    for evs in blip_months.values():
        for e in evs:
            if e['id'] in seen:
                continue
            seen.add(e['id'])
            events.append({**e, 'src': 'blip'})
    mnet, mnet_ok, mnet_months = [], True, {}
    for off in (-1, 0, 1, 2, 3):
        y, m = divmod(now.year * 12 + now.month - 1 + off, 12)
        try:
            got = mnet_month(y, m + 1)
            mnet += got
            mnet_months[f'{y}-{m + 1:02d}'] = got
        except Exception as err:
            mnet_ok = False
            print(f'[Mnet Plus] {y}-{m + 1:02d} 실패: {err}', file=sys.stderr)
    events += mnet
    events.sort(key=lambda e: (e['date'], e['time'] or '00:00', e['src'], e['title']))
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//rescene-todo//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
             'X-WR-CALNAME:리센느 스케줄', 'X-WR-TIMEZONE:Asia/Seoul', 'REFRESH-INTERVAL;VALUE=DURATION:PT3H', 'X-PUBLISHED-TTL:PT3H']
    for e in events:
        uid = f"{'blip' if e['src'] == 'blip' else 'mnet'}-{e['id']}@rescene-todo"
        stamp = e['date'].replace('-', '') + 'T000000Z'
        lines += ['BEGIN:VEVENT', f'UID:{uid}', f'DTSTAMP:{stamp}']
        if e['time']:
            st = datetime.fromisoformat(f"{e['date']}T{e['time']}:00+09:00").astimezone(timezone.utc)
            lines += [f"DTSTART:{st:%Y%m%dT%H%M%SZ}", f"DTEND:{st + timedelta(hours=1):%Y%m%dT%H%M%SZ}"]
        else:
            end = datetime.fromisoformat(e.get('end') or e['date']) + timedelta(days=1)
            lines += [f"DTSTART;VALUE=DATE:{e['date'].replace('-', '')}", f"DTEND;VALUE=DATE:{end:%Y%m%d}"]
        lines.append(f"SUMMARY:{ics_escape('[리센느] ' + e['title'])}")
        lines.append(f"DESCRIPTION:{ics_escape(' · '.join(filter(None, [e.get('type'), e['src'], e.get('link')])))}")
        if e.get('place'):
            lines.append(f"LOCATION:{ics_escape(e['place'])}")
        if e.get('link'):
            lines.append(f"URL:{e['link']}")
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    text = '\r\n'.join(fold(l) for l in lines) + '\r\n'
    if ICS.exists() and ICS.read_bytes().decode('utf-8') == text:
        print('[ics] 바뀐 일정 없음', file=sys.stderr)
    else:
        ICS.write_bytes(text.encode('utf-8'))
        print(f'[ics] {len(events)}개 저장', file=sys.stderr)
    # Mnet Plus 일정을 돌려줌 (한 달이라도 못 받았으면 빈 목록 → 바뀜 비교를 건너뜀) + 받은 달별 목록
    return (mnet if mnet_ok else []), mnet_months


if __name__ == '__main__':
    sys.exit(main())
