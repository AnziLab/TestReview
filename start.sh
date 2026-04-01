#!/bin/bash
# TestReview 실행 스크립트
# 사용법: bash start.sh

set -e

echo "====================================="
echo "  TestReview - 손글씨 채점 시스템"
echo "====================================="
echo ""

# 1. 백엔드 의존성 설치
echo "[1/4] 백엔드 의존성 설치 중..."
cd "$(dirname "$0")/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt --quiet
echo "  ✓ 백엔드 준비 완료"

# 2. 프론트엔드 의존성 설치
echo "[2/4] 프론트엔드 의존성 설치 중..."
cd "$(dirname "$0")/../frontend"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
echo "  ✓ 프론트엔드 준비 완료"

# 3. 백엔드 서버 시작
echo "[3/4] 백엔드 서버 시작 (포트 8000)..."
cd "$(dirname "$0")/../backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# 4. 프론트엔드 서버 시작
echo "[4/4] 프론트엔드 서버 시작 (포트 3000)..."
cd "$(dirname "$0")/../frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "====================================="
echo "  서버가 시작되었습니다!"
echo ""
echo "  프론트엔드: http://localhost:3000"
echo "  백엔드 API: http://localhost:8000"
echo "  API 문서:   http://localhost:8000/docs"
echo ""
echo "  종료하려면 Ctrl+C 를 누르세요"
echo "====================================="

# Ctrl+C 시 양쪽 다 종료
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
