"""Validate an isolated admin draft; preserve it on validation, conflict or deployment failure."""
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
        if current != tx['baseSha']:
            raise RuntimeError('CONFLICT: original data changed; draft preserved')
        with tempfile.TemporaryDirectory(prefix='rescene-release-') as temp:
            stage = Path(temp) / 'site'
            run('git', 'worktree', 'add', '--detach', str(stage), head)
            try:
                (stage / target).write_bytes(draft_text)
                run(sys.executable, 'tools/prepare_release.py', cwd=stage)
                if os.environ.get('RELEASE_BROWSER_CHECK') == '1':
                    server = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=stage, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    try:
                        time.sleep(1)
                        run('node', 'tools/check_site.mjs', '--quick', cwd=stage)
                    finally:
                        server.terminate(); server.wait(timeout=10)
                run('git', 'add', target, 'sample-data.js', 'app.js', 'index.html', 'admin/index.html', 'music', 'schedule', 'calendar', 'alliances', 'guides', 'sitemap.xml', 'sw.js', cwd=stage)
                run('git', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=github-actions[bot]@users.noreply.github.com', 'commit', '-m', f"공개 자료 반영: {tx.get('note', target)}", cwd=stage)
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
