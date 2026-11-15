"""Validate an isolated admin draft; preserve it on validation, conflict or deployment failure."""
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
def run(*args, cwd=ROOT, check=True):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise subprocess.CalledProcessError(result.returncode, args)
    return result
def git_bytes(*args):
    """git 결과를 글자 변환 없이 그대로 받아요 (자료 파일을 바이트로 비교해야 해요)."""
    result = subprocess.run(('git', *args), cwd=ROOT, capture_output=True)
    if result.returncode:
        raise subprocess.CalledProcessError(result.returncode, args, result.stdout, result.stderr)
    return result.stdout
TASK_FILE = 'sheet-templates/할일.csv'
RETIRED_FILE = 'sheet-templates/삭제한할일.csv'
TIMESTAMP_FIELDS = {'updated'}

def task_ids(contents):
    return {row['아이디'] for row in csv.DictReader(io.StringIO(contents.decode('utf-8-sig')))}

def reserve_deleted_tasks(stage, draft_text):
    previous = task_ids((stage / TASK_FILE).read_bytes())
    current = task_ids(draft_text)
    registry = stage / RETIRED_FILE
    retired = task_ids(registry.read_bytes())
    if current & retired:
        raise ValueError('삭제한 할 일의 번호는 다시 쓸 수 없어요: ' + ', '.join(sorted(current & retired)))
    removed = previous - current
    if removed:
        with registry.open('w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f, lineterminator='\n')
            writer.writerow(['아이디'])
            writer.writerows([key] for key in sorted(retired | removed))

def read_records(path, contents):
    """자료를 '키 → 한 줄'로 읽어요. 키를 만들 수 없으면 None (합치지 않고 충돌로 남겨요)."""
    bom = contents.startswith(b'\xef\xbb\xbf')
    try:
        text = contents[3:].decode('utf-8') if bom else contents.decode('utf-8')
    except UnicodeDecodeError:
        return None
    if path.endswith('.csv'):
        rows = list(csv.reader(io.StringIO(text, newline='')))
        body = [row for row in rows[1:] if row]
        if not rows or len({row[0] for row in body}) != len(body):
            return None
        return {'kind': 'csv', 'bom': bom, 'schema': rows[0], 'order': [row[0] for row in body],
                'records': {row[0]: row for row in body}}
    if path.endswith('.json'):
        try:
            data = json.loads(text)
        except ValueError:
            return None
        if not isinstance(data, dict):
            return None
        lists = [key for key, value in data.items() if isinstance(value, list)]
        if len(lists) != 1:
            return None
        name = lists[0]
        items = data[name]
        if not all(isinstance(item, dict) and isinstance(item.get('id'), str) for item in items):
            return None
        order = [item['id'] for item in items]
        if len(set(order)) != len(order):
            return None
        return {'kind': 'json', 'bom': bom, 'name': name, 'fields': list(data), 'order': order,
                'records': {item['id']: item for item in items},
                'scalars': {key: value for key, value in data.items() if key != name}}
    return None

def write_records(parsed, records, order):
    if parsed['kind'] == 'csv':
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator='\n')
        writer.writerow(parsed['schema'])
        writer.writerows(records[key] for key in order if key in records)
        return (b'\xef\xbb\xbf' if parsed['bom'] else b'') + buffer.getvalue().encode('utf-8')
    data = {}
    for key in parsed['fields']:
        if key == parsed['name']:
            data[key] = [records[item] for item in order if item in records]
        else:
            data[key] = parsed['scalars'][key]
    return (b'\xef\xbb\xbf' if parsed['bom'] else b'') + (json.dumps(data, ensure_ascii=False, indent=1) + '\n').encode('utf-8')

def merge_draft(current, base, draft, path):
    """초안이 바꾼 줄만 최신 자료에 얹어요. 같은 줄을 양쪽이 다르게 고쳤으면 (None, 이유).

    이미 공개된 다른 변경을 되돌리지 않으려고, 초안이 건드리지 않은 줄은 최신 자료를 그대로 둬요.
    """
    cur, old, new = (read_records(path, contents) for contents in (current, base, draft))
    if not cur or not old or not new:
        return None, '자료 구조를 읽을 수 없어요'
    if len({cur['kind'], old['kind'], new['kind']}) != 1:
        return None, '자료 종류가 달라졌어요'
    if cur['kind'] == 'csv':
        if cur['schema'] != old['schema'] or cur['schema'] != new['schema']:
            return None, '열 구성이 달라졌어요'
    elif cur['name'] != old['name'] or cur['name'] != new['name'] or \
            list(cur['scalars']) != list(old['scalars']) or list(cur['scalars']) != list(new['scalars']):
        return None, '자료 구성이 달라졌어요'
    merged, conflicts, touched = {}, [], []
    # 최신 자료의 차례를 그대로 두고, 초안에만 있는 줄은 뒤에 붙여요.
    order = list(cur['order']) + [key for key in new['order'] if key not in cur['records']]
    for key in order:
        before, now, after = old['records'].get(key), cur['records'].get(key), new['records'].get(key)
        if after == before:
            picked = now
        elif now == before:
            picked = after
        elif now == after:
            picked = now
        else:
            conflicts.append(key)
            continue
        if picked is not None:
            merged[key] = picked
            if picked != now:
                touched.append(key)
    if conflicts:
        return None, '양쪽이 다르게 고친 줄: ' + ', '.join(conflicts[:5])
    if cur['kind'] == 'json':
        scalars = {}
        for key in cur['fields']:
            if key == cur['name']:
                continue
            before, now, after = old['scalars'].get(key), cur['scalars'].get(key), new['scalars'].get(key)
            if after == before:
                scalars[key] = now
            elif now == before:
                scalars[key] = after
            elif now == after or key in TIMESTAMP_FIELDS:
                scalars[key] = now
            else:
                return None, '양쪽이 다르게 고친 항목: ' + key
        cur = {**cur, 'scalars': scalars}
    return write_records(cur, merged, order), (touched or ['바뀐 줄 없음'])

def main():
    tx = json.loads((ROOT / '.admin/transaction.json').read_text())
    target = tx['path']
    if target not in json.loads((ROOT / 'shared/admin-files.json').read_text()):
        raise ValueError('This file cannot be published')
    draft_text = (ROOT / target).read_bytes()
    for attempt in range(3):
        run('git', 'fetch', 'origin', 'main')
        head = run('git', 'rev-parse', 'origin/main').stdout.strip()
        current = run('git', 'rev-parse', f'{head}:{target}').stdout.strip()
        if current == tx['fileSha']:
            with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f: f.write(f'published_sha={head}\n')
            print('Draft already promoted; retrying deployment verification')
            return
        merged = None
        if current != tx['baseSha']:
            try:
                newer = git_bytes('show', f'{head}:{target}')
                older = git_bytes('cat-file', 'blob', tx['baseSha'])
            except subprocess.CalledProcessError:
                newer = older = None
            merged, detail = merge_draft(newer, older, draft_text, target) if newer and older else \
                (None, '최신 자료나 초안의 기준 자료를 읽을 수 없어요')
            if merged is None:
                raise RuntimeError('CONFLICT: original data changed; draft preserved (' + detail + ')')
            if merged == newer:
                with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f: f.write(f'published_sha={head}\n')
                print('Draft already reflected in the newer data; retrying deployment verification')
                return
            print('Original data changed; kept it and applied only the draft changes:', ', '.join(detail))
        contents = merged if merged is not None else draft_text
        message = f"공개 자료 반영: {tx.get('note', target)}"
        if merged is not None:
            message += ' (바뀐 원본 위에 초안 변경만 반영)'
        with tempfile.TemporaryDirectory(prefix='rescene-release-') as temp:
            stage = Path(temp) / 'site'
            run('git', 'worktree', 'add', '--detach', str(stage), head)
            try:
                if target == TASK_FILE:
                    reserve_deleted_tasks(stage, contents)
                (stage / target).write_bytes(contents)
                run(sys.executable, 'tools/prepare_release.py', cwd=stage)
                if os.environ.get('RELEASE_BROWSER_CHECK') == '1':
                    server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=stage, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    try:
                        time.sleep(1)
                        run('node', 'tools/check_site.mjs', '--quick', cwd=stage)
                    finally:
                        server.terminate(); server.wait(timeout=10)
                run('git', 'add', target, RETIRED_FILE, 'sample-data.js', 'app.js', 'index.html', 'admin/index.html', 'music', 'schedule', 'calendar', 'alliances', 'guides', 'sitemap.xml', 'sw.js', cwd=stage)
                run('git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=github-actions[bot]@users.noreply.github.com', 'commit', '-m', message, cwd=stage)
                result = run('git', 'push', 'origin', 'HEAD:main', cwd=stage, check=False)
                if result.returncode == 0:
                    sha = run('git', 'rev-parse', 'HEAD', cwd=stage).stdout.strip()
                    with open(os.environ.get('GITHUB_OUTPUT', os.devnull), 'a') as f: f.write(f'published_sha={sha}\n')
                    print('Validated draft promoted:', sha)
                    return
                print('main changed while publishing; validating again', file=sys.stderr)
            finally:
                run('git', 'worktree', 'remove', '--force', str(stage), check=False)
    raise RuntimeError('main kept changing; draft preserved for retry')
if __name__ == '__main__':
    main()
