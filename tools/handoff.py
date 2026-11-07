"""Print the current checkout, open PRs and Actions, without modifying the repo."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
API = 'https://api.github.com/repos/WONIWONIWONIWONI/todo/'


def github(path):
    headers = {'User-Agent': 'rescene-handoff'}
    if os.environ.get('GH_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GH_TOKEN']
    request = urllib.request.Request(API + path, headers=headers)
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.load(response)


if __name__ == '__main__':
    for args in [('status', '--short', '--branch'), ('log', '-8', '--oneline')]:
        subprocess.run(['git', *args], cwd=ROOT, check=True)
    try:
        print('원격 main:', github('commits/main')['sha'][:12])
        prs = github('pulls?state=open&per_page=10')
        print('열린 PR (최근 10건)')
        for item in prs:
            print(item['title'], item['html_url'])
        if not prs:
            print('없음')
        print('main의 최근 자동 실행')
        for run in github('actions/runs?branch=main&per_page=8')['workflow_runs']:
            print(run['name'], run['conclusion'] or run['status'], run['html_url'])
    except (OSError, ValueError, KeyError) as exc:
        print(f'GitHub 조회 중단 ({exc}). 미표시 항목은 PR·Actions에서 확인하세요.')
    print('인계 및 미해결: docs/AI_SHARED_WORK_INSTRUCTIONS.md')
    if (ROOT.parent / 'AI_공동작업.md').is_file():
        print('현재 담당과 작업 번호: ../AI_공동작업.md')
