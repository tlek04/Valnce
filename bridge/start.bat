@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [Valnce] 치지직 브릿지 Docker 시작...
if not exist "data\tokens.json" (
  echo.
  echo [경고] data\tokens.json 이 없습니다.
  echo 먼저 login-remote.bat 또는 npm run login 으로 스트리머 동의를 완료하세요.
  echo.
  pause
  exit /b 1
)
docker compose up -d --build
if errorlevel 1 (
  echo Docker 실행 실패. Docker Desktop이 켜져 있는지 확인하세요.
  pause
  exit /b 1
)
echo.
echo 시작됨. 로그: logs.bat
echo 매니지 헤더에 "채팅 연동됨"이 보이면 정상입니다.
pause
