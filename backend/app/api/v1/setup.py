"""First-run setup endpoint."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.models.user import User
from app.security import hash_password

router = APIRouter(tags=["setup"])


@router.get("/setup/status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    """첫 실행 여부 확인. 유저가 0명이면 setup_required=true."""
    count = (await db.execute(select(User))).scalars().first()
    return {"setup_required": count is None}


class SetupRequest(BaseModel):
    username: str
    password: str


@router.post("/setup")
async def run_setup(body: SetupRequest, db: AsyncSession = Depends(get_db)):
    """최초 어드민 계정 생성. 이미 유저가 있으면 거절."""
    existing = (await db.execute(select(User))).scalars().first()
    if existing:
        raise HTTPException(status_code=403, detail="이미 설정이 완료되었습니다.")

    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="비밀번호는 4자 이상이어야 합니다.")

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    admin = User(
        username=body.username,
        email=f"{body.username}@local",
        password_hash=hash_password(body.password),
        full_name=body.username,
        role="admin",
        status="approved",
        approved_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(admin)
    await db.commit()
    return {"message": "설정 완료. 로그인 페이지로 이동하세요."}
