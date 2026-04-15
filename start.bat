@echo off
chcp 65001 >nul
title 채점기준 정제 도구

set INSTALL_DIR=%~dp0

:: 백엔드 시작
echo 서버 시작 중...
cd /d "%INSTALL_DIR%backend"
call .venv\Scripts\activate.bat

:: .env 없으면 생성
if not exist ".env" (
    echo [!] .env 파일이 없습니다. install.bat을 먼저 실행하세요.
    pause
    exit /b 1
)

start /min "" cmd /c "cd /d "%INSTALL_DIR%backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000 2>>..\logs\backend.log"

:: 프론트엔드 시작
start /min "" cmd /c "cd /d "%INSTALL_DIR%frontend" && npm run dev -- --hostname 127.0.0.1 2>>..\logs\frontend.log"

:: 로그 폴더 생성
if not exist "%INSTALL_DIR%logs" mkdir "%INSTALL_DIR%logs"

:: 서버 뜰 때까지 대기 후 브라우저 오픈
echo 잠시 기다리는 중...
timeout /t 8 /nobreak >nul

:: 브라우저 열기
start http://localhost:3000

echo.
echo ✓ 채점기준 정제 도구가 실행되었습니다.
echo   브라우저가 자동으로 열립니다.
echo   이 창을 닫으면 서버가 종료됩니다.
echo.
echo 종료하려면 이 창을 닫으세요.
echo.

:: 창 유지 (닫으면 서버도 종료)
:WAIT
timeout /t 5 /nobreak >nul

:: 백엔드 살아있는지 확인
curl -s http://127.0.0.1:8000/api/v1/auth/me >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 백엔드 서버가 중단되었습니다. 재시작 시도...
    start /min "" cmd /c "cd /d "%INSTALL_DIR%backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000 2>>..\logs\backend.log"
)
goto WAIT
