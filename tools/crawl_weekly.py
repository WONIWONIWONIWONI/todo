"""디시 아이돌 컨텐츠 갤러리의 "리센느 주간 배급 일정표"를 읽어 data/weekly.json 으로 저장해요.

GitHub Actions(.github/workflows/weekly.yml)가 매일 밤 00시(한국 시간)에 실행해요.
- 갤러리에서 제목에 "리센느 주간 배급 일정표"가 들어간 가장 최근 글을 찾고
- 글 속 일정표 그림을 Claude에게 보여 줘서 일정 목록(JSON)으로 바꾼 뒤
- data/weekly.json 을 통째로 바꿔요. (사이트에서 출처는 "기타"로, 링크 없이 보여요)
- 글과 그림이 지난번과 같으면 Claude를 다시 부르지 않아요.

필요한 것: GitHub 저장소 Secrets 에 ANTHROPIC_API_KEY
"""
import base64
import hashlib
import html
import json
import os
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
MODEL = 'claude-opus-5-5'


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


SCHEMA = {
    'type': 'object',
    'properties': {
        'events': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'date': {'type': 'string', 'description': 'YYYY-MM-DD'},
                    'end': {'type': 'string', 'description': 'YYYY-MM-DD, 여러 날이면 마지막 날, 아니면 date와 같게'},
                    'time': {'type': 'string', 'description': 'HH:MM (24시간), 종일이거나 시간이 없으면 빈 문자열'},
                    'category': {'type': 'string', 'description': '그림 속 분류 글자 그대로 (예: 음방, 유튜브, 앨범일정, 행사, 굿즈, 예약판매)'},
                    'title': {'type': 'string'},
                    'note': {'type': 'string', 'description': '괄호 속 설명(출연 멤버, 판매처 등). 없으면 빈 문자열'},
                },
                'required': ['date', 'end', 'time', 'category', 'title', 'note'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['events'],
    'additionalProperties': False,
}


def ask_claude(post, images):
    import anthropic  # pip install anthropic

    client = anthropic.Anthropic()
    content = []
    for data in images:
        content.append({'type': 'image', 'source': {'type': 'base64', 'media_type': media_type(data), 'data': base64.standard_b64encode(data).decode('ascii')}})
    content.append({'type': 'text', 'text': (
        f"이 그림은 K-pop 그룹 리센느(RESCENE)의 팬이 만든 주간 일정표예요.\n"
        f"글 제목: {post['title']}\n글 올린 날: {post['posted']} (연도는 이 날짜와 제목의 주를 기준으로 정해 주세요)\n"
        f"글 본문 일부: {post['text']}\n\n"
        "그림에 적힌 일정을 하나도 빠짐없이, 적힌 그대로 옮겨 주세요. 추측해서 없는 일정을 만들지 마세요.\n"
        "하트·별 같은 장식 기호만 있는 제목(예: ♡♡♡)도 그대로 옮기되 title에 기호를 적어 주세요.\n"
        "'종일'은 time을 빈 문자열로, '(5일까지)'처럼 기간이 있으면 end에 마지막 날을 넣고 그 기간 글자는 note에 넣지 마세요."
    )})
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=8000,
        betas=['server-side-fallback-2026-07-01'],
        fallbacks='default',
        output_config={'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        messages=[{'role': 'user', 'content': content}],
    )
    if resp.stop_reason == 'refusal':
        raise RuntimeError('Claude가 읽기를 거절했어요')
    text = next(b.text for b in resp.content if b.type == 'text')
    return json.loads(text)['events']


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


def main():
    now = datetime.now(KST)
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            old = {}
    found = latest_post()
    if not found:
        print('[주간] 일정표 글을 찾지 못했어요. 그대로 둬요.', file=sys.stderr)
        return 0
    no, list_title = found
    post = read_post(no)
    if not post['images']:
        print(f'[주간] {no} 글에 그림이 없어요. 그대로 둬요.', file=sys.stderr)
        return 0
    images = [get(u, referer=VIEW + no, binary=True) for u in post['images'][:3]]
    digest = hashlib.sha256(b''.join(images)).hexdigest()[:16]
    if old.get('post') == no and old.get('image') == digest:
        print(f'[주간] {no} 글이 그대로예요. 다시 읽지 않아요.', file=sys.stderr)
        return 0
    if not os.environ.get('ANTHROPIC_API_KEY'):
        print('[주간] ANTHROPIC_API_KEY 가 없어서 그림을 읽지 못해요. 저장소 Secrets에 넣어 주세요.', file=sys.stderr)
        return 1
    events = clean(ask_claude(post, images))
    if not events:
        print('[주간] 읽은 일정이 없어요. 그대로 둬요.', file=sys.stderr)
        return 1
    data = {'updated': now.strftime('%Y-%m-%dT%H:%M:%S+09:00'), 'post': no, 'title': post['title'] or list_title,
            'image': digest, 'events': events}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'[주간] {no} "{data["title"]}" 일정 {len(events)}개 저장', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
