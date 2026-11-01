"""디시 아이돌 컨텐츠 갤러리의 "리센느 주간 배급 일정표"를 data/weekly.json 으로 옮겨요.

이 컴퓨터의 Claude 앱 예약 작업("주간 일정표 읽기")이 매일 밤 00시에 실행해요. (API 비용 없음)
  1) python tools/crawl_weekly.py fetch
     → 최신 글을 찾아 그림을 tools/.weekly/ 에 받고, 결과를 JSON으로 출력
       ("changed": false 면 지난번과 같은 글·그림이라 할 일 없음)
  2) Claude가 그림을 보고 일정을 tools/.weekly/events.json 에 적음
     [{"date":"YYYY-MM-DD","end":"YYYY-MM-DD","time":"HH:MM 또는 빈칸","category":"분류","title":"제목","note":"괄호 설명"}]
  3) python tools/crawl_weekly.py save
     → data/weekly.json 을 통째로 바꿈 (사이트에서 출처 "기타", 링크 없이, Mnet Plus·blip과 겹치는 건 빠짐)
"""
import hashlib
import html
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request
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


def clean(events):
    out = []
    for i, e in enumerate(events):
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
        out.append({'id': f'w{d.replace("-", "")}{i:02d}', 'date': d, 'end': end, 'time': t,
                    'category': str(e.get('category') or '').strip(), 'title': str(e['title']).strip(),
                    'note': str(e.get('note') or '').strip()})
    out.sort(key=lambda e: (e['date'], e['time'] or '00:00'))
    return out


def fetch():
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            old = {}
    found = latest_post()
    if not found:
        print(json.dumps({'changed': False, 'reason': '일정표 글을 찾지 못함'}, ensure_ascii=False))
        return 0
    no, list_title = found
    post = read_post(no)
    if not post['images']:
        print(json.dumps({'changed': False, 'reason': f'{no} 글에 그림이 없음'}, ensure_ascii=False))
        return 0
    images = [get(u, referer=VIEW + no, binary=True) for u in post['images'][:3]]
    digest = hashlib.sha256(b''.join(images)).hexdigest()[:16]
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
    changed = not (old.get('post') == no and old.get('image') == digest)
    print(json.dumps({'changed': changed, **meta, 'images': paths, 'events_file': str(TMP / 'events.json')}, ensure_ascii=False, indent=1))
    return 0


def save():
    meta = json.loads((TMP / 'meta.json').read_text(encoding='utf-8'))
    events = clean(json.loads((TMP / 'events.json').read_text(encoding='utf-8')))
    if not events:
        print('[주간] 일정이 하나도 없어요. 그대로 둬요.', file=sys.stderr)
        return 1
    now = datetime.now(KST)
    data = {'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'post': meta['post'], 'title': meta['title'],
            'image': meta['image'], 'events': events}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[주간] {meta["post"]} "{meta["title"]}" 일정 {len(events)}개 저장', file=sys.stderr)
    return 0


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'fetch':
        sys.exit(fetch())
    if cmd == 'save':
        sys.exit(save())
    print('사용법: python tools/crawl_weekly.py fetch | save', file=sys.stderr)
    sys.exit(2)
