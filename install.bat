@echo off
chcp 65001 >nul 2>&1
title TestReview - Install

echo =============================================
echo   TestReview - Install
echo =============================================
echo.

:: Admin check
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Administrator privileges required.
    echo     Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

set REPO_URL=https://github.com/anzilab/testreview.git
set BRANCH=main
set INSTALL_DIR=%USERPROFILE%\TestReview

:: -- 1. Git --------------------------------------------------------------
echo [1/6] Checking Git...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo      Git not found. Installing via winget...
    winget install --id Git.Git --source winget --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] Git install failed. Install manually:
        echo     https://git-scm.com/download/win
        pause
        exit /b 1
    )
    set "PATH=%PATH%;%ProgramFiles%\Git\cmd"
)
git --version
echo      Git OK

:: -- 2. Python ------------------------------------------------------------
echo [2/6] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo      Python not found. Installing via winget...
    winget install --id Python.Python.3.11 --source winget --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] Python install failed. Install manually:
        echo     https://www.python.org/downloads/
        pause
        exit /b 1
    )
    call refreshenv >nul 2>&1
    set "PATH=%PATH%;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python311\Scripts"
)
python --version
echo      Python OK

:: -- 3. Node.js ----------------------------------------------------------
echo.
echo [3/6] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo      Node.js not found. Installing via winget...
    winget install --id OpenJS.NodeJS.LTS --source winget --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [!] Node.js install failed. Install manually:
        echo     https://nodejs.org/
        pause
        exit /b 1
    )
    set "PATH=%PATH%;%ProgramFiles%\nodejs"
)
node --version
echo      Node.js OK

:: -- 4. Clone repository (Git) -------------------------------------------
echo.
echo [4/6] Downloading TestReview...
if exist "%INSTALL_DIR%\.git" (
    echo      Already installed. Updating to latest version...
    cd /d "%INSTALL_DIR%"
    git pull --ff-only origin %BRANCH%
    if %errorlevel% neq 0 (
        echo      [!] Update failed - continuing with existing version
    ) else (
        echo      Updated OK
    )
) else (
    if exist "%INSTALL_DIR%" (
        echo      Backing up existing folder...
        ren "%INSTALL_DIR%" "TestReview.backup.%date:~0,4%%date:~5,2%%date:~8,2%"
    )
    git clone -b %BRANCH% %REPO_URL% "%INSTALL_DIR%"
    if %errorlevel% neq 0 (
        echo [!] Download failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo      Download OK
)

:: -- 5. Python venv + packages --------------------------------------------
echo.
echo [5/6] Installing Python packages (this may take a while)...
cd /d "%INSTALL_DIR%\backend"
if not exist ".venv" (
    python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo [!] Python package install failed
    pause
    exit /b 1
)
echo      Python packages OK

:: -- .env ----------------------------------------------------------------
if not exist "%INSTALL_DIR%\backend\.env" (
    echo      Generating .env...
    python scripts\gen_env.py .env
)

:: -- DB migration ---------------------------------------------------------
echo.
echo [5/6] Initializing database...
alembic upgrade head
if %errorlevel% neq 0 (
    echo [!] DB init failed
    pause
    exit /b 1
)
echo      DB OK

:: -- 6. Frontend packages ------------------------------------------------
echo.
echo [6/6] Installing frontend packages (this may take a while)...
cd /d "%INSTALL_DIR%\frontend"
if not exist "node_modules" (
    call npm install --silent
)
if %errorlevel% neq 0 (
    echo [!] Frontend install failed
    pause
    exit /b 1
)
echo      Frontend OK

:: -- Desktop shortcut ----------------------------------------------------
echo.
echo Creating desktop shortcut...
set SHORTCUT_PATH=%USERPROFILE%\Desktop\TestReview.bat

(
echo @echo off
echo cd /d "%INSTALL_DIR%"
echo call start.bat
) > "%SHORTCUT_PATH%"

echo.
echo =============================================
echo   Install complete!
echo.
echo   Location: %INSTALL_DIR%
echo.
echo   Double-click "TestReview" on your desktop
echo   to launch the app.
echo.
echo   Updates will be automatic on each launch!
echo =============================================
echo.
pause
