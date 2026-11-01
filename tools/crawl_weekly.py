"""디시 아이돌 컨텐츠 갤러리의 "리센느 주간 배급 일정표"를 data/weekly.json 으로 옮겨요.

이 컴퓨터의 Claude 앱 예약 작업("주간 일정표 읽기")이 매일 밤 00시에 실행해요. (API 비용 없음)
  1) python tools/crawl_weekly.py fetch
     → 최신 글을 찾아 그림을 tools/.weekly/ 에 받고, 결과를 JSON으로 출력
       ("changed": false 면 지난번과 같은 글·그림이라 할 일 없음)
  2) Claude가 "주간 일정표"라고 적힌 그림 한 장만 보고 일정을 tools/.weekly/events.json 에 적음
     (같은 글의 다른 그림, 예: 요일별 음악방송 시간표는 읽지 않음)
     [{"date":"YYYY-MM-DD","end":"YYYY-MM-DD","time":"HH:MM 또는 빈칸","category":"분류","title":"제목","note":"괄호 설명"}]
  3) python tools/crawl_weekly.py save
     → data/weekly.json 에 새 일정만 쌓음 (예전 것은 그대로 두고, 이미 있는 일정과 Mnet Plus·blip과 겹치는 건 빠짐)
"""
import hashlib
import html
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
GALL = 'kpopcontent'
LIST = f'https://gall.dcinside.com/mgallery/board/lists/?id={GALL}&s_type=search_subject&s_keyword=' + urllib.parse.quote('주간 배급')
VIEW = f'https://gall.dcinside.com/mgallery/board/view/?id={GALL}&no='
TITLE_KEY = '리센느 주간 배급 일정표'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'weekly.json'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
TMP = pathlib.Path(__file__).resolve().parent / '.weekly'



def get(url, referer='https://gall.dcinside.com/', binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': referer})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode('utf-8', errors='ignore')


def latest_post():
    page = get(LIST)
    best = None
    for no, title in re.findall(r'view/\?id=' + GALL + r'&(?:amp;)?no=(\d+)[^"]*"[^>]*>(?:<em[^>]*></em>)?\s*([^<]+)<', page):
        title = html.unescape(title).strip()
        if TITLE_KEY in title and (best is None or int(no) > int(best[0])):
            best = (no, title)
    return best


def read_post(no):
    page = get(VIEW + no)
    m = re.search(r'class="gall_date"[^>]*title="([^"]+)"', page)
    posted = m.group(1)[:10] if m else datetime.now(KST).date().isoformat()
    t = re.search(r'<title>(.*?)</title>', page, re.S)
    title = html.unescape(t.group(1)).rsplit(' - ', 1)[0].strip() if t else ''
    i = page.find('write_div')
    body = page[page.find('>', i) + 1:i + 200000] if i >= 0 else ''
    imgs = [html.unescape(u) for u in re.findall(r'<img[^>]+src="(https://dcimg\d\.dcinside\.co(?:m|\.kr)/viewimage\.php[^"]+)"', body)]
    text = re.sub(r'<[^>]+>', ' ', body.split('<script')[0])
    text = re.sub(r'\s+', ' ', html.unescape(text)).strip()[:1500]
    return {'title': title, 'posted': posted, 'images': imgs, 'text': text}


def media_type(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:3] == b'GIF':
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return 'image/jpeg'


# 리센느 일정이 아닌데 그림에 같이 실리는 것 (제목에서 띄어쓰기 빼고 소문자로 찾음)
SKIP = ['monshow', '몬쇼']


def clean(events):
    out = []
    for i, e in enumerate(events):
        if any(k in str(e.get('title', '')).replace(' ', '').lower() for k in SKIP):
            continue
        d = str(e.get('date', ''))[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', d) or not str(e.get('title', '')).strip():
            continue
        end = str(e.get('end') or d)[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', end) or end < d:
            end = d
        t = str(e.get('time') or '').strip()
        if not re.fullmatch(r'\d{1,2}:\d{2}', t):
            t = ''
        elif len(t) == 4:
            t = '0' + t
        key = hashlib.sha1(f"{d}|{str(e['title']).strip()}".encode('utf-8')).hexdigest()[:6]
        out.append({'id': f'w{d.replace("-", "")}{key}', 'date': d, 'end': end, 'time': t,
                    'category': str(e.get('category') or '').strip(), 'title': str(e['title']).strip(),
                    'note': str(e.get('note') or '').strip()})
    out.sort(key=lambda e: (e['date'], e['time'] or '00:00'))
    return out


def fetch():
    # 최신 상태 받기 (GitHub Actions가 data/blip.json 을 자주 바꿈)
    subprocess.run(['git', 'pull', '--rebase', '-q'], cwd=OUT.parent.parent, capture_output=True)
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            old = {}
    found = latest_post()
    if not found:
        print('NO_CHANGE 일정표 글을 찾지 못함')
        return 0
    no, list_title = found
    post = read_post(no)
    if not post['images']:
        print(f'NO_CHANGE {no} 글에 그림이 없음')
        return 0
    images = [get(u, referer=VIEW + no, binary=True) for u in post['images'][:8]]
    digest = hashlib.sha256(b''.join(images)).hexdigest()[:16]
    if old.get('post') == no and old.get('image') == digest:
        print(f'NO_CHANGE {no} 그대로')
        return 0
    TMP.mkdir(parents=True, exist_ok=True)
    for f in TMP.glob('*'):
        f.unlink()
    paths = []
    for i, data in enumerate(images):
        ext = {'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp'}.get(media_type(data), 'jpg')
        f = TMP / f'week{i + 1}.{ext}'
        f.write_bytes(data)
        paths.append(str(f))
    meta = {'post': no, 'title': post['title'] or list_title, 'posted': post['posted'], 'image': digest, 'text': post['text']}
    (TMP / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    print(f"CHANGED 제목: {meta['title']} / 올린 날: {meta['posted']}")
    print('그림: ' + ', '.join(paths))
    print('저장할 곳: ' + str(TMP / 'events.json'))
    return 0


# ---------- 겹치는 일정 빼기 (사이트 app.js 의 isDup 과 같은 규칙) ----------
# 같은 날(또는 기간 안) + 비슷한 제목이면 Mnet Plus·blip에 이미 있는 일정으로 봐요.
DUP_ALIAS = [(r'엠카운트다운|엠카', 'mcountdown'), (r'뮤직뱅크|뮤뱅', 'musicbank'), (r'인기가요|인가', 'inkigayo'),
             (r'음악중심|음중', 'musiccore'), (r'쇼챔피언|쇼챔', 'showchampion'), (r'더쇼', 'theshow'),
             (r'잇츠라이브', 'itslive'), (r'쇼케이스', 'showcase'), (r'응원봉', 'lightstick'), (r'갤럭시\s*나이트', 'galaxynight')]
DUP_STOP = {'release', 'rescene', '리센느', 'notice', '안내', 'the', 'and', 'with', 'live', 'pulse', 'by', 'in', 'of'}


def dup_tokens(t):
    x = str(t or '').lower().replace("'", '').replace('’', '')
    for pat, to in DUP_ALIAS:
        x = re.sub(pat, f' {to} ', x)
    x = re.sub(r'm\s*/\s*v', 'mv', x)
    x = re.sub(r'light\s*stick', 'lightstick', x)
    x = re.sub(r'galaxy\s*night', 'galaxynight', x)
    x = re.sub(r'it\s*s\s*live', 'itslive', x)
    return [w for w in re.split(r'[^a-z0-9가-힣]+', x) if len(w) >= 2 and w not in DUP_STOP]


def is_dup(e, others):
    a = dup_tokens(e['title'])
    flat = ''.join(a)
    for o in others:
        same_day = o['date'] == e['date']
        in_range = o['date'] <= e['date'] <= (o.get('end') or o['date'])
        if not same_day and not in_range:
            continue
        b = dup_tokens(o['title'])
        if any(len(w) >= 3 and w in b for w in a):
            return True
        bf = ''.join(b)
        if len(flat) >= 3 and len(bf) >= 3 and (bf in flat or flat in bf):
            return True
    return False


def existing_events(months):
    """Mnet Plus(바로 받아 옴) + blip(data/blip.json) 일정. Mnet Plus를 못 받으면 None."""
    import crawl_blip as cb
    others = []
    try:
        blip = json.loads((OUT.parent / 'blip.json').read_text(encoding='utf-8'))
        for evs in blip.get('months', {}).values():
            others += evs
    except Exception:
        pass
    try:
        for ym in months:
            others += cb.mnet_month(int(ym[:4]), int(ym[5:7]))
    except Exception as err:
        print(f'[주간] Mnet Plus 일정을 못 받아서 겹침 확인을 건너뛰어요 ({err})', file=sys.stderr)
        return None
    return others


def save():
    meta = json.loads((TMP / 'meta.json').read_text(encoding='utf-8'))
    events = clean(json.loads((TMP / 'events.json').read_text(encoding='utf-8')))
    if not events:
        print('[주간] 일정이 하나도 없어요. 그대로 둬요.', file=sys.stderr)
        return 1
    # 예전에 모은 일정은 그대로 두고, 처음 보는 일정만 더해요
    try:
        prev = json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:
        prev = {}
    kept = list(prev.get('events') or [])
    total = len(events)
    seen = {(e['date'], ''.join(dup_tokens(e['title']))) for e in kept}
    events = [e for e in events if (e['date'], ''.join(dup_tokens(e['title']))) not in seen]
    # Mnet Plus·blip에 이미 있는 일정도 빼요
    others = existing_events(sorted({e['date'][:7] for e in events})) if events else []
    if others is not None:
        events = [e for e in events if not is_dup(e, others)]
    print(f'그림 속 일정 {total}개 중 새로 더한 일정 {len(events)}개 (모은 일정 {len(kept) + len(events)}개)')
    events = sorted(kept + events, key=lambda e: (e['date'], e['time'] or '00:00'))
    if prev.get('events') == events:
        print(f'바뀐 내용 없음: 일정 {len(events)}개')
        return 0
    now = datetime.now(KST)
    data = {'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'post': meta['post'], 'title': meta['title'],
            'image': meta['image'], 'events': events}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    # GitHub에 올리기
    root = OUT.parent.parent
    git = lambda *a: subprocess.run(['git', *a], cwd=root, capture_output=True, text=True)
    git('add', 'data/weekly.json')
    if git('diff', '--cached', '--quiet').returncode == 0:
        print(f'저장함 (바뀐 내용 없음): 일정 {len(events)}개')
        return 0
    git('commit', '-m', f"주간 일정표 갱신 ({now:%m-%d})\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
    for _ in range(3):
        if git('push').returncode == 0:
            print(f'올림: "{meta["title"]}" 일정 {len(events)}개')
            return 0
        git('pull', '--rebase')
    print('올리기 실패: git push 가 안 됨')
    return 1


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        sys.exit(fetch())
    if cmd == 'save':
        sys.exit(save())
    print('사용법: python tools/crawl_weekly.py fetch | save', file=sys.stderr)
    sys.exit(2)
