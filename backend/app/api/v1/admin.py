from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db, require_admin
from app.models.user import User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        school=user.school,
        role=user.role,
        status=user.status,
        has_api_key=bool(user.gemini_api_key_encrypted),
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/users", response_model=list[UserOut])
async def list_users(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    query = select(User)
    if status:
        query = query.where(User.status == status)
    result = await db.execute(query)
    return [_user_to_out(u) for u in result.scalars().all()]


@router.post("/users/{user_id}/approve", response_model=UserOut)
async def approve_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "approved"
    user.approved_by = admin.id
    user.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _user_to_out(user)


@router.post("/users/{user_id}/reject", response_model=UserOut)
async def reject_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "rejected"
    user.approved_by = admin.id
    user.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _user_to_out(user)


@router.post("/users/{user_id}/disable", response_model=UserOut)
async def disable_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "rejected"  # reuse rejected status as disabled
    await db.commit()
    await db.refresh(user)
    return _user_to_out(user)
