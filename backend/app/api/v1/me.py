from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.gemini.client import DEFAULT_MODEL, choose_default_model, list_gemini_models
from app.gemini.prompts import PROMPTS, validate_template
from app.models.user import User
from app.schemas.auth import PasswordChangeRequest, UserOut
from app.security import decrypt_api_key, encrypt_api_key, hash_password, mask_api_key, verify_password

router = APIRouter(prefix="/me", tags=["me"])


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    school: Optional[str] = None
    email: Optional[EmailStr] = None
    grading_extra_instructions: Optional[str] = None
    clustering_extra_instructions: Optional[str] = None


class ApiKeyRequest(BaseModel):
    api_key: str


class GeminiModelRequest(BaseModel):
    model: str


@router.get("/api-key")
async def get_api_key(current_user: User = Depends(get_current_user)):
    has_key = current_user.gemini_api_key_encrypted is not None
    return {
        "has_api_key": has_key,
        "masked_key": "****" if has_key else None,
        "model": current_user.gemini_model or DEFAULT_MODEL,
    }


@router.put("/api-key")
async def set_api_key(
    body: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    api_key = body.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API 키를 입력하세요.")
    encrypted_key = encrypt_api_key(api_key)
    try:
        models = await list_gemini_models(encrypted_key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    available = {model["id"] for model in models}
    current_user.gemini_api_key_encrypted = encrypted_key
    if current_user.gemini_model not in available:
        current_user.gemini_model = choose_default_model(models)
    db.add(current_user)
    await db.commit()
    return {
        "message": "API key saved",
        "masked": mask_api_key(api_key),
        "model": current_user.gemini_model,
    }


@router.delete("/api-key")
async def delete_api_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.gemini_api_key_encrypted = None
    current_user.gemini_model = None
    db.add(current_user)
    await db.commit()
    return {"message": "API key deleted"}


@router.post("/api-key/test")
async def test_api_key(current_user: User = Depends(get_current_user)):
    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")
    try:
        models = await list_gemini_models(current_user.gemini_api_key_encrypted)
    except Exception as exc:
        return {"success": False, "message": str(exc)}
    if not models:
        return {"success": False, "message": "사용 가능한 Gemini 텍스트 생성 모델이 없습니다."}
    return {
        "success": True,
        "message": f"API 키가 유효합니다. 사용 가능한 모델 {len(models)}개를 확인했습니다.",
        "models": models,
    }


@router.get("/gemini-models")
async def get_gemini_models(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")
    try:
        models = await list_gemini_models(current_user.gemini_api_key_encrypted)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    available = {model["id"] for model in models}
    selected = current_user.gemini_model
    if selected not in available:
        selected = choose_default_model(models)
        current_user.gemini_model = selected
        db.add(current_user)
        await db.commit()
    return {"models": models, "selected": selected}


@router.put("/gemini-model")
async def set_gemini_model(
    body: GeminiModelRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="No API key configured")
    try:
        models = await list_gemini_models(current_user.gemini_api_key_encrypted)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if body.model not in {model["id"] for model in models}:
        raise HTTPException(status_code=400, detail="이 API 키로 사용할 수 없는 모델입니다.")
    current_user.gemini_model = body.model
    db.add(current_user)
    await db.commit()
    return {"success": True, "model": body.model}


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


# ───────────────── 프롬프트 오버라이드 ─────────────────


class PromptUpdate(BaseModel):
    template: str


@router.get("/prompts")
async def list_prompts(current_user: User = Depends(get_current_user)):
    """6개 프롬프트의 메타정보 + 사용자별 현재 오버라이드 반환."""
    return {
        "prompts": [
            {
                "key": pdef.key,
                "label": pdef.label,
                "description": pdef.description,
                "default": pdef.default,
                "current": getattr(current_user, pdef.override_field, None),
                "placeholders": list(pdef.placeholders),
            }
            for pdef in PROMPTS.values()
        ]
    }


@router.put("/prompts/{key}")
async def set_prompt_override(
    key: str,
    body: PromptUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """프롬프트 오버라이드 저장. 검증 실패 시 400."""
    pdef = PROMPTS.get(key)
    if not pdef:
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")

    error = validate_template(key, body.template)
    if error:
        raise HTTPException(status_code=400, detail=error)

    setattr(current_user, pdef.override_field, body.template)
    db.add(current_user)
    await db.commit()
    return {"success": True}


@router.delete("/prompts/{key}")
async def clear_prompt_override(
    key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """오버라이드 삭제 → 기본 프롬프트 사용으로 복원."""
    pdef = PROMPTS.get(key)
    if not pdef:
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")

    setattr(current_user, pdef.override_field, None)
    db.add(current_user)
    await db.commit()
    return {"success": True}
