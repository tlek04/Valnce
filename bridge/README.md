# Valnce 치지직 채팅 브릿지

치지직 Open API 채팅을 구독해 `!참가` / `!불참` / `!도움`을 Valnce Workers **`/api/bridge/participate`**(및 heartbeat)로 전달합니다. 서버컴에서 Docker로 상시 실행하는 것을 권장합니다. **원본은 이 폴더(`Valnce/bridge`)** — Desktop 복사본보다 git pull 후 여기를 쓰세요.

## 사전 준비

1. [치지직 개발자 센터](https://developers.chzzk.naver.com/)에서 앱 등록
2. Scope **채팅 메시지 조회**·**채팅 메시지 쓰기** 신청·승인
3. 로그인 리디렉션 URL에 `.env`의 `CHZZK_REDIRECT_URI` 등록 (기본 `http://localhost:4989/callback`)
4. Valnce Workers에 시크릿 설정:

```bash
npx wrangler secret put CHAT_BRIDGE_SECRET
```

5. 관리자 화면에서 **채팅 연동**(`chatBridgeOpen`)과 **시청자 참가**(`viewerAccessOpen`)가 켜져 있는지 확인

## 로컬에서 토큰 받기 (1회)

```bash
cd bridge
cp .env.example .env   # 값 채우기
npm install
npm run login          # 출력된 URL을 브라우저에서 열어 스트리머 계정으로 동의
```

다른 PC에서 스트리머만 동의받을 때: `npm run login:remote` 또는 `login-remote.bat` (터널 URL을 개발자 센터 리디렉션에 임시 등록).

`data/tokens.json`이 생성됩니다. Docker 볼륨으로 이 파일을 넘깁니다.

## Docker (서버컴)

Windows: `start.bat` / `stop.bat` / `logs.bat`

```bash
cd bridge
git pull   # 개발 PC에서 푸시한 뒤
docker compose up -d --build
docker compose logs -f
```

매니지 헤더에 **채팅 연동됨**이 보이면 heartbeat가 정상입니다. (`chatBridgeOpen` OFF면 heartbeat도 403이라 오프라인으로 표시됩니다.)

## 채팅 명령

런타임 정본은 **`POST /api/bridge/participate`** 입니다. (`/join`·`/check-in`은 호환용)

| 명령 | 동작 |
| --- | --- |
| `!참가 닉#태그` | 신규 신청 / 명단이면 자동 합류 (끝에 `오더`). 치지직 채널 ID 바인딩 |
| `!참가` | 보드 출석, 또는 명단(채널 ID/닉) 자동 합류 |
| `!불참` | 보드 불참 |
| `!도움` | 명령 안내 |
| `!오더` | 오더로 참가·신청 |

처리 결과·안내는 스트리머 계정으로 채팅에 한 줄 답장합니다. (메시지 최대 100자)

웹 `/join`은 그대로 사용할 수 있습니다.

## Azure Student 대안

서버컴이 없으면 동일 이미지를 Azure Container Instances / 소형 Linux VM에 올리고 `data/tokens.json`만 영속 디스크에 두면 됩니다. 크레딧·자격 만료 후 이전을 염두에 두세요.

## 장애 시

- 브릿지 다운 → 채팅 입구만 중단, `/join`은 동작
- 시크릿 유출 시 → 관리자에서 **채팅 연동** OFF 후 `CHAT_BRIDGE_SECRET` 교체
- Refresh 토큰 만료(약 30일 미사용 등) → 서버에서 `npm run login` 또는 `login-remote.bat` 다시 실행
