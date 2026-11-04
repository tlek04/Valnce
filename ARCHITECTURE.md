# Valnce 코드 구조

2026-11-04 작업 시작 당시의 미커밋 변경을 포함한 구현을 기준으로 정리했다. 기능, UI, 점수 공식, 메시지, 저장 형식(version 4), API 경로를 유지한다.

## 책임과 의존성

| 위치 | 책임 |
| --- | --- |
| `components/`, `pages/` | 화면 구조, 스타일, 표시, 페이지 연결 |
| `hooks/usePlayerForm.ts` | 폼 초기화·입력·관계 선택·검증·제출·포커스 처리 |
| `hooks/useBoardDrag.ts` | 드래그 센서, 대상 열·인덱스 해석, 이동 액션 호출 |
| `hooks/useJoinApplications.ts` | 신청 목록 조회 주기, 승인·거절 흐름 |
| `hooks/useRosterSync.ts`, `useMatchSync.ts` | 명단·전적 동기화의 실행 시점과 화면 상태 |
| `store/useAppStore.ts` | 단일 Zustand 스토어 구성과 persist 연결 |
| `store/createPlayerActions.ts` | 저장 명단과 보드 플레이어 등록·수정·삭제 |
| `store/createBoardActions.ts` | 재등록·이동·자동 밸런스·팀 초기화 |
| `store/createMatchActions.ts` | 승패 기록·수정·재계산 |
| `store/playerState.ts` | 플레이어 조회, 명단 갱신, 보드 전체 갱신의 공통 처리 |
| `store/persistence.ts` | 저장 데이터 복원, 중복 제거, 보드 유지 시간 처리 |
| `utils/balance.ts`, `placement.ts` | 자동 선발·배분과 수동 이동의 순수 계산 |
| `utils/relations.ts`, `teamRules.ts` | 관계 그래프·라이벌·팀 고정·배치 가능 조건 |
| `utils/player.ts`, `rating.ts`, `matchStats.ts` | 데이터 변환, 점수·표시 계산, 전적 계산 |
| `utils/*Api.ts`, `rosterSync.ts`, `matchImport.ts`, `apiResponse.ts` | HTTP 요청과 응답 해석. 전적 API에는 명단을 인자로 전달 |
| `server/` | 인증·명단·신청·전적 API 처리. 공유 타입은 `types/` 사용 |
| `worker.ts`, `functions/api/roster.ts` | 배포 진입점과 라우팅. 명단 처리는 같은 함수 사용 |

화면 → 훅 → 스토어 액션 → 순수 규칙 순으로 연결한다. API 어댑터는 스토어를 직접 읽지 않는다. 서버는 화면이나 스토어에 의존하지 않는다. `tests/architecture.test.mjs`는 런타임 순환 의존성과 이 경계를 검사한다.

## 유지한 데이터 의미

- `players`는 재사용하는 저장 명단이고, `waitlist/team1/team2`는 오늘 보드다. 두 층을 무조건 한 객체로 합치지 않는다.
- 보드의 최고·내전 티어, 관계, 무기 제한, 오더 여부, 순번은 세션 값이다.
- 기존 명단에 대한 원격 응답은 명단에 반영한다. 보드 필드를 자동으로 덮어쓰는 정책을 새로 추가하지 않았다.
- 저장 키 `valorant-balancer-storage`, version 4, 보드 복원 2시간 조건을 유지했다.
- 자동 밸런스의 선발 순서, 동점 처리, 점수 가중치, 메시지 순서를 유지했다.
- 명단 동기화의 700ms 지연, 신청 목록의 5초 조회, 버튼으로만 실행하는 전적 조회를 유지했다.
- `lastMatchSyncAt`은 현재 구현대로 실패한 조회 시도에서도 갱신된다. 성공 시각으로 의미를 바꾸지 않았다.

## 검증 실행

```sh
npm run test       # 기존 동작·API·화면 마크업·의존성 검사
npm run typecheck  # 프론트와 서버 각각 검사
npm run build     # 타입 검사 후 프로덕션 빌드
npm run check     # 테스트와 빌드를 순서대로 실행
```

이번 검증에는 Node.js 26.2.0을 사용했다. 다른 Node 버전에서의 테스트 실행은 별도로 검증하지 않았다. 테스트용 TS 번들에는 기존 Vite 의존성인 esbuild 0.21.5를 직접 개발 의존성으로 명시했다. 런타임 의존성은 추가하지 않았다.

`tests/fixtures/`는 정리 전 코드에서 캡처한 기준 결과다. 테스트에 맞추기 위해 새 구현의 결과로 덮어쓰면 안 된다. 기능 변경이 승인된 경우에만 해당 사례를 검토하고 기준을 변경한다. `tests/capture-baseline.mjs`는 작업 당시 로컬 보존본 `.refactor-baseline/` 전용이며 일반 테스트에서 실행되지 않는다.

## 기존 문서와의 관계

`INTENT.md`와 `REVIEW.md`는 이전 시점의 설명과 리뷰를 보존한다. 현재 구현에는 서버 명단·참가 신청·2시간 보드 복원·곡선 점수 및 최고 티어 가산이 있어 초기 의도 문서와 다르다. 이번 정리는 초기 문서의 동작으로 되돌리는 작업이 아니다.

추가 기능을 만들 때는 기존 동작을 확인한 뒤 해당 책임의 모듈에 추가하고, 대응 테스트를 함께 갱신한다. 단순 파일 길이를 줄이기 위한 분할이나 범용 추상화는 피한다.
