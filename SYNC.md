# 기존 플레이어 명단 서버 동기화

방 코드 없이, **클럽 공유 명단 하나**를 Cloudflare KV에 두고 모든 PC가 맞춥니다.  
오늘 대기열·팀은 로컬만 쓰고, 서버에는 **닉네임·티어만** 올라갑니다.

## Cloudflare에서 할 일

1. [Workers & Pages](https://dash.cloudflare.com/) → **KV** → 네임스페이스 생성
2. Pages 프로젝트(Valnce) → **Settings → Bindings → Add → KV namespace**
   - Variable name: `ROSTER` (코드와 이름 같아야 함)
   - KV namespace: `valnce_roster`
3. **Redeploy** (바인딩은 재배포 후 적용)
4. GitHub `main`에 푸시하거나 Cloudflare가 빌드하도록 연결

현재 클럽 설정: binding `ROSTER` → namespace `valnce_roster`

로컬에서 Functions까지 보려면:

```bash
npm run build
npx wrangler pages dev dist --kv=ROSTER
```

## 동작

- 페이지 로드 → `GET /api/roster` 로 서버 명단 수신
- 서버가 더 최신이면 로컬 기존 명단을 교체
- 로컬에서 플레이어 추가/수정/삭제/가져오기 → 잠깐 후 `PUT /api/roster`
- 충돌 시 **더 늦은 updatedAt** 이 이김

## 참고

- 일반 Vite `npm run dev` 만으로는 `/api/roster` 가 없어서 **명단 오프라인**으로 보입니다. 배포본 또는 `wrangler pages dev` 에서 동기화가 됩니다.
- 쓰기 비밀번호가 필요하면 나중에 Functions에 시크릿 헤더를 추가하면 됩니다.
