# 서버 동기화 · 커스텀 전적

방 코드 없이 클럽 공유 명단(KV)과, HenrikDev 기반 커스텀 승패 재계산을 씁니다.

## Cloudflare Workers Builds

1. Build command: `npm run build`
2. Deploy command: `npx wrangler deploy`
3. Root directory: 비움
4. KV `ROSTER` 는 `wrangler.toml`의 `[[kv_namespaces]]` 에 고정 (대시보드만 넣으면 배포 때 사라짐)
5. **Secrets** → `HENRIK_API_KEY` = [HenrikDev](https://docs.henrikdev.xyz) API 키
6. **Secrets** → `STREAMER_PASSWORD` = 스트리머 매니저 입장·세션 서명 비밀번호
7. Redeploy

## 스트리머 / 시청자

- `/` 랜딩 → 스트리머(`/manage`, 비밀번호) · 시청자(`/join`, 닉+발로닉 신청)
- 시청자 신청은 KV `join-queue`에 쌓이고, 스트리머가 승인하면 명단+대기열에 추가
- 로그인 후 세션 토큰이 발급되며, `PUT /api/roster` 등 쓰기 API는 `Authorization: Bearer <세션 토큰>` 필요
- 접속 IP · 세션 일괄 회수: 매니지 **접속 IP** 패널 / 자세한 설명은 [docs/AUTH.md](docs/AUTH.md)

`wrangler.toml`의 `assets.directory = "./dist"` 가 빌드 출력 경로입니다.

## 커스텀 전적 규칙

- **수동**: 보드 `1팀 승` / `2팀 승` (로컬 즉시 반영, API 없음)
- **전적 동기화**: 상단 버튼을 눌렀을 때만 Henrik API 호출
- **API 호출**: 고정 시드 **포뇨**, **게임은이게맞어** (명단/발로란트 닉 매칭) × 각 1회 Henrik 조회
- **합치기**: 두 시드 결과를 `matchId`로 합치고 중복 제거
- **반영**: 매치 참가자 ↔ 명단 닉#태그 매칭. 매칭 **2명 이상**인 custom만, 매칭된 전원 승패 재계산
- **조회 범위**: 응답 페이지 안에서 **가장 최근 8월 1일 ~ 최신**만 사용
- 시드 두 명과 전적을 맞출 전원에게 닉#태그 등록 (API는 시드만 침)

## 로컬

```bash
npm run build
npx wrangler dev
```

`npm run dev` 만으로는 `/api/*` 가 없어 명단·전적 API는 오프라인으로 보입니다.

## 명단 KV

- `GET/PUT /api/roster`
- 충돌 시 더 늦은 `updatedAt` 이김
