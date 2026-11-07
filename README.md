# 리센느 오늘의 할일 — 코드 및 운영 안내

이 저장소는 **리센느 오늘의 할일** 웹사이트의 유일한 코드·공개 자료 원본입니다.

- **정식 사이트:** https://woniwoniwoniwoni.github.io/todo/
- **Cloudflare 보조 미러:** https://rescenefan.pages.dev/
- **관리자 화면:** https://woniwoniwoniwoni.github.io/todo/admin/ (관리자 API는 Cloudflare Worker 사용)

## AI 공동 운영 — 반드시 먼저 읽기

1. **[AI 공용 작업지시서 / 시간순 변경 이력](docs/AI_SHARED_WORK_INSTRUCTIONS.md)** — ChatGPT·Claude가 이후 함께 갱신할 단일 문서.
2. [2026-11-08 임시 인수인계](docs/TEMP_AI_HANDOFF_2026-11-08.md) — 기존 AI가 이번 작업의 최종 변경 사항을 이해하도록 남긴 참고 자료.
3. [기술 유지보수 안내](docs/maintenance.md) — 코드 구조, 자료 관리, 배포 및 장애 복구.
4. [사용설명서](사용설명서.md) — 운영자 사용 가이드.

> 기존 ChatGPT·Claude 사이에 별도로 공유되던 작업지시서 원문은 아직 이 저장소로 전달되지 않았습니다. 원문을 가진 AI가 내용을 검토해 공용 문서에 통합해 주세요. 임시 인수인계 문서는 원문을 대체하지 않습니다.

## 배포 기준

GitHub Pages `/todo/`가 대표 주소이며, Cloudflare Pages는 동일 자료를 제공하는 보조 미러입니다. GitHub Actions가 빌드·수집·배포를 수행하고, 인증이 필요한 관리자 기능은 별도 `rescene-admin` Cloudflare Worker가 맡습니다.

코드/자료 변경 후에는 검증·실제 사이트 반영을 확인하고, **AI 공용 작업지시서의 시간순 작업 이력에 최종 결과를 추가**합니다.
