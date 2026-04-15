#!/bin/bash
# 채점기준 정제 도구 - Mac 설치 스크립트
# 처음 한 번만 실행하세요.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================="
echo "  채점기준 정제 도구 설치"
echo "============================================="
echo ""

# ── 1. Python 확인 및 설치 ────────────────────────────────────────────────
echo "[1/4] Python 확인 중..."
if ! command -v python3.11 &>/dev/null && ! python3 --version 2>&1 | grep -q "3\.1[1-9]"; then
    echo "     Python 3.11이 없습니다. Homebrew로 설치합니다..."
    if ! command -v brew &>/dev/null; then
        echo "     Homebrew 설치 중..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install python@3.11
fi
echo "     Python OK ($(python3 --version))"

# ── 2. Node.js 확인 및 설치 ──────────────────────────────────────────────
echo "[2/4] Node.js 확인 중..."
if ! command -v node &>/dev/null; then
    echo "     Node.js가 없습니다. Homebrew로 설치합니다..."
    brew install node
fi
echo "     Node.js OK ($(node --version))"

# ── 3. Python 의존성 설치 ────────────────────────────────────────────────
echo "[3/4] Python 패키지 설치 중..."
cd "$SCRIPT_DIR/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -r requirements.txt --quiet

# .env 생성
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
    echo "     .env 생성 완료"
fi

alembic upgrade head --quiet
echo "     Python OK"

# ── 4. 프론트엔드 의존성 설치 ────────────────────────────────────────────
echo "[4/4] 프론트엔드 패키지 설치 중..."
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    npm install --silent
fi
echo "     프론트엔드 OK"

# ── 실행 권한 부여 ────────────────────────────────────────────────────────
chmod +x "$SCRIPT_DIR/start.command"
chmod +x "$SCRIPT_DIR/start.sh"

echo ""
echo "============================================="
echo "  설치 완료!"
echo ""
echo "  'start.command' 파일을 더블클릭하면"
echo "  앱이 실행됩니다."
echo ""
echo "  처음 실행 시 브라우저에서 관리자 계정"
echo "  설정 화면이 나타납니다."
echo "============================================="
