@echo off
chcp 65001 >nul
title 채점기준 정제 도구 - 설치

echo =============================================
echo   채점기준 정제 도구 설치 프로그램
echo =============================================
echo.

:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] 관리자 권한이 필요합니다.
    echo     이 파일을 우클릭 후 "관리자로 실행"을 선택하세요.
    pause
    exit /b 1
)

set INSTALL_DIR=%~dp0
cd /d "%INSTALL_DIR%"

:: ── 1. Python 확인 및 설치 ────────────────────────────────────────────────
echo [1/5] Python 확인 중...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo      Python이 없습니다. 자동 설치합니다...
    winget install --id Python.Python.3.11 --source winget --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] winget 설치 실패. 수동으로 설치해주세요:
        echo     https://www.python.org/downloads/
        pause
        exit /b 1
    )
    :: PATH 새로고침
    call refreshenv >nul 2>&1
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
)
python --version
echo      Python OK

:: ── 2. Node.js 확인 및 설치 ──────────────────────────────────────────────
echo.
echo [2/5] Node.js 확인 중...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo      Node.js가 없습니다. 자동 설치합니다...
    winget install --id OpenJS.NodeJS.LTS --source winget --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] winget 설치 실패. 수동으로 설치해주세요:
        echo     https://nodejs.org/
        pause
        exit /b 1
    )
    :: PATH 새로고침
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
node --version
echo      Node.js OK

:: ── 3. Python 가상환경 및 패키지 설치 ────────────────────────────────────
echo.
echo [3/5] Python 패키지 설치 중... (시간이 걸릴 수 있습니다)
cd "%INSTALL_DIR%backend"
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [!] Python 패키지 설치 실패
    pause
    exit /b 1
)
echo      Python 패키지 OK

:: ── .env 파일 자동 생성 ─────────────────────────────────────────────────
if not exist "%INSTALL_DIR%backend\.env" (
    echo      .env 파일 생성 중...
    :: Python으로 랜덤 키 생성
    for /f %%i in ('python -c "import secrets; print(secrets.token_hex(32))"') do set SECRET_KEY=%%i
    for /f %%i in ('python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set ENC_KEY=%%i
    (
        echo DATABASE_URL=sqlite+aiosqlite:///./grading.db
        echo SECRET_KEY=%SECRET_KEY%
        echo ENCRYPTION_KEY=%ENC_KEY%
        echo STORAGE_PATH=./storage
        echo ALLOWED_ORIGINS=["http://localhost:3000"]
        echo ACCESS_TOKEN_EXPIRE_MINUTES=120
        echo REFRESH_TOKEN_EXPIRE_DAYS=14
    ) > "%INSTALL_DIR%backend\.env"
)

:: ── 4. DB 마이그레이션 ───────────────────────────────────────────────────
echo.
echo [4/5] 데이터베이스 초기화 중...
alembic upgrade head
if %errorlevel% neq 0 (
    echo [!] DB 초기화 실패
    pause
    exit /b 1
)
echo      DB OK

:: ── 5. 프론트엔드 패키지 설치 ────────────────────────────────────────────
echo.
echo [5/5] 프론트엔드 패키지 설치 중... (시간이 걸릴 수 있습니다)
cd "%INSTALL_DIR%frontend"
if not exist "node_modules" (
    call npm install --silent
)
if %errorlevel% neq 0 (
    echo [!] 프론트엔드 패키지 설치 실패
    pause
    exit /b 1
)
echo      프론트엔드 OK

:: ── 어드민 계정 생성 ─────────────────────────────────────────────────────
echo.
echo ───────────────────────────────────────────
echo   어드민 계정 설정
echo ───────────────────────────────────────────
cd "%INSTALL_DIR%backend"
call .venv\Scripts\activate.bat

set /p ADMIN_USER="  어드민 아이디 입력: "
set /p ADMIN_EMAIL="  어드민 이메일 입력: "
set /p ADMIN_PW="  어드민 비밀번호 입력: "

python -m app.cli create-admin --username "%ADMIN_USER%" --email "%ADMIN_EMAIL%" --password "%ADMIN_PW%"
if %errorlevel% neq 0 (
    echo [!] 계정 생성 실패 (이미 존재할 수 있습니다)
)

:: ── 바탕화면 단축키 생성 ─────────────────────────────────────────────────
echo.
echo 바탕화면 단축키 생성 중...
set SHORTCUT_PATH=%USERPROFILE%\Desktop\채점기준 정제 도구.bat

(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo start.bat
) > "%SHORTCUT_PATH%"

echo.
echo =============================================
echo   설치 완료!
echo.
echo   바탕화면의 "채점기준 정제 도구" 파일을
echo   더블클릭하면 실행됩니다.
echo =============================================
echo.
pause
