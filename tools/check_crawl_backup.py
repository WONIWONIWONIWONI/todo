"""Run the scheduled backup unless a recent manual/Worker dispatch succeeded."""
from datetime import datetime, timedelta, timezone
import json
import os
import sys
import urllib.request


def recent_success(runs, minutes, now):
    cutoff = now - timedelta(minutes=minutes)
    if not runs:
        return False
    latest = max(runs, key=lambda run: run['created_at'])
    return latest['conclusion'] == 'success' and datetime.fromisoformat(latest['created_at']) >= cutoff


if __name__ == '__main__':
    workflow, interval = sys.argv[1:]
    url = (f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/actions/workflows/"
           f"{workflow}/runs?event=workflow_dispatch&branch=main&per_page=5")
    try:
        request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN']})
        with urllib.request.urlopen(request, timeout=10) as response:
            runs = json.load(response)['workflow_runs']
        skip = recent_success(runs, int(interval), datetime.now(timezone.utc))
    except (OSError, ValueError, KeyError) as exc:
        print(f'::warning::최근 실행을 확인하지 못해 예비 수집을 진행합니다 ({type(exc).__name__}).')
        skip = False
    if skip:
        print('최근 정상 수집이 있어 예비 실행을 건너뜁니다.')
        with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
            env.write('SKIP_CRAWL=yes\n')
