"""사이트 자료가 잘 들어오고 있는지 하루 한 번 확인해요 (GitHub Actions '자료 점검').

    python tools/health_check.py

문제가 있으면 이유를 적고 실패로 끝나요 → GitHub가 저장소 주인에게 메일로 알려 줘요.
확인하는 것
  1) Mnet Plus 일정 주소가 아직 응답하는지 (공개 API가 아니라 언제든 바뀔 수 있어요)
  2) 디시 '리센느 주간 배급 일정표'에 새 글이 올라왔는데 하루가 지나도 data/weekly.json에 안 들어갔는지
     (그림 읽기는 사용자 PC의 Claude 앱 예약 작업이 해요. PC가 꺼져 있으면 여기서 걸려요)
  3) 실제 사이트가 열리고, 저장소의 최신 버전(app.js?v=)이 올라가 있는지
  4) 음방 편성표(data/onair.json)가 사흘 넘게 안 바뀌었는지, 평소 방송 시간이 바뀐 것 같은 음방이 있는지
디시가 GitHub 서버의 접속을 막으면 2)는 건너뛰고 경고만 남겨요 (실패로 치지 않음).
"""
import json
import pathlib
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import crawl_blip  # noqa: E402
import crawl_weekly  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
KST = timezone(timedelta(hours=9))
LIVE = 'https://woniwoniwoniwoni.github.io/todo/'
problems, notes = [], []


def check_mnet():
    now = datetime.now(KST)
    try:
        crawl_blip.mnet_month(now.year, now.month)
        notes.append('Mnet Plus 일정 주소 정상')
    except Exception as e:
        problems.append(f'Mnet Plus 일정을 못 받았어요 ({e}). 주소나 형식이 바뀌었을 수 있어요. '
                        '사이트는 data/blip.json에 받아 둔 사본을 보여 주고 있어요.')


def check_weekly():
    try:
        found = crawl_weekly.latest_post()
    except Exception as e:
        notes.append(f'⚠ 디시에 접속하지 못해서 주간 일정표는 확인을 건너뛰었어요 ({e})')
        return
    if not found:
        notes.append('⚠ 디시에서 주간 일정표 글을 찾지 못했어요 (글 제목 형식이 바뀌었을 수 있어요)')
        return
    no, title = found
    have = json.loads((ROOT / 'data' / 'weekly.json').read_text(encoding='utf-8'))
    if int(no) <= int(have.get('post') or 0):
        notes.append(f'주간 일정표 최신 글 반영됨 ({title})')
        return
    try:
        posted = crawl_weekly.read_post(no)['posted']
    except Exception:
        posted = ''
    age = (datetime.now(KST).date() - datetime.fromisoformat(posted).date()).days if posted else 99
    if age >= 1:
        problems.append(f'새 주간 일정표 "{title}" (디시 {no}번, {posted or "날짜 모름"})가 아직 사이트에 안 들어갔어요. '
                        'PC의 Claude 앱 예약 작업 "리센느 주간 일정표 읽기"가 안 돌았을 수 있어요 (PC 꺼짐 · 앱 종료). '
                        'Claude 앱에서 그 작업을 "지금 실행"해 주세요.')
    else:
        notes.append(f'오늘 올라온 주간 일정표 "{title}"는 오늘 안에 읽을 예정이에요')


def check_live():
    want = re.search(r'app\.js\?v=(\d+)', (ROOT / 'index.html').read_text(encoding='utf-8')).group(1)
    try:
        req = urllib.request.Request(f'{LIVE}?nc={datetime.now().timestamp():.0f}', headers={'User-Agent': 'rescene-health'})
        body = urllib.request.urlopen(req, timeout=20).read().decode('utf-8', 'replace')
    except Exception as e:
        problems.append(f'사이트가 열리지 않아요 ({e})')
        return
    m = re.search(r'app\.js\?v=(\d+)', body)
    if not m or m.group(1) != want:
        problems.append(f'사이트에 최신 버전 v{want}가 안 올라가 있어요 (지금 v{m.group(1) if m else "?"}). GitHub Pages 배포를 확인해 주세요.')
    else:
        notes.append(f'사이트 v{want} 정상')


def check_onair():
    try:
        d = json.loads((ROOT / 'data' / 'onair.json').read_text(encoding='utf-8'))
    except Exception as e:
        problems.append(f'data/onair.json을 읽지 못했어요 ({e}). Actions "음방 편성표 받기"를 확인해 주세요.')
        return
    # 편성표는 매주 새 날짜가 붙어서, 정상이면 거의 매일 바뀌어요 (지난 날짜가 빠지고 새 날짜가 붙음)
    age = datetime.now(KST) - datetime.fromisoformat(d.get('updated') or '2000-01-01T00:00:00+09:00')
    if age > timedelta(days=3):
        problems.append(f'음방 편성표가 {age.days}일째 그대로예요. Actions "음방 편성표 받기"가 실패하고 있거나 방송사 주소가 바뀌었을 수 있어요.')
    for n in d.get('notes') or []:
        problems.append(n)
    if age <= timedelta(days=3) and not d.get('notes'):
        notes.append('음방 편성표 정상')


check_mnet()
check_weekly()
check_live()
check_onair()
for n in notes:
    print('·', n)
if problems:
    print('\n✗ 확인이 필요해요')
    for p in problems:
        print('-', p)
        # GitHub Actions 요약 화면과 알림 메일에 보이게
        print(f'::error title=리센느 사이트 자료 점검::{p}')
    sys.exit(1)
print('\n✓ 자료 점검 통과')
