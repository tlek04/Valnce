# 스트리머 · 관리자 인증 · 접속 IP · 세션 회수

## 개요

- 같은 게이트(`/manage` 비밀번호 입력)에서 역할이 갈립니다.
  - Cloudflare Secret `STREAMER_PASSWORD` → `/manage` (방송용 매니지)
  - Cloudflare Secret `ADMIN_PASSWORD` → `/admin` (운영 관리 화면)
- 로그인 성공 시 **세션 토큰**이 발급됩니다. 브라우저는 역할을 **별도 슬롯**에 저장합니다.
  - `valnce-streamer-token` — 스트리머(`/manage`)
  - `valnce-admin-token` — 관리자(`/admin`)
  - 한쪽 로그인·로그아웃이 다른 쪽 토큰을 지우지 않습니다.
- **비밀번호 원문은 저장하지 않습니다.**
- 보호 API는 `Authorization: Bearer <세션 토큰>`을 검사합니다.
- 스트리머 비번으로는 관리 창에 들어가지 않습니다. 관리자 비번은 별도 Secret입니다.
- 배포만으로는 토큰이 바뀌지 않습니다. **비밀번호 변경** 또는 **모든 세션 끊기(epoch)** 로 기존 토큰을 무효화합니다.

## Secrets

| 이름 | 용도 |
|------|------|
| `STREAMER_PASSWORD` | 스트리머 로그인·세션 서명 |
| `ADMIN_PASSWORD` | 관리자 로그인·세션 서명·세션 끊기·access-log |
| `HENRIK_API_KEY` | 전적 동기화 (인증과 무관) |

## 역할

| role | 진입 | 권한 |
|------|------|------|
| `streamer` | `/manage` | 명단 PUT 등 스트리머 API (`requireStreamer` — admin 토큰도 허용) |
| `admin` | `/admin` | 위 + 접속 IP 조회 (`requireAdmin`) · 승패 보정 · 명단 삭제 등 UI |

관리자 화면 숨은 입장: `/manage` 헤더 **팀 초기화**를 **5초** 길게 누르면 관리자 비밀번호 입력이 뜹니다. (화면에 안내 없음)

## 토큰

- 형식: HMAC-SHA256 서명 (`v1.<payload>.<sig>`)
- payload: `{ v, exp, epoch, role }` — 만료 기본 30일, `epoch`는 KV `auth:session-epoch`
- 검증: 서명 + 만료 + **현재 epoch와 일치** + role
- 스트리머 토큰은 `STREAMER_PASSWORD`로, 관리자 토큰은 `ADMIN_PASSWORD`로 서명됩니다.
- 클라이언트: 명단·신청 등 staff API는 **관리자 토큰 우선**, 없으면 스트리머 토큰(`streamerAuthHeaders`). 듀얼 토큰 + 스트리머 OFF일 때 admin Bearer로 staff API가 통과한다. access-log·site-settings PUT은 관리자 토큰만.

### 이 PC 예외 (신뢰 기기)

- 브라우저 `localStorage` `valnce-device-id` + 요청 헤더 `X-Device-Id`
- KV `auth:trusted-devices` — 관리자 로그인 시 자동 등록, `/admin`에서 수동 등록·해제
- **세션 끊기**: epoch는 올라가지만 신뢰 기기 토큰은 epoch 검사 생략 → 이 PC는 유지
- **스트리머 OFF**: 신뢰 기기는 로그인·매니지 API 계속 허용
- 다른 PC에는 둘 다 정상 적용

### 스트리머 입장 ON/OFF (토큰 유지)

- 관리 화면(`/admin`) → 세션 · 접속 → **스트리머 입장**
- 서버 `site-settings.streamerAccessOpen`
- **OFF**: 미신뢰 기기의 스트리머 로그인·API만 403. 토큰은 삭제하지 않음. 미신뢰 매니지 탭은 `alert` 후 창 닫기(실패 시 `/`)
- **ON**: 기존 토큰으로 바로 재개
- 관리자 로그인·API는 OFF와 무관. 미신뢰 PC는 랜딩 **관리자** 카드 또는 `/admin`

### 무효화 방법

1. **관리 화면(`/admin`) → 세션 · 접속 → 모든 세션 끊기**  
   - API: `POST /api/auth/revoke-all` body `{ "password": "..." }`  
   - **`ADMIN_PASSWORD`만** 확인에 사용 가능 (스트리머 비번은 거부)  
   - KV epoch +1 → **미신뢰** 기기 토큰 401. 신뢰된 이 PC는 예외  
   - 미신뢰 기기는 다시 로그인하면 새 토큰을 받습니다.

2. **Cloudflare에서 해당 비밀번호 Secret 변경**  
   - 서명 키가 바뀌어 그 역할의 기존 토큰이 무효 + 비번도 교체됩니다.

## 접속 IP 로그

- KV 키: `auth:access-log` (최근 50건)
- 기록:
  - 로그인 성공/실패
  - 인증된 API 호출 성공 (같은 IP는 10분에 1회만)
- 조회: `GET /api/auth/access-log` (**관리자** 토큰 필요)
- 비우기: `DELETE /api/auth/access-log` (**관리자** 토큰) — `/admin` **로그 비우기**
- `/admin` 관리 화면에서 확인합니다. `/manage` 헤더에는 접속 IP UI가 없습니다.
- 사람 이름은 없습니다. **IP · 시각 · 성공/실패**만 남습니다.

## 로그인 시도 제한

- IP당 15분에 실패 8회 초과 시 `429`
- KV: `auth:login:<ip>`

## API 요약

| 경로 | 인증 | 설명 |
|------|------|------|
| `POST /api/auth/login` | 없음 (비번) | `{ ok, token, role, expiresInMs }` — role은 `streamer` \| `admin` |
| `GET /api/auth/access-log` | Bearer **admin** 토큰 | `{ items: [{ ip, at, ok }] }` |
| `DELETE /api/auth/access-log` | Bearer **admin** 토큰 | `{ ok: true }` — 로그 비우기 |
| `POST /api/auth/revoke-all` | **ADMIN_PASSWORD** | epoch 증가 (신뢰 기기는 예외) |
| `GET /api/auth/trust-status` | `X-Device-Id` | `{ trusted }` |
| `GET/POST/DELETE /api/auth/trust-device` | Bearer **admin** | 신뢰 기기 목록·등록·해제 |
| `GET /api/site-settings` | 없음 | `{ showViewerCard, showStreamerCard, showMatchRecord, streamerAccessOpen, viewerAccessOpen }` |
| `PUT /api/site-settings` | Bearer **admin** 토큰 | 표시·세션 설정 부분 갱신(merge) |

## 로컬

`npm run dev`만으로는 Worker API가 없어 로그인·접속 로그가 동작하지 않습니다.

```bash
npm run build
npm run dev:worker
```

## 관련 코드

- 서버: `src/server/auth.ts`, `src/server/trustedDevices.ts`, `src/server/siteSettings.ts`, `src/server/siteSettingsStore.ts`, `src/worker.ts`
- 클라이언트: `src/utils/streamerAuth.ts`, `src/utils/deviceId.ts`, `src/utils/siteSettings.ts`, `src/pages/AdminApp.tsx`, `src/App.tsx`
