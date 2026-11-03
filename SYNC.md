# 기존 플레이어 명단 서버 동기화

방 코드 없이, **클럽 공유 명단 하나**를 Cloudflare KV에 두고 모든 PC가 맞춥니다.  
오늘 대기열·팀은 로컬만 쓰고, 서버에는 닉·티어·태그·전적이 올라갑니다.

## Cloudflare Workers Builds 설정

지금 대시보드에 **Root directory만** 보이는 건 Workers Builds라서 정상입니다.  
출력 폴더는 대시보드가 아니라 `wrangler.toml`의 `assets.directory = "./dist"` 로 지정합니다.

1. Build command: `npm run build`
2. Deploy command: `npx wrangler deploy` (기본값 유지)
3. Root directory: 비움 (`/` 또는 공백)
4. Settings → Bindings → KV
   - Variable name: `ROSTER`
   - KV namespace: `valnce_roster`
5. Redeploy

현재 클럽 설정: binding `ROSTER` → namespace `valnce_roster`

## 로컬

```bash
npm run build
npx wrangler dev
```

## 동작

- 페이지 로드 → `GET /api/roster`
- 서버가 더 최신이면 로컬 명단 교체
- 명단 변경 시 `PUT /api/roster`
- 충돌 시 더 늦은 `updatedAt` 이김

## 참고

- `npm run dev`(Vite만)에서는 `/api/roster` 가 없어 **명단 오프라인**으로 보입니다.
- 예전 Pages `functions/` 방식은 Worker(`src/worker.ts`)로 옮겼습니다.
