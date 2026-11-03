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
- **자동**: 앱을 열면 약 **12시간**에 한 번 (실패해도 시도 시각은 기록해 재폭주 방지)
- **즉시**: `커스텀 동기화` 버튼
- **API 호출**: 시드(단골) 최대 **2명 × 각 1회**만 Henrik 조회 (한 응답 = 그 사람 커스텀 여러 판)
- **합치기**: 두 시드 결과를 `matchId`로 합치고 중복 제거
- **반영**: 매치 참가자 ↔ 명단 닉#태그 매칭. 매칭 **2명 이상**인 custom만, 매칭된 전원 승패 재계산
- **조회 범위**: 응답 페이지 안에서 **가장 최근 8월 1일 ~ 최신**만 사용
- 닉#태그는 시드뿐 아니라 전적을 맞출 사람 모두에게 등록 (API는 시드만 침)

## 로컬

```bash
npm run build
npx wrangler dev
```

`npm run dev` 만으로는 `/api/*` 가 없어 명단·전적 API는 오프라인으로 보입니다.

## 명단 KV

- `GET/PUT /api/roster`
- 충돌 시 더 늦은 `updatedAt` 이김
