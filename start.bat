@echo off
title TestReview

set INSTALL_DIR=%~dp0

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
