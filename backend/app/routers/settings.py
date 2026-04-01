import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Settings
from app.schemas.schemas import SettingsUpdate, SettingsResponse

router = APIRouter(tags=["settings"])


def _mask_key(key: str | None) -> str | None:
    if not key:
        return None
    if len(key) <= 8:
        return "****"
    return key[:4] + "..." + key[-4:]


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = Settings(id=str(uuid.uuid4()))
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return SettingsResponse(
        id=settings.id,
        llm_provider=settings.llm_provider,
        llm_api_key_masked=_mask_key(settings.llm_api_key),
        llm_model=settings.llm_model,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    now = datetime.utcnow()

    if settings is None:
        settings = Settings(
            id=str(uuid.uuid4()),
            llm_provider=payload.llm_provider,
            llm_api_key=payload.llm_api_key,
            llm_model=payload.llm_model,
            created_at=now,
            updated_at=now,
        )
        db.add(settings)
    else:
        settings.llm_provider = payload.llm_provider
        if payload.llm_api_key:
            settings.llm_api_key = payload.llm_api_key
        settings.llm_model = payload.llm_model
        settings.updated_at = now

    await db.commit()
    await db.refresh(settings)

    return SettingsResponse(
        id=settings.id,
        llm_provider=settings.llm_provider,
        llm_api_key_masked=_mask_key(settings.llm_api_key),
        llm_model=settings.llm_model,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )
