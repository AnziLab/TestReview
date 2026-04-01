import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import AnswerSheet, Region
from app.schemas.schemas import RegionCreate, RegionUpdate, RegionResponse

router = APIRouter(tags=["regions"])


async def _get_answer_sheet(exam_id: str, db: AsyncSession) -> AnswerSheet:
    result = await db.execute(
        select(AnswerSheet).where(AnswerSheet.exam_id == exam_id)
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        raise HTTPException(
            status_code=404, detail="먼저 답안지 템플릿을 업로드해주세요."
        )
    return sheet


@router.post("/exams/{exam_id}/regions", response_model=List[RegionResponse])
async def save_regions(
    exam_id: str,
    regions: List[RegionCreate],
    db: AsyncSession = Depends(get_db),
):
    sheet = await _get_answer_sheet(exam_id, db)

    old_result = await db.execute(
        select(Region).where(Region.answer_sheet_id == sheet.id)
    )
    for old in old_result.scalars().all():
        await db.delete(old)

    now = datetime.utcnow()
    new_regions = []
    for r in regions:
        region = Region(
            id=str(uuid.uuid4()),
            answer_sheet_id=sheet.id,
            question_number=r.question_number,
            x=r.x,
            y=r.y,
            width=r.width,
            height=r.height,
            model_answer=r.model_answer,
            rubric=r.rubric,
            max_score=r.max_score,
            created_at=now,
        )
        db.add(region)
        new_regions.append(region)

    await db.commit()
    for r in new_regions:
        await db.refresh(r)
    return new_regions


@router.get("/exams/{exam_id}/regions", response_model=List[RegionResponse])
async def list_regions(exam_id: str, db: AsyncSession = Depends(get_db)):
    sheet = await _get_answer_sheet(exam_id, db)
    result = await db.execute(
        select(Region)
        .where(Region.answer_sheet_id == sheet.id)
        .order_by(Region.question_number)
    )
    return result.scalars().all()


@router.put(
    "/exams/{exam_id}/regions/{region_id}", response_model=RegionResponse
)
async def update_region(
    exam_id: str,
    region_id: str,
    payload: RegionUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="영역을 찾을 수 없습니다.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(region, field, value)

    await db.commit()
    await db.refresh(region)
    return region


@router.delete("/exams/{exam_id}/regions/{region_id}")
async def delete_region(
    exam_id: str, region_id: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise HTTPException(status_code=404, detail="영역을 찾을 수 없습니다.")
    await db.delete(region)
    await db.commit()
    return {"message": "영역이 삭제되었습니다."}
