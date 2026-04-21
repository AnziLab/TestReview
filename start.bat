@echo off
setlocal enabledelayedexpansion
title TestReview

set INSTALL_DIR=%~dp0

:: Auto-update if git repo
if exist "%INSTALL_DIR%.git" (
    git config --global --add safe.directory "%INSTALL_DIR%" >nul 2>&1
    echo Checking for updates...
    git -C "%INSTALL_DIR%" fetch origin --quiet >nul 2>&1
    if %errorlevel% equ 0 (
        for /f %%a in ('git -C "%INSTALL_DIR%" rev-parse HEAD') do set LOCAL=%%a
        for /f %%b in ('git -C "%INSTALL_DIR%" rev-parse @{u}') do set REMOTE=%%b
        if not "!LOCAL!"=="!REMOTE!" (
            echo   New version found. Updating...
            git -C "%INSTALL_DIR%" pull --ff-only origin >nul 2>&1
            if %errorlevel% equ 0 (
                echo   Updated OK
            ) else (
                echo   [!] Auto-update failed
            )
        ) else (
            echo   Up to date
        )
    ) else (
        echo   No internet - running current version
    )
    echo.
)

:: Update desktop shortcut icon if needed
set ICON_PATH=%INSTALL_DIR%assets\icon.ico
set LNK_PATH=
for /f "delims=" %%d in ('powershell -noprofile -c "[Environment]::GetFolderPath('Desktop')"') do set LNK_PATH=%%d\TestReview.lnk
if exist "%ICON_PATH%" if not exist "%LNK_PATH%" (
    set SHORTCUT_VBS=%TEMP%\update_shortcut.vbs
    (
        echo Set WshShell = WScript.CreateObject("WScript.Shell"^)
        echo Set lnk = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop"^) ^& "\TestReview.lnk"^)
        echo lnk.TargetPath = "%INSTALL_DIR%start.bat"
        echo lnk.WorkingDirectory = "%INSTALL_DIR%"
        echo lnk.IconLocation = "%ICON_PATH%"
        echo lnk.Description = "TestReview - Grading Tool"
        echo lnk.Save
    ) > "!SHORTCUT_VBS!"
    cscript //nologo "!SHORTCUT_VBS!" >nul 2>&1
    del "!SHORTCUT_VBS!"
    if exist "%USERPROFILE%\Desktop\TestReview.bat" del "%USERPROFILE%\Desktop\TestReview.bat"
)

:: Kill existing processes on port 8000 and 3000
echo Stopping previous servers if running...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8000 " ^| findstr LISTENING') do (
    taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do (
    taskkill /PID %%p /F >nul 2>&1
)

echo Starting servers...
cd /d "%INSTALL_DIR%backend"
call .venv\Scripts\activate.bat

:: Auto-generate .env if missing
if not exist ".env" (
    echo Generating .env...
    python scripts\gen_env.py .env
    alembic upgrade head
)

start /min "" cmd /c "cd /d "%INSTALL_DIR%backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000 2>>..\logs\backend.log"

start /min "" cmd /c "cd /d "%INSTALL_DIR%frontend" && npm run dev -- --hostname 127.0.0.1 2>>..\logs\frontend.log"

if not exist "%INSTALL_DIR%logs" mkdir "%INSTALL_DIR%logs"

echo Waiting for servers...
timeout /t 8 /nobreak >nul

start http://localhost:3000

echo.
echo TestReview is running.
echo   Browser will open automatically.
echo   Closing this window will stop the servers.
echo.

:WAIT
timeout /t 5 /nobreak >nul
curl -s http://127.0.0.1:8000/api/v1/auth/me >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Backend stopped. Restarting...
    start /min "" cmd /c "cd /d "%INSTALL_DIR%backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --host 127.0.0.1 --port 8000 2>>..\logs\backend.log"
)
goto WAIT
