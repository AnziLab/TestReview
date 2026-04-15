#!/bin/bash
# TestReview 실행 스크립트
# 사용법: bash start.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "====================================="
echo "  TestReview 채점기준 정제 도구"
echo "====================================="
echo ""

# 1. 백엔드 의존성
echo "[1/4] 백엔드 의존성 확인..."
cd "$BACKEND_DIR"
if [ ! -d ".venv" ]; then
    python3.11 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt --quiet

if [ ! -f ".env" ]; then
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
    ENC_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    cat > .env << ENVEOF
DATABASE_URL=sqlite+aiosqlite:///./grading.db
SECRET_KEY=$SECRET_KEY
ENCRYPTION_KEY=$ENC_KEY
STORAGE_PATH=./storage
ALLOWED_ORIGINS=["http://localhost:3000"]
ACCESS_TOKEN_EXPIRE_MINUTES=120
REFRESH_TOKEN_EXPIRE_DAYS=14
ENVEOF
fi
echo "  ✓ 백엔드 준비 완료"

# 2. 프론트엔드 의존성
echo "[2/4] 프론트엔드 의존성 확인..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
echo "  ✓ 프론트엔드 준비 완료"

# 3. DB 마이그레이션
echo "[3/4] DB 마이그레이션..."
cd "$BACKEND_DIR"
alembic upgrade head --quiet 2>/dev/null || alembic upgrade head
echo "  ✓ DB 준비 완료"

# 4. 서버 시작
echo "[4/4] 서버 시작..."
cd "$BACKEND_DIR"
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
BACKEND_PID=$!

cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "====================================="
echo "  서버가 시작되었습니다!"
echo ""
echo "  프론트엔드: http://localhost:3000"
echo "  백엔드 API: http://localhost:8000"
echo ""
echo "  종료: Ctrl+C"
echo "====================================="

# 서버 뜰 때까지 대기 후 브라우저 자동 오픈
(sleep 6 && open http://localhost:3000) &

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
