import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import AnswerSheet, Region
from app.schemas.schemas import RegionCreate, RegionUpdate, RegionResponse

router = APIRouter(tags=["regions"])


async def _get_answer_sheet(
    exam_id: str,
    db: AsyncSession,
    page_number: int = 1,
) -> AnswerSheet:
    result = await db.execute(
        select(AnswerSheet).where(
            AnswerSheet.exam_id == exam_id,
            AnswerSheet.page_number == page_number,
        )
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        detail = (
            f"페이지 {page_number}의 답안지 템플릿이 없습니다. "
            "먼저 답안지 템플릿을 업로드해주세요."
        )
        raise HTTPException(status_code=404, detail=detail)
    return sheet


@router.post("/exams/{exam_id}/regions", response_model=List[RegionResponse])
async def save_regions(
    exam_id: str,
    regions: List[RegionCreate],
    page_number: Optional[int] = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    sheet = await _get_answer_sheet(exam_id, db, page_number=page_number)

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
async def list_regions(
    exam_id: str,
    page_number: Optional[int] = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
):
    """
    List regions for an exam.
    If page_number is specified, returns only regions for that page.
    If omitted, returns regions across all pages.
    """
    if page_number is not None:
        sheet = await _get_answer_sheet(exam_id, db, page_number=page_number)
        result = await db.execute(
            select(Region)
            .where(Region.answer_sheet_id == sheet.id)
            .order_by(Region.question_number)
        )
    else:
        # All pages: join through AnswerSheet
        result = await db.execute(
            select(Region)
            .join(AnswerSheet, Region.answer_sheet_id == AnswerSheet.id)
            .where(AnswerSheet.exam_id == exam_id)
            .order_by(AnswerSheet.page_number, Region.question_number)
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
