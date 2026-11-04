# 리센느 음방 출연·1위 후보·실시간투표를 sheet-templates/음방.csv 에 넣고 사이트에 올려요.
#
#   python tools/music_lineup.py list
#   python tools/music_lineup.py add --show 엠카운트다운 --kind 출연 --date 2026-11-05 --src https://... [--memo "컴백 무대"]
#   음방 사전투표는 여기 말고 sheet-templates/할일.csv 에 할 일로 넣어요 (사용자 결정 2026-11-04)
#   python tools/music_lineup.py publish      (sample-data.js 만들기 → 커밋 → GitHub 올리기)
#
# 같은 음방·같은 구분·같은 날은 한 줄만 남아요 (다시 넣으면 출처·메모만 고쳐요).
import argparse
import csv
import datetime as dt
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, 'sheet-templates', '음방.csv')
HEAD = ['아이디', '음방', '구분', '방송일', '시작', '종료', '메모', '출처']

# 이름, 방송 요일(월=0 … 일=6), 다른 이름들 — src/50-music.js MUSIC_SHOWS 와 맞춰 둠
SHOWS = [
    ('쇼케이팝', 0, r'쇼케이팝|show\s*k-?pop|monshow|showkpop'),
    ('더쇼', 1, r'더\s*쇼|the\s*show|theshow'),
    ('쇼챔피언', 2, r'쇼\s*챔피언|쇼챔|show\s*champion|showchamp'),
    ('엠카운트다운', 3, r'엠\s*카운트다운|엠카|m\s*countdown|mcountdown'),
    ('뮤직뱅크', 4, r'뮤직\s*뱅크|뮤뱅|music\s*bank|musicbank'),
    ('음악중심', 5, r'음악\s*중심|음중|music\s*core|musiccore'),
    ('인기가요', 6, r'인기가요|inkigayo'),
]
# 할 일이 되는 건 음총팀이 하라고 한 '사전투표' · '실시간투표'만. '출연' · '1위후보'는 알림용이에요.
KINDS = {'출연': '출연', '1위후보': '1위후보', '1위 후보': '1위후보', '후보': '1위후보', '사전투표': '사전투표', '사전': '사전투표', '실시간투표': '실시간투표', '실시간': '실시간투표'}


def show_of(name):
    for n, day, rx in SHOWS:
        if re.search(rx, name or '', re.I):
            return n, day
    return None, None


def read_rows():
    if not os.path.exists(CSV):
        return []
    with open(CSV, encoding='utf-8-sig', newline='') as f:
        return [r for r in csv.DictReader(f) if any((v or '').strip() for v in r.values())]


def write_rows(rows):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=HEAD, lineterminator='\n')
    w.writeheader()
    for r in rows:
        w.writerow({k: r.get(k, '') for k in HEAD})
    with open(CSV, 'w', encoding='utf-8', newline='') as f:
        f.write(buf.getvalue())


def norm_dt(v, need_time=False):
    v = (v or '').strip()
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?', v)
    if not m:
        sys.exit(f'날짜 모양이 이상해요: "{v}" (예: 2026-11-05 또는 "2026-11-06 20:00")')
    dt.date.fromisoformat(m.group(1))
    if m.group(2):
        return f'{m.group(1)} {int(m.group(2)):02d}:{m.group(3)}'
    return m.group(1) + (' 23:59' if need_time else '')


def cmd_list(_):
    rows = read_rows()
    if not rows:
        print('비어 있음')
    for r in rows:
        print(' | '.join(r.get(k, '') for k in HEAD))


def cmd_add(a):
    name, day = show_of(a.show)
    if not name:
        sys.exit(f'모르는 음방이에요: {a.show}')
    kind = KINDS.get((a.kind or '').replace(' ', ''))
    if not kind:
        sys.exit(f'구분은 출연 / 1위후보 / 실시간투표 / 사전투표 중 하나예요: {a.kind}')
    if not (a.src or '').startswith('http'):
        sys.exit('출처 링크(--src https://...)가 꼭 있어야 해요')
    rows = read_rows()
    if kind == '사전투표':
        if not a.end:
            sys.exit('사전투표는 --end 가 필요해요')
        start = norm_dt(a.start) if a.start else ''
        end = norm_dt(a.end, need_time=True)
        key = (name, kind, end[:10])
        row = {'음방': name, '구분': kind, '방송일': norm_dt(a.date) if a.date else '', '시작': start, '종료': end}
    else:
        if not a.date:
            sys.exit('출연·1위후보·실시간투표는 --date 가 필요해요')
        d = norm_dt(a.date)[:10]
        if dt.date.fromisoformat(d).weekday() != day and not a.force:
            sys.exit(f'{name}은(는) {"월화수목금토일"[day]}요일 방송인데 {d}는 {"월화수목금토일"[dt.date.fromisoformat(d).weekday()]}요일이에요. 특집이면 --force')
        key = (name, kind, d)
        row = {'음방': name, '구분': kind, '방송일': d, '시작': '', '종료': ''}
    row.update({'메모': a.memo or '', '출처': a.src})
    for r in rows:
        rk = (r.get('음방'), r.get('구분'), (r.get('종료') or '')[:10] if r.get('구분') == '사전투표' else r.get('방송일'))
        if rk == key:
            r.update({k: v for k, v in row.items() if v})
            write_rows(rows)
            print(f'UPDATED {name} {kind} {key[2]}')
            return
    n = 1 + max([int(m.group(1)) for r in rows for m in [re.fullmatch(r'M(\d+)', r.get('아이디') or '')] if m] or [0])
    row['아이디'] = f'M{n}'
    rows.append(row)
    rows.sort(key=lambda r: (r.get('방송일') or (r.get('종료') or '')[:10], r.get('음방')))
    write_rows(rows)
    print(f'ADDED {name} {kind} {key[2]}')


def run(*c):
    return subprocess.run(c, cwd=ROOT, capture_output=True, text=True, encoding='utf-8')


def cmd_publish(_):
    r = run(sys.executable, os.path.join('tools', 'build_data.py'))
    if r.returncode:
        sys.exit('build_data 실패: ' + r.stderr[-300:])
    run('git', 'add', 'sheet-templates/음방.csv', 'sample-data.js')
    if not run('git', 'diff', '--cached', '--quiet').returncode:
        print('NO_CHANGE 바뀐 음방 일정 없음')
        return
    c = run('git', 'commit', '-q', '-m', '음방 출연·투표 일정 업데이트\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')
    if c.returncode:
        sys.exit('커밋 실패: ' + (c.stderr or c.stdout)[-300:])
    p = run('git', 'push', '-q')
    if p.returncode:
        run('git', 'pull', '--rebase', '-q')
        p = run('git', 'push', '-q')
    if p.returncode:
        sys.exit('올리기 실패: ' + p.stderr[-300:])
    print('PUSHED 음방 일정 올림')


ap = argparse.ArgumentParser()
sp = ap.add_subparsers(dest='cmd', required=True)
sp.add_parser('list').set_defaults(f=cmd_list)
p = sp.add_parser('add')
p.add_argument('--show', required=True)
p.add_argument('--kind', required=True)
p.add_argument('--date')
p.add_argument('--start')
p.add_argument('--end')
p.add_argument('--memo')
p.add_argument('--src')
p.add_argument('--force', action='store_true')
p.set_defaults(f=cmd_add)
sp.add_parser('publish').set_defaults(f=cmd_publish)
a = ap.parse_args()
a.f(a)
