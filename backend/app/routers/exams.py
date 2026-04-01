import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import UPLOADS_DIR
from app.database import get_db
from app.models.models import Exam, AnswerSheet
from app.schemas.schemas import (
    ExamCreate,
    ExamResponse,
    AnswerSheetResponse,
    DetectedRegion,
)
from app.services.image_processing import detect_cells

router = APIRouter(tags=["exams"])


@router.post("/exams", response_model=ExamResponse)
async def create_exam(payload: ExamCreate, db: AsyncSession = Depends(get_db)):
    now = datetime.utcnow()
    exam = Exam(
        id=str(uuid.uuid4()),
        name=payload.name,
        created_at=now,
        updated_at=now,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


@router.get("/exams", response_model=List[ExamResponse])
async def list_exams(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Exam).order_by(Exam.created_at.desc()))
    return result.scalars().all()


@router.get("/exams/{exam_id}", response_model=ExamResponse)
async def get_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")
    return exam


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")
    await db.delete(exam)
    await db.commit()
    return {"message": "시험이 삭제되었습니다."}


@router.post("/exams/{exam_id}/template", response_model=AnswerSheetResponse)
async def upload_template(
    exam_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    old_result = await db.execute(
        select(AnswerSheet).where(AnswerSheet.exam_id == exam_id)
    )
    old = old_result.scalar_one_or_none()
    if old:
        await db.delete(old)

    ext = file.filename.rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"template_{exam_id}.{ext}"
    filepath = UPLOADS_DIR / filename
    content = await file.read()
    filepath.write_bytes(content)

    sheet = AnswerSheet(
        id=str(uuid.uuid4()),
        exam_id=exam_id,
        image_path=f"uploads/{filename}",
        created_at=datetime.utcnow(),
    )
    db.add(sheet)
    await db.commit()
    await db.refresh(sheet)
    return sheet


@router.get("/exams/{exam_id}/template", response_model=AnswerSheetResponse)
async def get_template(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnswerSheet).where(AnswerSheet.exam_id == exam_id)
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        raise HTTPException(status_code=404, detail="템플릿이 없습니다.")
    return sheet


@router.post(
    "/exams/{exam_id}/detect-regions", response_model=List[DetectedRegion]
)
async def detect_regions_endpoint(
    exam_id: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AnswerSheet).where(AnswerSheet.exam_id == exam_id)
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        raise HTTPException(status_code=404, detail="템플릿이 없습니다.")

    from app.config import BASE_DIR
    full_path = str(BASE_DIR / sheet.image_path)

    try:
        cells = detect_cells(full_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"영역 감지 실패: {str(e)}")

    return [DetectedRegion(**c) for c in cells]
