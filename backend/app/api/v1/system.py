"""System: version check and update."""
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_user, require_admin
from app.models.user import User

router = APIRouter(tags=["system"])

REPO = "AnziLab/TestReview"  # GitHub 저장소 경로 (owner/repo)
ROOT_DIR = Path(__file__).resolve().parents[4]  # 프로젝트 루트
VERSION_FILE = ROOT_DIR / "version.json"


def _local_version() -> dict:
    try:
        return json.loads(VERSION_FILE.read_text())
    except Exception:
        return {"version": "unknown"}


def _ensure_safe_directory():
    """Windows: install runs as admin, app runs as normal user → mark safe."""
    try:
        subprocess.run(
            ["git", "config", "--global", "--add", "safe.directory", str(ROOT_DIR)],
            capture_output=True, timeout=5,
        )
    except Exception:
        pass


def _git_commit() -> str:
    try:
        _ensure_safe_directory()
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT_DIR, capture_output=True, text=True, timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


@router.get("/system/version")
async def get_version():
    """현재 버전 정보."""
    info = _local_version()
    info["commit"] = _git_commit()
    return info


@router.get("/system/update-check")
async def check_update(current_user: User = Depends(get_current_user)):
    """GitHub 최신 릴리즈 확인."""
    local = _local_version()
    local_commit = _git_commit()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # 최신 커밋 확인
            r = await client.get(
                f"https://api.github.com/repos/{REPO}/commits/HEAD",
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            if r.status_code != 200:
                return {"update_available": False, "error": "GitHub 연결 실패"}

            latest = r.json()
            latest_sha = latest["sha"][:7]
            latest_msg = latest["commit"]["message"].split("\n")[0]
            latest_date = latest["commit"]["committer"]["date"][:10]

            # 릴리즈 노트도 확인
            rr = await client.get(
                f"https://api.github.com/repos/{REPO}/releases/latest",
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            changelog = ""
            latest_version = None
            if rr.status_code == 200:
                rel = rr.json()
                changelog = rel.get("body", "")
                latest_version = rel.get("tag_name", "").lstrip("v") or None

        update_available = local_commit != latest_sha

        # 릴리즈 태그가 없으면 커밋 해시를 버전으로 표시
        current_display = local.get("version", "unknown")
        latest_display = latest_version or latest_date

        return {
            "update_available": update_available,
            "current_version": f"{current_display} ({local_commit})",
            "current_commit": local_commit,
            "latest_version": f"{latest_display} ({latest_sha})" if update_available else current_display,
            "latest_commit": latest_sha,
            "latest_date": latest_date,
            "latest_message": latest_msg,
            "changelog": changelog,
        }
    except Exception as e:
        return {"update_available": False, "error": str(e)}


@router.post("/system/update")
async def apply_update(current_user: User = Depends(require_admin)):
    """git pull + 의존성 업데이트 + DB 마이그레이션 실행."""

    # git 사용 가능 여부 확인
    try:
        subprocess.run(["git", "--version"], capture_output=True, check=True, timeout=5)
    except Exception:
        raise HTTPException(status_code=400, detail="git이 설치되어 있지 않습니다.")

    # git 저장소 여부 확인
    git_dir = ROOT_DIR / ".git"
    if not git_dir.exists():
        raise HTTPException(status_code=400, detail="git 저장소가 아닙니다. GitHub에서 다시 다운로드하세요.")

    results = []

    def run(cmd, cwd=None):
        r = subprocess.run(cmd, cwd=cwd or ROOT_DIR, capture_output=True, text=True, timeout=120)
        return {"cmd": " ".join(cmd), "ok": r.returncode == 0, "out": r.stdout.strip(), "err": r.stderr.strip()}

    # 0. Mark safe directory (Windows: install runs as admin, app as normal user)
    run(["git", "config", "--global", "--add", "safe.directory", str(ROOT_DIR)])

    # 1. git pull
    results.append(run(["git", "pull", "origin", "HEAD"]))
    if not results[-1]["ok"]:
        raise HTTPException(status_code=500, detail=f"git pull 실패: {results[-1]['err']}")

    # 2. Python 의존성 업데이트
    backend_dir = ROOT_DIR / "backend"
    venv_pip = backend_dir / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / "pip"
    results.append(run([str(venv_pip), "install", "-r", "requirements.txt", "--quiet"], cwd=backend_dir))

    # 3. DB 마이그레이션
    venv_alembic = backend_dir / ".venv" / ("Scripts" if sys.platform == "win32" else "bin") / "alembic"
    results.append(run([str(venv_alembic), "upgrade", "head"], cwd=backend_dir))

    # 4. 프론트엔드 패키지 업데이트
    frontend_dir = ROOT_DIR / "frontend"
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    results.append(run([npm_cmd, "install", "--silent"], cwd=frontend_dir))

    errors = [r for r in results if not r["ok"]]

    return {
        "success": len(errors) == 0,
        "restart_required": True,
        "results": results,
        "message": "업데이트 완료. 앱을 재시작해주세요." if not errors else f"일부 단계 실패: {errors[0]['err']}",
    }
