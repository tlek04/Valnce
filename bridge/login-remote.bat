@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [Valnce] 원격 OAuth 로그인 (스트리머 동의용)
echo Node.js가 필요합니다. 끝나면 창을 닫지 말고 안내를 따르세요.
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요.
  pause
  exit /b 1
)
if not exist "node_modules\" (
  echo npm install 중...
  call npm install
)
call npm run login:remote
pause
