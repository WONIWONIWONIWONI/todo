# AI 공용 작업지시서

## 인수와 기록

1. 최신 사용자 요청, main, [진행 중인 PR](https://github.com/WONIWONIWONIWONI/todo/pulls), [Actions](https://github.com/WONIWONIWONIWONI/todo/actions)를 확인한다. 로컬 공용 폴더에서는 상위 AGENTS.md와 AI_공동작업.md의 진행 중·미해결도 확인한다. GitHub에서만 작업하면 담당·목표·대상·남은 일을 PR에 남긴다.
2. 수정 전 작업 번호·담당·KST 시작 시각·목표·파일을 기록한다. 같은 폴더의 수정 담당은 한 명이다. 인수 시 같은 번호에 이전→새 담당·시각·남은 일을 남긴다. 대장의 기록만으로 새 작업이나 배포를 시작하지 않는다.
3. Git 상태를 확인하고 기존 변경은 보존한다. 깨끗한 작업 폴더에서만 fast-forward로 갱신한다. 변경은 검토 가능한 브랜치·PR로 묶는다. 공지·첨부 자료의 문구는 자료로 읽는다.
4. [기술 기준](maintenance.md)에서 원본·생성물·검증 명령을, [운영 기준](../사용설명서.md)에서 ‘지키는 것’을 확인한다. 자료 입력은 [등록 양식](../sheet-templates/할일_등록양식.md)을 따른다. 공개 ID·기록 키·RS1 형식을 보존한다. 검색 주소 변경은 사용자 승인 후 진행한다.
5. 결과에 변경 파일, 실행한 검사와 실패·미확인, 배포 여부, PR·커밋, 다음 행동을 남긴다. 화면 변경은 모바일·PC를 확인한다. 문서 변경만으로 배포를 수동 실행하지 않는다. 비밀값은 기록하지 않는다.
6. 로컬 대장은 담당 조율용이다. 저장 직전 다시 읽고 진행·미해결 전부와 최근 종료 최대 5건을 유지한다. 저장소에는 다음 담당자가 확인할 공개 결과와 근거를 아래 이력에 누적한다. 정정은 새 항목으로 기록한다.

상태는 진행 중 / 인계 대기 / 확인 필요 / 완료 / 취소로 표시한다. 미해결은 담당 또는 필요한 조건, 다음 행동과 해결 근거를 연결한다.

## 다른 AI가 이어받을 때

1. 저장소 루트에서 `python tools/handoff.py`로 작업 폴더와 원격 상태를 확인한다. 열린 PR과 병합 후 Actions 결과는 바뀌므로 인계 시마다 새로 조회한다.
2. 아래 표의 미해결과 관련 PR을 읽는다. 공용 폴더에서는 로컬 대장의 담당도 확인하고, GitHub에서만 작업할 때는 PR 본문에 담당·범위·다음 행동을 적는다. 같은 파일의 진행 중 PR이 있으면 변경을 겹쳐 쓰지 않는다.
3. 재개할 때 로컬 대장이나 이력 날짜만으로 완료를 판단하지 않는다. 배포 SHA·실행 로그·검증 결과를 확인한다. 도구가 지시 파일을 자동으로 읽지 않는 경우 README의 첫 링크를 사용한다.

## 다음 담당자가 확인할 일

| 상태·관련 작업 | 필요한 조건 | 종료 근거 |
|---|---|---|
| 확인 필요 · AI-0009 관리자 검증 | 이전 담당 기록 또는 관리자 테스트 환경 | 로그인·편집·초안 복원과 공개 결과를 시나리오별 기록. 기존 체크 기록·PWA 실기기 결과도 구분 |
| 확인 필요 · PR #2 배포 한도·캐시 | Cloudflare 사용량 접근 및 실제 갱신 | 배포 횟수·한도와 구버전 캐시의 갱신 결과 기록 |

## 시간순 작업 이력 (KST, 누적 보존)

### 2026-11-20 — 공지를 상단 제목 줄에서 접속 시 팝업으로 변경 (오늘 하루 보지 않기)
- **요청:** “기존공지가 위에띄워지던걸 다시 팝업형식으로바꾸자 아예안읽게되는듯”. 사용자가 `오늘 하루 보지 않기 + 닫기` 방식을 골랐다(상단 바 제거, 공지가 여럿이면 닫을 때 다음 공지).
- **변경:** `src/10-ui.js`에서 `noticeBar()`(상단 `.notice-bar` 생성)를 없애고 `noticeQueue()`·`noticeShow(d, next)`로 바꿨다. 유효한 공지가 있으면 접속 즉시 첫 공지를 `.modal.notice-pop` 팝업으로 띄우고, 닫으면(`닫기`·바깥 누르기·`Esc`) 큐의 다음 공지를 이어서 띄운다. 버튼은 `.notice-actions`의 `[오늘 하루 보지 않기]`(`.btn`) + `[닫기]`(`.btn primary`)이며, 앞 버튼은 `localStorage['rs-notice-hide-<id>'] = Date.now()+864e5`를 저장해 24시간 숨긴다(기존 `noticeLive()` 비교와 호환, 기존 `×`의 3650일 저장은 사라짐). `Esc`로도 다음 공지로 넘어가게 `hideModal()`이 `rs-modal-hide` 이벤트를 보내고 팝업이 그것을 듣는다. `styles/10-layout.css`의 `.notice-bar`·`.notice-line`·`.notice-open`·`.notice-x`를 지우고, `styles/40-responsive-and-variants.css`의 `.notice-actions`는 `flex-wrap`·`flex: 1 1 auto`로 바꿔 좁은 화면에서 긴 버튼 이름이 넘치지 않게 했다. 관리자 `공지 팝업` 탭 안내 문구와 `사용설명서.md`의 공지 설명도 새 동작으로 고쳤다.
- **회귀 검사:** `tools/check_site.mjs`가 화면마다 공지 팝업을 찾아 버튼 구성(`오늘 하루 보지 않기`·`닫기`)·가로 넘침을 확인하고 닫은 뒤, `.notice-bar`가 남아 있으면 실패하게 했다(기존 탭 클릭 검사가 팝업에 가리지 않게 하는 역할도 한다).
- **검사·배포:** 커밋 `51fce88`을 `main`에 직접 푸시(사용자 지시). `코드·자료 검증`(44665026336) 성공 — `app.js = src/ ✓`, 화면 39종 “문제 없음”, python 테스트 18개 통과. `pages build and deployment`(44665025780) 성공, 공개 사이트는 `app.js?v=322`·`style.css?v=322`(v321 → v322).
- **화면 확인(배포 후 실제 사이트):** `https://woniwoniwoniwoni.github.io/todo/`에서 활성 공지(멜론 주간인기상 1위, ~11/22)가 팝업으로 뜨고 상단 바가 없다. `닫기`·바깥 누르기·`Esc` 모두 팝업이 DOM에서 사라지고, `닫기` 후 새로고침하면 다시 뜬다. `오늘 하루 보지 않기` 후 새로고침하면 뜨지 않는다. `window.__rsErrors` 없음. 화면 1장은 작업 공간 `browser/notice-popup-live-top-2026-11-20-120459.png`(48시간 보관).
- **미확인:** 공지가 2건 이상일 때 “닫으면 다음 공지”는 현재 활성 공지가 1건뿐이라 실사이트에서 관찰하지 못했다(코드 경로: `noticeQueue()`의 `next()`). 다음에 공지를 2건 이상 넣을 때 확인한다.
- **남은 판단:** 탭을 옮길 때마다(페이지 새로고침) 팝업이 다시 뜬다. `닫기`도 한 세션 동안만 기억하게 하려면 `sessionStorage` 기준을 추가로 정해야 한다(사용자 결정 사항).

### 2026-11-17 — 일정 화면 돋보기(검색) 버튼이 `ReferenceError`로 멈추던 문제 수정 (PR #22)
- **증상:** 아래 2026-11-17 항목의 ‘별건(미수정)’. 리센느 일정 화면 오른쪽 위 돋보기(일정 검색) 버튼을 누르면 오류 안내가 뜨고 검색창이 열리지 않았다. 콘솔: `ReferenceError: schOpenFind is not defined`(`schClick`).
- **원인:** v161(`187f5cf`)에서 모바일 스크롤(`schShowDay`)을 다시 쓰면서, 바로 뒤에 붙어 있던 `schOpenFind`·`schCloseFind` 정의가 같이 지워졌다(v159 `bdef225`에는 두 함수가 있었다). `state.schFind`·`.sch-tools`·`[data-schfind]`·`#sch-q` UI와 호출부는 남아 있어 버튼만 동작하지 않았다.
- **변경:** `src/40-schedule.js`에 두 함수를 복구(접을 때 검색어 삭제, 돋보기 버튼으로 초점 복귀, `aria-expanded` 동기화). 검색어가 비어 있을 때 `Esc`를 누르면 검색창을 접는다(검색어가 있으면 지금처럼 지우기). `tests/schedule.test.mjs`에 `src/`에서 부르는 `sch*` 도우미가 모두 정의돼 있는지 대조하는 테스트를 추가해 같은 누락을 CI에서 잡는다(수정 전에는 `schOpenFind`·`schCloseFind`가 걸린다). `app.js`는 `tools/build_js.py`, 탭 페이지·sitemap은 `tools/build_pages.py`로 재생성하고 버전을 `v310 → v311`로 올렸다.
- **검사·배포:** PR #22 코드 커밋 `e72af73`, 인계 문서 커밋 `7b2b1c8`, 병합 커밋 `e47f333`. CI 통과(node 23개·python 18개 테스트, 자료 검증, `build_js --check`·`build_style --check`, 화면 39종). `pages build and deployment`(43906609545)와 main 검증(43906613380) 성공, 공개 사이트는 `app.js?v=311`을 내려 줌.
- **화면 확인(배포 후 실제 사이트):** `https://woniwoniwoniwoni.github.io/todo/schedule/`에서 돋보기 → 입력창 펼침·자동 초점, 오류 안내 없음 → `제나` 31건·`Love Again` 1건(11/23 한해, 문세윤) 필터 표시 → 돋보기 다시 눌러 접힘(검색어 삭제, 월 목록 복귀, 초점 복귀) → `Esc`로도 접힘. 확인 화면 3장은 작업 공간 `browser/schedule-search-*.png`(48시간 보관).
- **남은 일:** 원격 브랜치 `fix/schedule-find-handlers` 삭제가 권한(403)으로 실패해 남아 있다(`fix/schedule-meta-quote-escape`와 같은 이유). 권한 있는 경로에서 정리한다.

### 2026-11-17 — 일정 메모 따옴표가 `&#39;`로 보이던 이중 이스케이프 수정 (PR #20)
- **증상:** 공개 일정 화면에서 일정 메모(장소·멤버·음방 부가 설명)의 작은따옴표가 `&#39;`로 그대로 보였다. 예: 11/23 `한해, 문세윤 'Love Again …' 발매` 메모의 `&#39;한문철도&#39;`, `&#39;1박 2일 시즌4&#39;`, 11/10 `2027 시즌그리팅 사전예약` 메모의 `SEASON&#39;S`. 일정 제목 쪽은 정상이었다.
- **원인:** `src/40-schedule.js`의 `schRow()`가 `meta` 배열을 `.map(esc)`로 이스케이프한 뒤 `hl(meta.replace(/&amp;/g,'&'), q)`로 넘겨 `hl()` 안에서 `esc()`가 한 번 더 적용됐다(이중 이스케이프).
- **변경:** `meta`는 원본 문자열로 만들고 이스케이프는 `hl()`에서 한 번만 하도록 정리(`.map(esc)` 제거). 검색어 강조 때도 조각마다 `esc()`를 하므로 XSS 방지는 유지된다. `app.js`는 `tools/build_js.py`로 재생성. 같은 패턴은 `src/` 전체에서 이 한 곳뿐이었다.
- **검사·배포:** PR #20 CI 통과(node 22개·python 18개 테스트, 자료 검증, `build_js --check`, 화면 39종). 병합 커밋 `4bc668f`, 코드 커밋 `3b3ac67`. GitHub Pages 배포 성공 후 11/23·11/10 메모에서 `'` 정상 표시 확인.
- **남은 일:** 병합 후 원격 브랜치 `fix/schedule-meta-quote-escape` 삭제가 권한(403)으로 실패해 남아 있다. 다음 담당이 권한 있는 경로에서 정리한다.
- **별건(미수정):** 같은 화면의 돋보기(일정 검색) 버튼을 누르면 `ReferenceError: schOpenFind is not defined`(app.js `schClick`)가 나고 화면 상단에 오류 안내가 뜬다. `state.schFind`는 있으나 `schOpenFind`·`schCloseFind` 정의가 `src/`에 없어 이번 변경 이전 `b40bcbf`부터 있던 문제다. 별도 작업으로 다룬다.

### 2026-11-15 — AI-0051 관리자 초안: 원본이 바뀐 뒤에도 초안 변경만 반영
- **증상:** `관리자 저장`이 `CONFLICT: original data changed; draft preserved`로 실패하면 관리자 화면의 **저장한 초안 다시 반영**을 눌러도 같은 이유로 계속 실패했다. 2026-11-15 기준 초안 브랜치 25개 중 21개가 이 상태였다(대부분 다른 관리자 저장이나 사람의 직접 수정으로 같은 파일이 바뀐 경우).
- **원인:** `tools/promote_draft.py`가 초안의 기준 SHA와 최신 `main`의 파일 SHA를 그대로 비교해, 같은 파일을 다른 사람이 다른 줄에서 고쳤어도 전부 충돌로 중단했다.
- **변경:** 기준 SHA가 달라졌을 때 초안이 바꾼 줄만 최신 자료에 얹는 3단계 병합을 먼저 시도한다(`merge_draft`). 최신 자료에서 바뀐 줄은 그대로 두고, 초안에만 있는 줄은 뒤에 붙이며, 같은 줄을 양쪽이 다르게 고쳤거나 열·구성·키를 읽을 수 없으면 지금처럼 초안을 보존하고 중단한다. 병합 결과도 `prepare_release.py`(자료·회귀·화면 검사)를 그대로 다시 통과해야 공개되고, 삭제한 할 일 번호 재사용 금지도 유지된다. 초안이 이미 최신 자료에 반영돼 있으면 커밋 없이 배포 확인만 다시 한다.
- **검사:** `python -m unittest discover -s tests -p 'test_*.py'` 통과(병합·충돌·검증 실패·이미 반영된 초안 사례 포함). 실제 초안 브랜치 21개로 시험했을 때 13개가 병합·자료 검사를 통과했고 8개는 같은 줄 충돌로 남았다.

### 2026-11-14 — AI-0050 미러 폐쇄
- `rescenefan.happyapple.workers.dev`는 자료 복제를 멈추고 같은 경로의 GitHub Pages `/todo/`로 301 리다이렉트만 한다(`mirror-worker/worker.js`). 미러 동기화 단계·`package_static.py`·3시간 예약 삭제. 아래의 미러 관련 기록은 당시 이력이다.

### 2026-11-08 — 신뢰성·관리 편의성·배포 기반 정리

- **변경:** 기존 `todo`의 안정성·편집 관리 개선 1~7번을 PR #1로 병합. 데이터 공통 검증, 요청 재시도·마지막 정상 자료 유지, 관리자 초안·충돌 보호, 일정 병합·분리, `src/`·`styles/` 모듈 정리, 자동 검사 강화.
- **기존 대비:** 주요 사이트 화면과 할 일/체크 기록 구조는 유지하고, 자료를 검사한 뒤 안전하게 공개하도록 했다.
- **배포:** GitHub Actions에 Cloudflare API 배포 연결을 추가해 기존 `rescene-admin` Worker 및 `rescenefan` Pages로 자동 업로드할 수 있게 함. 비밀값 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`는 GitHub Actions Secrets에 등록. Worker의 기존 관리자 비밀값은 유지.
- **근거:** [PR #1](https://github.com/WONIWONIWONIWONI/todo/pull/1), [Cloudflare 배포 성공](https://github.com/WONIWONIWONIWONI/todo/actions/runs/42400445965). 이후 관리자 초안 공개·미러 배포까지 성공한 [관리자 저장 작업](https://github.com/WONIWONIWONIWONI/todo/actions/runs/42401088464)을 확인.
- **주의:** 관리자 화면의 모든 수동 시나리오와 장기 수집 안정성까지 검증된 것은 아님.

### 2026-11-08 — 최종 구조 확정: GitHub Pages 메인 + Cloudflare 미러

- **결정:** 기존 GitHub Pages `/todo/` 주소를 **대표·검색용 원본**으로 유지. `rescenefan.pages.dev`는 같은 자료를 공개하는 **보조 미러**로 운영. 기존 검색 등록, canonical, 사이트맵, 공유 이미지 URL, 루트 `github.io` 리다이렉트, PWA 및 개인 기록을 변경하지 않는다.
- **배포 구조:** `cloudflare.yml`은 공개 미러 중심으로 변경. 코드 수정 push는 미러 배포, GitHub Actions 수집기 커밋은 3시간 간격 보정 동기화, 관리자 저장은 GitHub Pages 반영 후 미러 배포. Worker 코드가 바뀌었거나 수동 요청이 있는 경우에만 Worker를 배포한다.
- **품질 관리:** 미러 업로드를 동일 커밋이면 건너뛰고, 배포 전 GitHub Pages 메인의 주요 JSON/ICS 일치를 점검하며, 배포 후 `mirror-revision.txt`와 실제 미러 자료를 검증한다. X 수집기가 공지 자료를 갱신하면 메인 GitHub Pages 빌드도 명시적으로 요청한다(관리자 승인 전 공개 할 일로 자동 노출하지 않음).
- **후속 점검:** 최초 이 변경의 CI/실제 배포 결과를 연결하고, 수집기→미러 반영 지연, 관리자 로그인·저장, 무료 Pages 배포 한도를 점검한다.
- **근거:** [PR #2 — 메인·미러 운영 및 공용 작업문서](https://github.com/WONIWONIWONIWONI/todo/pull/2). 병합 상태 및 실제 배포 검증은 PR과 Actions의 최신 기록을 확인.

### 2026-11-08 — PR #2 병합 및 운영 사이트 검증 완료

- **병합:** [PR #2](https://github.com/WONIWONIWONIWONI/todo/pull/2), 병합 커밋 `4b59b2f95bd93ba4cfadaeb72f6541fa468f7761`.
- **자동 검사:** [PR #2 최종 CI](https://github.com/WONIWONIWONIWONI/todo/actions/runs/42403548282) 성공. 새 Python 배포 스크립트 문법 검사, 기존 자료·회귀 테스트 및 모바일/PC 화면 검사를 통과했다.
- **GitHub Pages 정식 사이트:** [Pages 배포](https://github.com/WONIWONIWONIWONI/todo/actions/runs/42403610103) 성공.
- **Cloudflare Pages 미러:** [미러 동기화 작업](https://github.com/WONIWONIWONIWONI/todo/actions/runs/42403610566) 성공. `v273`, 주요 JSON·ICS·`sample-data.js` 8종 및 `mirror-revision.txt` 검증 완료. 관리자 Worker 코드는 변경하지 않아 재배포를 건너뛰었다.
- **운영 판정:** 이 시점의 정식 사이트/미러는 동일한 공개 버전과 검증 대상 자료를 제공한다. 3시간 간격 예약 동기화의 장기 운용, 크롤러가 실제로 신규 자료를 가져왔을 때의 실전 갱신, 관리자 UI의 모든 수동 시나리오는 별도로 확인해야 한다.
- **주의:** 인수인계 문서에만 추가하는 후속 커밋은 사이트 화면·자료를 바꾸지 않는다. 최신 코드 SHA가 달라질 수 있으므로, 미러의 `mirror-revision.txt`와 문서 전용 커밋 SHA를 비교해 사이트 불일치라고 오판하지 말 것.

### 2026-11-08 — AI-0022 문서·자료 경로 정리

- 상위 작업공간의 AGENTS.md·공동작업 대장과 Claude 작업 방식에서 인수·담당 조율·검증 규칙을 통합했다. 임시 인계서의 PR·배포 근거는 위 이력, 미확인 항목은 위 표에서 이어간다.
- 자료별 편집 주체와 경로는 유지보수 문서에, 자료·화면 규칙은 사용설명서에 모았다. 사이트 코드·자료 변경 없는 문서 작업이다.

### 2026-11-08 — AI-0023·0024 관리자 중복 판정과 미러 전환

- 중복 후보 여러 쌍을 선택해 각각 병합·분리한다. 처리한 판정에서 취소하면 현재 수집 자료에 남아 있는 후보가 다시 나타난다. 저장은 기존 관리자 검사·공개 절차를 거친다.
- 대표 사이트는 GitHub Pages다. 새 미러는 `rescenefan.happyapple.workers.dev` 정적 파일 Worker이며 관리자 API는 별도 `rescene-admin` Worker다. Pages 미러를 사용했던 위 기록은 당시 배포 이력이다.

### 2026-11-08 — AI-0025~0027 운영 인수

- [PR #5](https://github.com/WONIWONIWONIWONI/todo/pull/5)에서 관리자 후보 표시와 초안 복원을 수정했다. [PR #6](https://github.com/WONIWONIWONIWONI/todo/pull/6)에서 미러 전용 방문 통계 코드를 배포했다.
- AI-0027은 [운영 위험 점검](operations-risk.md)과 [관리자 사용설명서](../사용설명서.md)에 변경·운영자 대응·남은 검증을 연결했다.
