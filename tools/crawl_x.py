"""음총팀 X(@ResceneStream) 새 글을 받아 관리자 모드 "받은 공지" 대기 목록(data/inbox.json)에 쌓아요.

    python tools/crawl_x.py           # 받아서 저장 (비밀값 X_AUTH_TOKEN · X_CT0 필요)
    python tools/crawl_x.py --test    # 고르는 규칙만 확인 (인터넷 안 씀)

GitHub Actions(.github/workflows/x-inbox.yml)가 10분마다 실행해요.
X는 로그인 없이 글 목록을 안 보여 줘서, 사용자 X 계정의 로그인 쿠키(auth_token · ct0)를 GitHub 비밀값으로 넣어 써요.
X 웹사이트가 쓰는 내부 주소(UserByScreenName → UserTweets)는 공개 도구 twscrape 로 불러요 (pip install twscrape).
X가 내부를 자주 바꿔서, 그걸 따라 고쳐 주는 twscrape 에 맡기고 여기서는 받은 글 고르기만 해요.
받은 글은 사이트에 바로 나가지 않아요. 관리자 모드에서 사용자가 넣을 탭(공지 팝업 · 할 일 · 연합 등)을 골라 고친 뒤 저장하거나 건너뛰어요.
  - 리트윗 · 남에게 단 답글은 빼요 (자기 글에 이어 쓴 글은 넣어요)
  - 처음 보는 글만 넣고, 사용자가 처리한 상태(state)는 그대로 둬요. 최근 KEEP 개만 보관해요
  - 대기 목록이 비어 있을 때(처음)는 FIRST_DAYS 일 안 글만 넣어요
  - 디시 주소는 글에서 지워요 (사이트 규칙)
"""
import asyncio
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
KEEP = 60
FIRST_DAYS = 3
DC = re.compile(r'https?://\S*(dcinside|dcimg)\S*', re.I)
TODO = re.compile(r'투표|스밍|스트리밍|총공|인증|참여')
WAIT = re.compile(r'대기|하지\s*말|참여하지|자제')


class Stop(Exception):
    """사람이 손봐야 하는 문제 (한 줄 이유)"""


# ---------- X 부르기 ----------
async def fetch(auth, ct0):
    """내 계정 쿠키로 @SCREEN 최근 글 한 쪽(UserTweets 응답)을 받아요. (user_id, 응답 JSON)
    shortcut: X 내부 주소 이름·보안 값은 twscrape 가 맞춰 줘요. X가 바꾸면 twscrape 새 버전이 나와야 다시 돼요"""
    from twscrape import API, NoAccountError  # 실행할 때만 필요 (--test 는 없어도 됨)
    db = pathlib.Path(os.environ.get('RUNNER_TEMP') or ROOT / 'tools') / '.x-accounts.db'
    db.unlink(missing_ok=True)
    api = API(str(db), raise_when_no_account=True)  # 로그인이 안 되면 기다리지 말고 바로 멈춤
    try:
        await api.pool.add_account_cookies('inbox', f'auth_token={auth}; ct0={ct0}')
        user = await api.user_by_login(SCREEN)
        if not user:
            raise Stop(f'@{SCREEN} 계정을 못 찾았어요 (X 로그인 정보가 풀렸을 수 있어요)')
        async for rep in api.user_tweets_raw(user.id, limit=20):
            return str(user.id), rep.json()
        raise Stop('X가 글 목록을 비워서 보냈어요')
    except NoAccountError:
        raise Stop('X 로그인 정보(X_AUTH_TOKEN · X_CT0)가 풀렸거나 X가 잠깐 막았어요. 계속 실패하면 쿠키를 새로 넣어 주세요')
    finally:
        db.unlink(missing_ok=True)


# ---------- 글 고르기 (인터넷 안 씀) ----------
def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def full_text(t):
    """긴 글(note_tweet)이면 그 전체 글, t.co 짧은 주소는 원래 주소로, 사진 주소는 지움"""
    note = (((t.get('note_tweet') or {}).get('note_tweet_results') or {}).get('result') or {})
    lg = t['legacy']
    text = note.get('text') or lg.get('full_text', '')
    urls = ((note.get('entity_set') or {}).get('urls') or []) + ((lg.get('entities') or {}).get('urls') or [])
    for u in urls:
        if u.get('url') and u.get('expanded_url'):
            text = text.replace(u['url'], u['expanded_url'])
    for m in (lg.get('entities') or {}).get('media') or []:
        text = text.replace(m.get('url', '\0'), '')
    text = DC.sub('', text)
    return re.sub(r'[ \t]+\n', '\n', text).strip()


def tweets(data, user_id):
    """UserTweets 응답에서 이 계정이 직접 쓴 글만 (리트윗 · 남에게 단 답글 · 인용된 남의 글 빼고)"""
    out, seen = [], set()
    for o in walk(data):
        lg = o.get('legacy')
        if not (isinstance(lg, dict) and 'full_text' in lg and o.get('rest_id')):
            continue
        if lg.get('user_id_str') != user_id or o['rest_id'] in seen:
            continue
        if 'retweeted_status_result' in lg or lg.get('full_text', '').startswith('RT @'):
            continue
        if lg.get('in_reply_to_user_id_str') not in (None, user_id):
            continue
        seen.add(o['rest_id'])
        at = datetime.strptime(lg['created_at'], '%a %b %d %H:%M:%S %z %Y').astimezone(KST)
        out.append({'id': o['rest_id'], 'url': f'https://x.com/{SCREEN}/status/{o["rest_id"]}', 'at': at.strftime('%Y-%m-%dT%H:%M'), 'text': full_text(o)})
    return out


def guess(text):
    return 'todo' if TODO.search(text) and not WAIT.search(text) else 'notice'


def merge(inbox, got, now):
    """새 글만 앞에 붙이고 (사용자가 고른 state 는 그대로), 최근 KEEP 개만. 바뀌었으면 True"""
    items = inbox.get('items') or []
    have = {x['id'] for x in items}
    first = not items
    cut = (now - timedelta(days=FIRST_DAYS)).strftime('%Y-%m-%dT%H:%M')
    new = [dict(t, guess=guess(t['text']), state='wait') for t in got if t['id'] not in have and t['text'] and (not first or t['at'] >= cut)]
    if not new:
        return False
    inbox['items'] = sorted(new + items, key=lambda x: x['at'], reverse=True)[:KEEP]
    inbox['updated'] = now.strftime('%Y-%m-%dT%H:%M')
    return True


def main():
    auth, ct0 = os.environ.get('X_AUTH_TOKEN', '').strip(), os.environ.get('X_CT0', '').strip()
    if bool(auth) != bool(ct0):
        # 하나만 있으면 이름을 잘못 넣은 것 (예: CT0) → 실패로 보여야 알아챔
        print(f"X 로그인 정보가 하나만 있어요 (X_AUTH_TOKEN {'있음' if auth else '없음'} · X_CT0 {'있음' if ct0 else '없음'}). 비밀값 이름을 확인해 주세요")
        return 1
    if not auth:
        # 아직 비밀값을 안 넣었으면 실패(메일)로 치지 않고 조용히 끝
        print('X 로그인 정보가 아직 없어요. GitHub 저장소 Settings → Secrets 에 X_AUTH_TOKEN · X_CT0 를 넣으면 받기 시작해요')
        return 0
    inbox = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else {'items': []}
    try:
        user_id, d = asyncio.run(fetch(auth, ct0))
    except Stop as e:
        print('✗ ' + str(e))
        return 1
    got = tweets(d, user_id)
    if merge(inbox, got, datetime.now(KST)):
        OUT.write_text(json.dumps(inbox, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print(f'✓ 새 글 {sum(1 for x in inbox["items"] if x["state"] == "wait")}개 대기 중 (이번에 받은 글 {len(got)}개)')
    else:
        print(f'변화 없음 (받은 글 {len(got)}개)')
    return 0


def test():
    me = '111'
    tw = lambda i, text, **kw: {'__typename': 'Tweet', 'rest_id': i, 'legacy': dict({'full_text': text, 'user_id_str': me, 'created_at': 'Fri Nov 06 08:00:00 +0000 2026', 'entities': {'urls': [{'url': 'https://t.co/a', 'expanded_url': 'https://x.com/a'}], 'media': [{'url': 'https://t.co/pic'}]}}, **kw)}
    data = {'data': {'user': {'result': {'timeline': {'timeline': {'instructions': [{'entries': [
        {'content': {'itemContent': {'tweet_results': {'result': tw('1', '🚫 사전투표 참여 대기\n더쇼 대기해 주세요 https://t.co/a https://t.co/pic')}}}},
        {'content': {'itemContent': {'tweet_results': {'result': dict(tw('2', '짧은 글'), note_tweet={'note_tweet_results': {'result': {'text': '🗳 MMA 투표 매일 3표\n11/6 ~ 11/13 23:59 참여해 주세요 https://gall.dcinside.com/x', 'entity_set': {'urls': []}}}})}}}},
        {'content': {'itemContent': {'tweet_results': {'result': tw('3', 'RT @someone: 남의 글', retweeted_status_result={})}}}},
        {'content': {'itemContent': {'tweet_results': {'result': tw('4', '@fan 답글', in_reply_to_user_id_str='999')}}}},
        {'content': {'itemContent': {'tweet_results': {'result': dict(tw('5', '이어 쓴 글', in_reply_to_user_id_str=me), quoted_status_result={'result': {'rest_id': '6', 'legacy': {'full_text': '인용된 남의 글', 'user_id_str': '999', 'created_at': 'Fri Nov 06 08:00:00 +0000 2026'}}})}}}},
        {'content': {'itemContent': {'tweet_results': {'result': tw('1', '같은 글 두 번')}}}},
    ]}]}}}}}}
    got = tweets(data, me)
    assert [t['id'] for t in got] == ['1', '2', '5'], got
    assert got[0]['text'] == '🚫 사전투표 참여 대기\n더쇼 대기해 주세요 https://x.com/a', got[0]['text']
    assert got[0]['at'] == '2026-11-06T17:00' and got[0]['url'].endswith('/status/1')
    assert got[1]['text'].startswith('🗳 MMA 투표') and 'dcinside' not in got[1]['text']
    assert guess(got[0]['text']) == 'notice' and guess(got[1]['text']) == 'todo' and guess('콘서트 안내') == 'notice'
    now = datetime(2026, 11, 6, 18, 0, tzinfo=KST)
    old = dict(got[0], id='0', at='2026-10-01T10:00')
    inbox = {'items': []}
    assert merge(inbox, got + [old], now) and [x['id'] for x in inbox['items']] == ['1', '2', '5']  # 처음엔 3일 안 글만
    inbox['items'][0]['state'] = 'done'
    assert not merge(inbox, got, now)  # 같은 글이면 바뀐 것 없음
    assert merge(inbox, [dict(got[2], id='7', at='2026-11-06T18:00')] + got, now)
    assert [x['id'] for x in inbox['items']][:2] == ['7', '1'] and inbox['items'][1]['state'] == 'done'  # 고른 상태 유지
    print('✓ 규칙 확인 끝')


if __name__ == '__main__':
    if '--test' in sys.argv:
        test()
        sys.exit(0)
    sys.exit(main())
