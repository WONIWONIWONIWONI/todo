# 임시 인수인계 — 2026-11-08 ChatGPT 작업 결과

> **목적:** 기존에 함께 관리하던 ChatGPT 및 Claude 담당 AI에게, 이번 대화 직전의 운영 상태 대비 **최종적으로 남은 변화**만 전달한다. 중간 시행착오는 나열하지 않는다. 최신 사실은 `main` 코드와 Actions 로그에서 확인한다.

## 이전과 비교해 무엇이 바뀌었는가

1. **코드와 관리자 저장의 신뢰성 개선:** 공통 데이터 검증(`shared/validation.js`), API 재시도·마지막 정상 자료(`shared/runtime.js`), 체크 기록 복원(`shared/records.js`), 일정 중복 판정(`shared/schedule.js`) 등 모듈을 분리했다. 관리자 수정은 초안 브랜치 → 검증 → 공개 → 운영 반영 확인 과정으로 보완했다.
2. **편집·빌드 구조 개선:** `src/`, `styles/`에 편집용 원본을 분리하고 통합 JS/CSS와 탭별 HTML을 생성하도록 정리했다. `tools/prepare_release.py`, 자동 브라우저 검사, 회귀 테스트 등이 추가됐다.
3. **Cloudflare 배포 권한 연결:** GitHub Actions Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`가 설정되었다. 기존 `rescene-admin` Worker와 `rescenefan` Pages 프로젝트를 재사용하며 새 프로젝트/도메인은 만들지 않았다.
4. **대표 주소 확정:** 사용자는 최종적으로 **GitHub Pages `https://woniwoniwoniwoni.github.io/todo/`를 메인**으로 유지하기로 결정했다. **Cloudflare Pages `https://rescenefan.pages.dev/`는 미러**이다. 검색엔진 canonical·사이트맵·OG URL은 기존 GitHub 주소를 유지한다. 루트 `woniwoniwoniwoni.github.io` 저장소도 그대로다.
5. **미러 자동화 간소화:** 일반 코드 push 또는 관리자 저장 시 미러를 동기화한다. GitHub Actions 자동 수집 커밋이 push 워크플로를 재실행하지 못하는 경우를 보완하기 위해 3시간 간격 예약 동기화를 추가했다. 이미 같은 커밋인 경우 업로드를 건너뛴다. 관리자 Worker는 관련 코드가 변경될 때 별도로 배포한다.
6. **실제 배포 검증 강화:** 앱 버전뿐 아니라 배포 커밋 마커와 주요 JSON/ICS 파일의 실제 내용을 검증한다. 미러와 메인 사이트의 개인 체크 기록은 브라우저 origin별로 별도임을 유지한다.
7. **공용 AI 협업 문서 시작:** [AI_SHARED_WORK_INSTRUCTIONS.md](AI_SHARED_WORK_INSTRUCTIONS.md)를 시간순 변경 이력의 단일 기록으로 만들었다. 기존 AI들이 소지한 **과거 공용 지시서 원문은 미제공**이므로 임의로 대체하지 않고 후속 병합을 요청한다.

## 핵심 링크

- 코드: https://github.com/WONIWONIWONIWONIWONI/todo
- 메인: https://woniwoniwoniwoni.github.io/todo/
- 미러: https://rescenefan.pages.dev/
- 관리자 API: `admin-worker/wrangler.toml`, `config.js`
- 안정성 개선: https://github.com/WONIWONIWONIWONI/todo/pull/1
- 배포 기반 검증: https://github.com/WONIWONIWONIWONI/todo/actions/runs/42400445965
- 관리자 저장 실제 성공: https://github.com/WONIWONIWONIWONI/todo/actions/runs/42401088464
- 유지보수: [maintenance.md](maintenance.md)
- 최신 AI 공용 지시서: [AI_SHARED_WORK_INSTRUCTIONS.md](AI_SHARED_WORK_INSTRUCTIONS.md)

## 앞으로의 인계 절차

1. 기존 ChatGPT/Claude가 보유한 공용 작업지시서 원문을 확인한다. **다른 AI의 기억을 이번 임시 메모가 대신하지 않는다.**
2. 원문을 비교해 [공용 작업지시서](AI_SHARED_WORK_INSTRUCTIONS.md)에 충돌 없이 합친 뒤 PR로 공개한다.
3. 이후 변경은 해당 문서의 '시간순 작업 이력'에 새 항목을 덧붙인다. 날짜·최종 변화·검증·배포·PR을 기록한다.
4. 이 임시 메모는 기존 지시서 통합과 운영 검증이 끝날 때까지 삭제하지 않는다. 이후 보관/정리 여부는 사용자에게 보고한다.

## 검증해야 할 잔여 항목

- 이 변경 PR의 CI 및 실제 메인/미러 배포.
- 기존 GitHub Pages와 미러의 코드 버전·자료 일치.
- 관리자 로그인·편집·초안 복원, 기존 기록 및 PWA 동작.
- 수집기 커밋 후 Cloudflare 미러의 예약 동기화 지연.
- 무료 Cloudflare Pages의 배포 한도 및 오래된 캐시.
