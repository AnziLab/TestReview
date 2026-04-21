#!/bin/bash
# ──────────────────────────────────────────────
#  TestReview 원클릭 설치
#  이 파일을 더블클릭하면 자동으로 설치됩니다.
# ──────────────────────────────────────────────

set -e

REPO_URL="https://github.com/anzilab/testreview.git"
BRANCH="main"
INSTALL_DIR="$HOME/TestReview"

clear
echo "============================================="
echo "  TestReview - 손글씨 채점 시스템 설치"
echo "============================================="
echo ""

# ── 1. Git 확인 / 설치 ──
echo "[1/6] Git 확인 중..."
if command -v git &>/dev/null; then
    echo "     ✓ Git OK ($(git --version))"
else
    echo "     Git이 없습니다. 설치를 시작합니다..."
    echo "     (팝업이 나타나면 '설치' 버튼을 눌러주세요)"
    xcode-select --install 2>/dev/null || true
    echo ""
    echo "     Xcode Command Line Tools 설치가 완료되면"
    echo "     이 파일을 다시 더블클릭해주세요."
    echo ""
    read -n 1 -s -r -p "     아무 키나 누르면 종료합니다..."
    exit 0
fi

# ── 2. Python 확인 / 설치 ──
echo "[2/6] Python 확인 중..."
if command -v python3 &>/dev/null; then
    echo "     ✓ Python OK ($(python3 --version))"
else
    echo "     Python3가 없습니다. Homebrew로 설치합니다..."
    if ! command -v brew &>/dev/null; then
        echo "     Homebrew 설치 중..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
    fi
    brew install python@3.11
    echo "     ✓ Python 설치 완료"
fi

# ── 3. Node.js 확인 / 설치 ──
echo "[3/6] Node.js 확인 중..."
if command -v node &>/dev/null; then
    echo "     ✓ Node.js OK ($(node --version))"
else
    echo "     Node.js가 없습니다. Homebrew로 설치합니다..."
    if ! command -v brew &>/dev/null; then
        echo "     Homebrew 설치 중..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
    fi
    brew install node
    echo "     ✓ Node.js 설치 완료"
fi

# ── 4. 레포지토리 클론 (Git으로 받아서 업데이트 가능) ──
echo "[4/6] TestReview 다운로드 중..."
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "     이미 설치되어 있습니다. 최신 버전으로 업데이트..."
    cd "$INSTALL_DIR"
    git pull --ff-only origin "$BRANCH" || echo "     ⚠ 업데이트 실패 — 기존 버전으로 계속합니다"
    echo "     ✓ 업데이트 완료"
else
    if [ -d "$INSTALL_DIR" ]; then
        echo "     기존 폴더 백업: ${INSTALL_DIR}.backup"
        mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d%H%M%S)"
    fi
    git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    echo "     ✓ 다운로드 완료 → $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 5. 백엔드 의존성 설치 ──
echo "[5/6] 백엔드 설치 중..."
cd "$INSTALL_DIR/backend"
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
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
    echo "     .env 생성 완료"
fi

alembic upgrade head 2>/dev/null || alembic upgrade head
echo "     ✓ 백엔드 준비 완료"

# ── 6. 프론트엔드 의존성 설치 ──
echo "[6/6] 프론트엔드 설치 중..."
cd "$INSTALL_DIR/frontend"
npm install --silent 2>/dev/null || npm install
echo "     ✓ 프론트엔드 준비 완료"

# ── 실행 권한 부여 ──
chmod +x "$INSTALL_DIR/start.command"
chmod +x "$INSTALL_DIR/start.sh"

echo ""
echo "============================================="
echo "  ✓ 설치가 완료되었습니다!"
echo ""
echo "  설치 위치: $INSTALL_DIR"
echo ""
echo "  실행 방법:"
echo "    $INSTALL_DIR/start.command 를 더블클릭"
echo ""
echo "  업데이트도 자동으로 됩니다!"
echo "  (Git 레포지토리로 설치되었습니다)"
echo "============================================="
echo ""
read -n 1 -s -r -p "  아무 키나 누르면 종료합니다..."
