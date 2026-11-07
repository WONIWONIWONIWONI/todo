# 리센느 오늘의 할일 — AI 공용 작업지시서

> **공식 협업 문서의 시작점 (2026-11-08, KST).** ChatGPT와 Claude가 함께 관리하는 저장소 내 단일 기록이다. 최신 `main` 코드와 GitHub Actions 로그가 이 문서보다 우선한다.

## 이 문서의 상태와 기존 작업지시서

**주의:** 기존 ChatGPT·Claude가 별도로 공유하던 *공용 작업지시서 원문*은 이번 대화에 제공되지 않았다. 따라서 원문이 여기에 포함되었다고 가정하지 말 것. 기존 담당 AI는 자신이 보유한 기존 작업지시서 전체를 확인하고, 충돌 여부와 최신 구현을 대조한 뒤 **이 문서의 아래 '기존 공용 지시서 통합' 절에 원문 또는 정확한 통합 내용을 PR로 추가할 것.** 이 문서를 새로운 단일 기준으로 삼고, 작업 후 이력도 계속 추가한다.

## 프로젝트·서비스 표준

- **정식 사이트:** https://woniwoniwoniwoni.github.io/todo/
- **Cloudflare 미러:** https://rescenefan.pages.dev/
- **GitHub 소스 원본:** https://github.com/WONIWONIWONIWONI/todo (기본 브랜치 `main`)
- **GitHub 루트 주소 안내용 저장소:** https://github.com/WONIWONIWONIWONI/woniwoniwoniwoni.github.io
- **관리자 Worker:** `rescene-admin`; API 주소는 `config.js`를 확인.
- **공식 사이트 UI:** 오늘 할 일, 음방, 일정, 연합, 달력 등. 브라우저 개인 체크 기록, PWA, 기존 할 일 ID를 보존.

### 운영 원칙

1. 다른 AI가 작업했을 수 있으므로 **작업 직전 최신 `main`, 진행 중인 PR, Actions, 운영 사이트 버전부터 확인**한다.
2. 사용자 지시 범위를 우선하며, 주소 이전·검색 주소 변경·데이터 삭제·인증 재설정 등 영향이 큰 작업은 사전 설명 및 검토를 거친다.
3. 한 AI가 수정한 파일을 다른 AI가 덮어쓰지 않도록 브랜치/PR로 변경을 격리하고, 병합 전 `main`과 비교한다.
4. `src/`, `styles/`, CSV 원본을 수정하고, 생성 결과인 `app.js`, `style.css`, 각 탭 HTML, `sample-data.js`는 빌드 도구로 갱신한다.
5. 기존 사용자 체크 기록 키(`rs-check:*`, `rs-check-once`, `rs-done-days`) 및 RS1 백업 호환성을 유지한다. 이미 공개된 할 일 ID는 변경·재사용하지 않는다.
6. 데이터 검증, 회귀 테스트, 모바일/PC 브라우저 검사, GitHub Pages·Cloudflare 미러 확인은 구분하여 보고한다. 테스트 성공을 곧 운영 성공이라고 표현하지 않는다.
7. **정식 주소는 GitHub Pages**이다. canonical·사이트맵·구조화 데이터·OG URL은 이를 가리킨다. Cloudflare는 동일 자료를 제공하는 미러이며 각 origin의 체크 기록은 별개다.
8. GitHub Actions의 자동 수집 커밋은 다른 push 워크플로를 호출하지 않을 수 있다. 미러 갱신은 주기적 보정과 관리자 저장 경로로 보장하고, 미러 지연 가능성은 숨기지 않는다.
9. 비밀값(API 토큰, 계정 ID, 관리자 비밀번호, 쿠키)은 저장소/작업일지/대화에 적지 않는다. 이름과 저장 위치만 문서화한다.
10. 작업 완료 시 **아래 시간순 작업 이력에 결과를 덧붙이고**, 이력에 링크된 PR·커밋·검증 로그를 남긴다. 과거 항목을 지우거나 사실을 소급 변경하지 않는다(정정은 새 항목으로 추가).

### 개발·배포 참고

- 코드 및 운영 안내: [maintenance.md](maintenance.md)
- 이전 운영 기록: [legacy-notes.md](legacy-notes.md)
- 사용자 안내: [사용설명서.md](../사용설명서.md)
- 데이터 검사: `node tools/validate_data.mjs`
- 회귀 테스트: `node --test tests/*.test.mjs` 및 `python -m unittest discover -s tests -p 'test_*.py'`
- 생성물 일치 검사: `python tools/build_style.py --check`, `python tools/build_js.py --check`, `python tools/check_structure.py`
- CI: [Actions](https://github.com/WONIWONIWONIWONI/todo/actions)
- 관리자 변경 공개: `admin-save.yml`; 미러 배포: `cloudflare.yml`.

## 기존 공용 작업지시서 통합 (원문 대기)

> **기존 ChatGPT·Claude 담당 AI가 추가할 곳.** 이 섹션은 기존 공유 지시서를 대체하지 않는다. 원문을 소지한 AI가 중복·충돌을 분석해 통합하고 사용자에게 변경점을 보고할 것. 추가 후 마지막 통합 날짜와 PR을 기록할 것.

## 시간순 작업 이력 (KST, 누적 보존)

### 2026-11-08 — 신뢰성·관리 편의성·배포 기반 정리

- **변경:** 기존 `todo`의 안정성·편집 관리 개선 1~7번을 PR #1로 병합. 데이터 공통 검증, 요청 재시도·마지막 정상 자료 유지, 관리자 초안·충돌 보호, 일정 병합·분리, `src/`·`styles/` 모듈 정리, 자동 검사 강화.
- **기존 대비:** 주요 사이트 화면과 할 일/체크 기록 구조는 유지하고, 자료를 검사한 뒤 안전하게 공개하도록 했다.
- **배포:** GitHub Actions에 Cloudflare API 배포 연결을 추가해 기존 `rescene-admin` Worker 및 `rescenefan` Pages로 자동 업로드할 수 있게 함. 비밀값 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`는 GitHub Actions Secrets에 등록. Worker의 기존 관리자 비밀값은 유지.
- **근거:** [PR #1](https://github.com/WONIWONIWONIWONI/todo/pull/1), [Cloudflare 배포 성공](https://github.com/WONIWONIWONI/todo/actions/runs/42400445965). 이후 관리자 초안 공개·미러 배포까지 성공한 [관리자 저장 작업](https://github.com/WONIWONIWONI/todo/actions/runs/42401088464)을 확인.
- **주의:** 관리자 화면의 모든 수동 시나리오와 장기 수집 안정성까지 검증된 것은 아님.

### 2026-11-08 — 최종 구조 확정: GitHub Pages 메인 + Cloudflare 미러

- **결정:** 기존 GitHub Pages `/todo/` 주소를 **대표·검색용 원본**으로 유지. `rescenefan.pages.dev`는 같은 자료를 공개하는 **보조 미러**로 운영. 기존 검색 등록, canonical, 사이트맵, 공유 이미지 URL, 루트 `github.io` 리다이렉트, PWA 및 개인 기록을 변경하지 않는다.
- **배포 구조:** `cloudflare.yml`은 공개 미러 중심으로 변경. 코드 수정 push는 미러 배포, GitHub Actions 수집기 커밋은 3시간 간격 보정 동기화, 관리자 저장은 GitHub Pages 반영 후 미러 배포. Worker 코드가 바뀌었거나 수동 요청이 있는 경우에만 Worker를 배포한다.
- **품질 관리:** 미러 업로드를 동일 커밋이면 건너뛰고, 배포 때 `mirror-revision.txt` 및 실제 JSON/ICS 내용 일치를 검증한다.
- **후속 점검:** 최초 이 변경의 CI/실제 배포 결과를 연결하고, 수집기→미러 반영 지연, 관리자 로그인·저장, 무료 Pages 배포 한도를 점검한다.
- **근거:** 이 문서를 추가한 PR 및 병합 커밋(병합 후 업데이트).

## 이후 작업 작성 규칙

새로운 작업은 **기존 로그 아래에 날짜순으로 추가**하고 다음 형식을 따른다.

```markdown
### YYYY-MM-DD — 작업 제목
- **요청/목적:**
- **이전 대비 최종 변경:**
- **변경 파일/구조:**
- **테스트:** 실행한 명령, 성공/실패, 로그 링크
- **배포:** 미배포/메인 반영/미러 반영 및 실제 확인 URL
- **커밋/PR:**
- **남은 일 및 다른 AI 주의사항:**
```

작업이 여러 단계였더라도 중간 시행착오 대신 **최종적으로 남은 변경만** 기록한다. 기존 기록의 정정이 필요하면 새 정정 항목을 추가하고 관련 링크를 남긴다.
