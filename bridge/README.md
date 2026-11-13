# Valnce 치지직 채팅 브릿지

치지직 Open API 채팅을 구독해 `!신청` / `!참가` / `!불참`을 Valnce Workers `/api/bridge/*`로 전달합니다. 서버컴에서 Docker로 상시 실행하는 것을 권장합니다.

## 사전 준비

1. [치지직 개발자 센터](https://developers.chzzk.naver.com/)에서 앱 등록
2. Scope **채팅 메시지 조회**·**채팅 메시지 쓰기** 신청·승인
3. 로그인 리디렉션 URL에 `http://127.0.0.1:8788/callback` 등록 (또는 `.env`의 `CHZZK_REDIRECT_URI`)
4. Valnce Workers에 시크릿 설정:

```bash
npx wrangler secret put CHAT_BRIDGE_SECRET
```

5. 관리자 화면에서 **채팅 연동**이 켜져 있는지 확인

## 로컬에서 토큰 받기 (1회)

```bash
cd bridge
cp .env.example .env   # 값 채우기
npm install
npm run login          # 출력된 URL을 브라우저에서 열어 스트리머 계정으로 동의
```

`data/tokens.json`이 생성됩니다. Docker 볼륨으로 이 파일을 넘깁니다.

## Docker (서버컴)

```bash
cd bridge
docker compose up -d --build
docker compose logs -f
```

매니지 헤더에 **채팅 연동됨**이 보이면 heartbeat가 정상입니다.

## 채팅 명령

| 명령 | 동작 |
| --- | --- |
| `!신청 닉#태그` | 신규/재신청 (오더: 끝에 `오더`) |
| `!참가 닉#태그` | 동일 |
| `!참가` | 보드 출석 또는 명단 자동 합류 |
| `!불참` | 보드 불참 |
| `!도움` | 명령 안내 |

처리 결과·안내는 스트리머 계정으로 채팅에 한 줄 답장합니다. (Scope **채팅 메시지 쓰기** 필요, 메시지 최대 100자)

웹 `/join`은 그대로 사용할 수 있습니다.

## Azure Student 대안

서버컴이 없으면 동일 이미지를 Azure Container Instances / 소형 Linux VM에 올리고 `data/tokens.json`만 영속 디스크에 두면 됩니다. 크레딧·자격 만료 후 이전을 염두에 두세요.

## 장애 시

- 브릿지 다운 → 채팅 입구만 중단, `/join`은 동작
- 시크릿 유출 의 → 관리자에서 **채팅 연동** OFF 후 `CHAT_BRIDGE_SECRET` 교체
- Refresh 토큰 만료(약 30일 미사용 등) → 서버에서 `npm run login` 다시 실행
