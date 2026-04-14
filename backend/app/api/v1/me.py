from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.gemini.client import ping_gemini
from app.models.user import User
from app.schemas.auth import PasswordChangeRequest, UserOut
from app.security import decrypt_api_key, encrypt_api_key, hash_password, mask_api_key, verify_password

router = APIRouter(prefix="/me", tags=["me"])


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    school: Optional[str] = None
    email: Optional[EmailStr] = None


class ApiKeyRequest(BaseModel):
    api_key: str


@router.get("/api-key")
async def get_api_key(current_user: User = Depends(get_current_user)):
    has_key = current_user.gemini_api_key_encrypted is not None
    return {"has_api_key": has_key, "masked_key": "****" if has_key else None}


@router.put("/api-key")
async def set_api_key(
    body: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.gemini_api_key_encrypted = encrypt_api_key(body.api_key)
    db.add(current_user)
    await db.commit()
    return {"message": "API key saved", "masked": mask_api_key(body.api_key)}


@router.delete("/api-key")
async def delete_api_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.gemini_api_key_encrypted = None
    db.add(current_user)
    await db.commit()
    return {"message": "API key deleted"}


@router.post("/api-key/test")
async def test_api_key(current_user: User = Depends(get_current_user)):
    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")
    ok = await ping_gemini(current_user.gemini_api_key_encrypted)
    if not ok:
        return {"success": False, "message": "API 키가 유효하지 않습니다."}
    return {"success": True, "message": "API 키가 유효합니다."}


@router.put("/password")
async def change_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = hash_password(body.new_password)
    db.add(current_user)
    await db.commit()
    return {"message": "Password updated"}


@router.put("/profile", response_model=UserOut)
async def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user
