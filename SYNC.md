# 서버 동기화 · 커스텀 전적

방 코드 없이 클럽 공유 명단(KV)과, HenrikDev 기반 커스텀 승패 재계산을 씁니다.

## Cloudflare Workers Builds

1. Build command: `npm run build`
2. Deploy command: `npx wrangler deploy`
3. Root directory: 비움
4. Bindings → KV: Variable `ROSTER` → `valnce_roster`
5. **Secrets** → `HENRIK_API_KEY` = [HenrikDev](https://docs.henrikdev.xyz) API 키
6. Redeploy

`wrangler.toml`의 `assets.directory = "./dist"` 가 빌드 출력 경로입니다.

## 커스텀 전적 규칙

- **수동**: 보드 `1팀 승` / `2팀 승` (즉시 반영)
- **자동**: 앱을 열면 약 **12시간**에 한 번 `/api/matches/import` 호출
- **즉시**: `커스텀 동기화` 버튼
- **시드**: 플레이어 설정에서 단골 최대 **2명** + 닉#태그
- **내전 판정**: `queue=custom` 이고 등록 닉#태그가 매치에 **3명 이상**
- **조회 범위**: **가장 최근 8월 1일 ~ 최신** (예: 지금이면 2026-08-01부터)
- **최종 전적**: 위 매치들로 wins/losses/streak를 **재계산해 덮어씀** (태그 있는 사람만). 수동만 하고 API에 매치가 없으면 다음 동기화 때 매치 기준으로 맞춰질 수 있음.

실시간 시작/종료 웹훅은 없습니다.

## 로컬

```bash
npm run build
npx wrangler dev
```

`npm run dev` 만으로는 `/api/*` 가 없어 명단·전적 API는 오프라인으로 보입니다.

## 명단 KV

- `GET/PUT /api/roster`
- 충돌 시 더 늦은 `updatedAt` 이김
