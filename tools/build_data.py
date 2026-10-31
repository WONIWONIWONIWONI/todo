"""sheet-templates 폴더의 CSV 3개로 sample-data.js(사이트 정리본)를 다시 만든다.

데이터를 고칠 때는 sheet-templates/연합.csv, 할일.csv, 가이드.csv 를 고친 뒤
이 폴더 밖(사이트 폴더)에서 실행:  python tools/build_data.py
"""
import json
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = os.path.join(root, 'sheet-templates')


def read(name):
    with open(os.path.join(T, name), encoding='utf-8') as f:
        return f.read()


data = {'alliances': read('연합.csv'), 'tasks': read('할일.csv'), 'guides': read('가이드.csv')}
with open(os.path.join(root, 'sample-data.js'), 'w', encoding='utf-8') as f:
    f.write('// 사이트에 들어 있는 정리본. sheet-templates 폴더의 CSV로 만들어요 (tools/build_data.py).\n')
    f.write('window.SAMPLE_DATA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
print('sample-data.js 다시 만듦:', sum(t.count('\n') - 1 for t in data.values()), '줄')
