"""음총팀 X(@ResceneStream) 새 글을 받아 관리자 모드 "받은 공지" 대기 목록(data/inbox.json)에 쌓아요.

    python tools/crawl_x.py           # 받아서 저장 (비밀값 X_AUTH_TOKEN · X_CT0 필요)
    python tools/crawl_x.py --test    # 고르는 규칙만 확인 (인터넷 안 씀)

GitHub Actions(.github/workflows/x-inbox.yml)가 10분마다 실행해요 (관리자 워커가 실행 버튼을 대신 눌러요).
X 임베드 타임라인 주소(syndication.twitter.com, 블로그에 X 글을 붙일 때 쓰는 것)에서 최근 글 20개쯤을 받아요.
  - X 웹 내부 주소(GraphQL)는 X 앞단 Cloudflare가 GitHub 서버를 로봇으로 보고 막아서("Just a moment") 못 써요. 임베드 주소는 안 막혀요
  - 로그인 안 하면 빈 목록이 와서, 사용자 X 계정의 로그인 쿠키(auth_token · ct0)를 GitHub 비밀값으로 붙여요
  - 크롬처럼 접속하려고 curl-cffi 를 써요 (pip install curl-cffi)
  - 아주 긴 글은 앞부분만 와요. 끝에 … 를 붙이고, 전체는 관리자 모드 "X에서 보기"로
받은 글은 사이트에 바로 나가지 않아요. 관리자 모드에서 사용자가 넣을 탭(공지 팝업 · 할 일 · 연합 등)을 골라 고친 뒤 저장하거나 건너뛰어요.
  - 리트윗 · 남에게 단 답글은 빼요 (자기 글에 이어 쓴 글은 넣어요)
  - 처음 보는 글만 넣고, 사용자가 처리한 상태(state)는 그대로 둬요. 최근 KEEP 개만 보관해요
  - 올라온 지 FIRST_DAYS 일 안 글만 넣어요 (처음 켤 때 옛 글 · 고정 글이 쏟아지지 않게)
  - 디시 주소는 글에서 지워요 (사이트 규칙)
"""
import html
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'inbox.json'
SCREEN = 'ResceneStream'
FEED = f'https://syndication.twitter.com/srv/timeline-profile/screen-name/{SCREEN}'
KEEP = 60
FIRST_DAYS = 3
DC = re.compile(r'https?://\S*(dcinside|dcimg)\S*', re.I)
TODO = re.compile(r'투표|스밍|스트리밍|총공|인증|참여')
WAIT = re.compile(r'대기|하지\s*말|참여하지|자제')


class Stop(Exception):
    """사람이 손봐야 하는 문제 (한 줄 이유)"""


# ---------- X 부르기 ----------
def fetch(auth, ct0):
    """임베드 타임라인에서 글(옛 v1.1 모양 dict) 목록을 받아요"""
    from curl_cffi import requests as cr  # 실행할 때만 필요 (--test 는 없어도 됨)
    try:
        r = cr.get(FEED, impersonate='chrome', timeout=20, cookies={'auth_token': auth, 'ct0': ct0})
    except Exception as e:
        raise Stop(f'X에 닿지 못했어요 ({type(e).__name__}). 다음 번에 다시 해요')
    if 'Just a moment' in r.text:
        raise Stop('X 앞단(Cloudflare)이 이 서버를 로봇으로 보고 막았어요 ("Just a moment" 화면). 쿠키 문제가 아니에요')
    if r.status_code != 200:
        raise Stop(f'X 임베드 주소가 {r.status_code} 로 답했어요: {r.text[:200]}')
    return entries(r.text)


def entries(page):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', page, re.S)
    if not m:
        raise Stop('X 임베드 화면 모양이 바뀌었어요 (__NEXT_DATA__ 없음). tools/crawl_x.py 를 고쳐야 해요')
    es = (((json.loads(m.group(1)).get('props') or {}).get('pageProps') or {}).get('timeline') or {}).get('entries') or []
    got = [e['content']['tweet'] for e in es if isinstance((e.get('content') or {}).get('tweet'), dict)]
    if not got:
        # 로그인 안 된 채로 부르면 빈 목록이 와요
        raise Stop('X가 글 목록을 비워서 보냈어요. 로그인 쿠키가 풀렸을 수 있어요: auth_token · ct0 를 같은 브라우저에서 새로 복사해 둘 다 다시 넣어 주세요')
    return got


# ---------- 글 고르기 (인터넷 안 씀) ----------
def weight(text):
    """X 글자 수 (한글 · 이모지 같은 넓은 글자는 2)"""
    return sum(1 if ord(c) < 0x1100 else 2 for c in text)


def full_text(t):
    """t.co 짧은 주소는 원래 주소로, 사진 주소는 지움, &gt; 같은 것은 원래 글자로. 잘려 온 긴 글이면 끝에 …"""
    text = t.get('full_text') or t.get('text') or ''
    ents = t.get('entities') or {}
    cut = weight(text) >= 270  # 280자(긴 글 앞부분) 가까이 차 있으면 잘린 것
    for u in ents.get('urls') or []:
        if u.get('url') and u.get('expanded_url'):
            text = text.replace(u['url'], u['expanded_url'])
    for m in ents.get('media') or []:
        text = text.replace(m.get('url', '\0'), '')
    text = re.sub(r'[ \t]+\n', '\n', DC.sub('', html.unescape(text))).strip()
    return text + ' …' if cut and text else text


def tweets(got):
    """이 계정이 직접 쓴 글만 (리트윗 · 남에게 단 답글 빼고)"""
    out, seen = [], set()
    for t in got:
        user = t.get('user') or {}
        tid = t.get('id_str')
        if not tid or tid in seen or (user.get('screen_name') or '').lower() != SCREEN.lower():
            continue
        if t.get('retweeted_status') or (t.get('full_text') or t.get('text') or '').startswith('RT @'):
            continue
        if t.get('in_reply_to_user_id_str') not in (None, user.get('id_str')):
            continue
        seen.add(tid)
        at = datetime.strptime(t['created_at'], '%a %b %d %H:%M:%S %z %Y').astimezone(KST)
        out.append({'id': tid, 'url': f'https://x.com/{SCREEN}/status/{tid}', 'at': at.strftime('%Y-%m-%dT%H:%M'), 'text': full_text(t)})
    return out


def guess(text):
    return 'todo' if TODO.search(text) and not WAIT.search(text) else 'notice'


def merge(inbox, got, now):
    """새 글만 앞에 붙이고 (사용자가 고른 state 는 그대로), 최근 KEEP 개만. 바뀌었으면 True"""
    items = inbox.get('items') or []
    have = {x['id'] for x in items}
    # 늘 FIRST_DAYS 일 안 글만 (처음에만 거르면 두 번째에 그보다 옛 글이 들어와요)
    cut = (now - timedelta(days=FIRST_DAYS)).strftime('%Y-%m-%dT%H:%M')
    new = [dict(t, guess=guess(t['text']), state='wait') for t in got if t['id'] not in have and t['text'] and t['at'] >= cut]
    if not new:
        return False
    inbox['items'] = sorted(new + items, key=lambda x: x['at'], reverse=True)[:KEEP]
    inbox['updated'] = now.strftime('%Y-%m-%dT%H:%M')
    return True


def cookie(name, key):
    """비밀값에 같이 붙여 넣기 쉬운 따옴표 · 'ct0=' 앞글자 · 끝의 ';' 를 떼요"""
    v = os.environ.get(name, '').strip().strip('"\'').strip()
    return re.sub(rf'^{key}\s*=\s*', '', v).rstrip(';').strip()


def bad_cookie(auth, ct0):
    """쿠키 모양이 이상하면 이유 (값은 안 보여 줌). auth_token 은 16진수 40자, ct0 는 16진수 32자 이상"""
    why = []
    if not re.fullmatch(r'[0-9a-f]{40}', auth):
        why.append(f'X_AUTH_TOKEN 이 16진수 40자가 아니에요 ({len(auth)}자)')
    if not re.fullmatch(r'[0-9a-f]{32,}', ct0):
        why.append(f'X_CT0 이 16진수 32자 이상이 아니에요 ({len(ct0)}자)')
    return ' · '.join(why)


def main():
    auth, ct0 = cookie('X_AUTH_TOKEN', 'auth_token'), cookie('X_CT0', 'ct0')
    if bool(auth) != bool(ct0):
        # 하나만 있으면 이름을 잘못 넣은 것 (예: CT0) → 실패로 보여야 알아챔
        print(f"X 로그인 정보가 하나만 있어요 (X_AUTH_TOKEN {'있음' if auth else '없음'} · X_CT0 {'있음' if ct0 else '없음'}). 비밀값 이름을 확인해 주세요")
        return 1
    if not auth:
        # 아직 비밀값을 안 넣었으면 실패(메일)로 치지 않고 조용히 끝
        print('X 로그인 정보가 아직 없어요. GitHub 저장소 Settings → Secrets 에 X_AUTH_TOKEN · X_CT0 를 넣으면 받기 시작해요')
        return 0
    if bad_cookie(auth, ct0):
        print('X 로그인 정보 모양이 이상해요: ' + bad_cookie(auth, ct0) + '. 브라우저 쿠키에서 값만 다시 복사해 주세요')
        return 1
    inbox = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'items': []}
    try:
        got = tweets(fetch(auth, ct0))
    except Stop as e:
        print('✗ ' + str(e))
        return 1
    if merge(inbox, got, datetime.now(KST)):
        OUT.write_text(json.dumps(inbox, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print(f'✓ 새 글 {sum(1 for x in inbox["items"] if x["state"] == "wait")}개 대기 중 (이번에 받은 글 {len(got)}개)')
    else:
        print(f'변화 없음 (받은 글 {len(got)}개)')
    return 0


def test():
    me = {'screen_name': SCREEN, 'id_str': '111'}
    tw = lambda i, text, **kw: dict({'id_str': i, 'full_text': text, 'user': me, 'created_at': 'Fri Nov 06 08:00:00 +0000 2026', 'in_reply_to_user_id_str': None, 'entities': {'urls': [{'url': 'https://t.co/a', 'expanded_url': 'https://x.com/a'}], 'media': [{'url': 'https://t.co/pic'}]}}, **kw)
    page = '<html><script id="__NEXT_DATA__" type="application/json">' + json.dumps({'props': {'pageProps': {'timeline': {'entries': [{'type': 'tweet', 'content': {'tweet': x}} for x in [
        tw('1', '🚫 사전투표 참여 대기\n더쇼 대기해 주세요 &gt; https://t.co/a https://t.co/pic'),
        tw('2', '🗳 MMA 투표 매일 3표\n11/6 ~ 11/13 23:59 참여해 주세요 https://gall.dcinside.com/x'),
        tw('3', 'RT @someone: 남의 글', retweeted_status={'id_str': '9'}),
        tw('4', '@fan 답글', in_reply_to_user_id_str='999'),
        tw('5', '이어 쓴 글', in_reply_to_user_id_str='111'),
        tw('6', '남의 계정 글', user={'screen_name': 'other', 'id_str': '999'}),
        tw('1', '같은 글 두 번'),
        tw('8', '가' * 140),
    ]]}}}}) + '</script></html>'
    got = tweets(entries(page))
    assert [t['id'] for t in got] == ['1', '2', '5', '8'], got
    assert got[0]['text'] == '🚫 사전투표 참여 대기\n더쇼 대기해 주세요 > https://x.com/a', got[0]['text']
    assert got[0]['at'] == '2026-11-06T17:00' and got[0]['url'].endswith('/status/1')
    assert got[1]['text'].startswith('🗳 MMA 투표') and 'dcinside' not in got[1]['text'] and not got[1]['text'].endswith('…')
    assert got[3]['text'].endswith(' …')  # 잘려 온 긴 글
    for bad in ('<html></html>', '<script id="__NEXT_DATA__">{"props":{"pageProps":{"timeline":{"entries":[]}}}}</script>'):
        try:
            entries(bad)
            raise AssertionError(bad)
        except Stop:
            pass
    got = got[:3]
    assert guess(got[0]['text']) == 'notice' and guess(got[1]['text']) == 'todo' and guess('콘서트 안내') == 'notice'
    now = datetime(2026, 11, 6, 18, 0, tzinfo=KST)
    old = dict(got[0], id='0', at='2026-10-01T10:00')
    inbox = {'items': []}
    assert merge(inbox, got + [old], now) and [x['id'] for x in inbox['items']] == ['1', '2', '5']  # 처음엔 3일 안 글만
    inbox['items'][0]['state'] = 'done'
    assert not merge(inbox, got + [old], now)  # 같은 글 · 옛 글이면 바뀐 것 없음 (두 번째에도 옛 글은 안 들어옴)
    assert merge(inbox, [dict(got[2], id='7', at='2026-11-06T18:00')] + got, now)
    assert [x['id'] for x in inbox['items']][:2] == ['7', '1'] and inbox['items'][1]['state'] == 'done'  # 고른 상태 유지
    os.environ.update(X_AUTH_TOKEN=' "auth_token=' + 'a' * 40 + ';" ', X_CT0='ct0=' + 'b' * 160)
    assert cookie('X_AUTH_TOKEN', 'auth_token') == 'a' * 40 and cookie('X_CT0', 'ct0') == 'b' * 160
    assert not bad_cookie('a' * 40, 'b' * 160) and '39자' in bad_cookie('a' * 39, 'b' * 160) and 'X_CT0' in bad_cookie('a' * 40, 'xyz')
    print('✓ 규칙 확인 끝')


if __name__ == '__main__':
    if '--test' in sys.argv:
        test()
        sys.exit(0)
    sys.exit(main())
