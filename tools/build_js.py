"""src/ 폴더의 파일들을 이어 붙여 app.js 를 만들어요.

    python tools/build_js.py          app.js 만들기 (publish.py가 자동으로 실행)
    python tools/build_js.py --check  app.js가 src/와 같은지만 확인 (다르면 실패)

- 고칠 때는 src/ 의 파일을 고쳐요. app.js 는 직접 고치지 않아요.
- 파일 이름 앞 숫자 순서대로 붙여요. 모두 한 함수 안에 들어가는 조각이라 따로는 실행되지 않아요.
  (00-core.js 첫 줄이 함수를 열고, 90-main.js 마지막 줄이 닫아요)
- app.js 첫 줄의 build: 값은 내용의 지문이에요. app.js를 누가 직접 고쳤으면 지문이 안 맞아서
  덮어쓰지 않고 멈춰요 (고친 내용이 사라지지 않게). 그때는 그 내용을 src/ 로 옮긴 뒤 --force.
"""
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'
OUT = ROOT / 'app.js'
HEAD = '// 자동으로 만든 파일이에요. 고칠 때는 src/ 폴더를 고치세요 (tools/build_js.py). build:{}\n'


def body():
    files = sorted(SRC.glob('*.js'))
    if not files:
        sys.exit('✗ src/ 에 파일이 없어요')
    return ''.join(f.read_text(encoding='utf-8').replace('\r\n', '\n') for f in files)


def digest(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]


def main():
    new_body = body()
    new = HEAD.format(digest(new_body)) + new_body
    old = OUT.read_text(encoding='utf-8').replace('\r\n', '\n') if OUT.exists() else ''
    if '--check' in sys.argv:
        if old != new:
            sys.exit('✗ app.js가 src/와 달라요. python tools/build_js.py 를 실행하세요')
        print('app.js = src/ ✓')
        return
    if old == new:
        print('app.js 그대로 (src/ 바뀐 것 없음)')
        return
    m = re.match(r'// .*build:([0-9a-f]{12})\n', old)
    if old and '--force' not in sys.argv:
        if not m:
            sys.exit('✗ app.js 첫 줄에 build: 지문이 없어요. 직접 고친 app.js일 수 있어서 멈췄어요 (--force 로 덮어쓰기)')
        if digest(old[m.end():]) != m.group(1):
            sys.exit('✗ app.js를 직접 고친 흔적이 있어요. 고친 내용을 src/ 로 옮긴 뒤 --force 로 다시 하세요')
    OUT.write_text(new, encoding='utf-8', newline='\n')
    print(f'app.js 만듦 (src/ {len(list(SRC.glob("*.js")))}개 파일)')


if __name__ == '__main__':
    main()
