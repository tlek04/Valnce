# 스트리머 인증 · 접속 IP · 세션 회수

## 개요

- 스트리머는 Cloudflare Secret `STREAMER_PASSWORD`로 `/manage`에 로그인합니다.
- 로그인 성공 시 **세션 토큰**이 발급되며, 브라우저 `localStorage`에 저장됩니다. **비밀번호 원문은 저장하지 않습니다.**
- 보호 API는 `Authorization: Bearer <세션 토큰>`을 검사합니다.
- 배포만으로는 토큰이 바뀌지 않습니다. **비밀번호 변경** 또는 **모든 세션 끊기(epoch)** 로 기존 토큰을 무효화합니다.

## Secrets

| 이름 | 용도 |
|------|------|
| `STREAMER_PASSWORD` | 로그인·세션 서명·revoke 확인 |
| `HENRIK_API_KEY` | 전적 동기화 (인증과 무관) |

## 토큰

- 형식: HMAC-SHA256 서명 (`v1.<payload>.<sig>`)
- payload: `{ v, exp, epoch }` — 만료 기본 30일, `epoch`는 KV `auth:session-epoch`
- 검증: 서명 + 만료 + **현재 epoch와 일치**

### 무효화 방법

1. **매니지 → 접속 IP → 모든 세션 끊기**  
   - API: `POST /api/auth/revoke-all` body `{ "password": "..." }`  
   - KV epoch +1 → 기존 토큰 전부 401  
   - 본인은 `/manage`에서 다시 로그인하면 새 토큰을 받습니다.

2. **Cloudflare에서 `STREAMER_PASSWORD` 변경**  
   - 서명 키가 바뀌어 기존 토큰 전부 무효 + 비번도 교체됩니다.

## 접속 IP 로그

- KV 키: `auth:access-log` (최근 50건)
- 기록:
  - 로그인 성공/실패
  - 인증된 API 호출 성공 (같은 IP는 10분에 1회만)
- 조회: `GET /api/auth/access-log` (스트리머 토큰 필요)  
  매니지 헤더 **접속 IP** 패널에서도 동일 데이터를 봅니다.
- 사람 이름은 없습니다. **IP · 시각 · 성공/실패**만 남습니다.

## 로그인 시도 제한

- IP당 15분에 실패 8회 초과 시 `429`
- KV: `auth:login:<ip>`

## API 요약

| 경로 | 인증 | 설명 |
|------|------|------|
| `POST /api/auth/login` | 없음 (비번) | `{ ok, token, expiresInMs }` |
| `GET /api/auth/access-log` | Bearer 토큰 | `{ items: [{ ip, at, ok }] }` |
| `POST /api/auth/revoke-all` | 비번 | epoch 증가, 전 세션 무효 |

## 로컬

`npm run dev`만으로는 Worker API가 없어 로그인·접속 로그가 동작하지 않습니다.

```bash
npm run build
npx wrangler dev
```

## 관련 코드

- 서버: `src/server/auth.ts`, `src/worker.ts`
- 클라이언트: `src/utils/streamerAuth.ts`, `src/components/Header.tsx`
