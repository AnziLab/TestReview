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


def _settings_to_response(settings: Settings) -> SettingsResponse:
    return SettingsResponse(
        id=settings.id,
        llm_provider=settings.llm_provider,
        llm_api_key_masked=_mask_key(settings.llm_api_key),
        llm_model=settings.llm_model,
        ocr_provider=settings.ocr_provider,
        ocr_model=settings.ocr_model,
        clova_api_url=settings.clova_api_url,
        clova_secret_key_masked=_mask_key(settings.clova_secret_key),
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if settings is None:
        settings = Settings(id=str(uuid.uuid4()))
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return _settings_to_response(settings)


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
            ocr_provider=payload.ocr_provider or "gpt",
            ocr_model=payload.ocr_model,
            clova_api_url=payload.clova_api_url,
            clova_secret_key=payload.clova_secret_key,
            created_at=now,
            updated_at=now,
        )
        db.add(settings)
    else:
        settings.llm_provider = payload.llm_provider
        if payload.llm_api_key:
            settings.llm_api_key = payload.llm_api_key
        settings.llm_model = payload.llm_model
        if payload.ocr_provider is not None:
            settings.ocr_provider = payload.ocr_provider
        if payload.ocr_model is not None:
            settings.ocr_model = payload.ocr_model
        if payload.clova_api_url is not None:
            settings.clova_api_url = payload.clova_api_url
        if payload.clova_secret_key is not None:
            settings.clova_secret_key = payload.clova_secret_key
        settings.updated_at = now

    await db.commit()
    await db.refresh(settings)

    return _settings_to_response(settings)
