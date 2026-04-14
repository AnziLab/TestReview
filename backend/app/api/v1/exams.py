import os
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.deps import get_current_user, get_db
from app.models.exam import Exam, Question
from app.models.user import User
from app.schemas.exam import ExamCreate, ExamOut, ExamUpdate, RubricExtractionStatus
from app.services.rubric_extract_service import run_rubric_extraction
from app.storage.local import storage

router = APIRouter(prefix="/exams", tags=["exams"])

ALLOWED_RUBRIC_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
}


async def _exam_to_out(exam: Exam, db: AsyncSession) -> ExamOut:
    count_result = await db.execute(
        select(func.count()).select_from(Question).where(Question.exam_id == exam.id)
    )
    question_count = count_result.scalar_one()
    return ExamOut(
        id=exam.id,
        teacher_id=exam.teacher_id,
        title=exam.title,
        subject=exam.subject,
        grade=exam.grade,
        description=exam.description,
        rubric_source_filename=exam.rubric_source_filename,
        status=exam.status,
        question_count=question_count,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
    )


@router.get("", response_model=list[ExamOut])
async def list_exams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.teacher_id == current_user.id))
    exams = result.scalars().all()
    return [await _exam_to_out(exam, db) for exam in exams]


@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
async def create_exam(
    body: ExamCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = Exam(
        teacher_id=current_user.id,
        title=body.title,
        subject=body.subject,
        grade=body.grade,
        description=body.description,
        status="draft",
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return await _exam_to_out(exam, db)


@router.get("/{exam_id}", response_model=ExamOut)
async def get_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    return await _exam_to_out(exam, db)


@router.put("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: int,
    body: ExamUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(exam, field, value)
    await db.commit()
    await db.refresh(exam)
    return await _exam_to_out(exam, db)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    await db.delete(exam)
    await db.commit()


@router.post("/{exam_id}/rubric-file")
async def upload_rubric_file(
    exam_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_RUBRIC_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {content_type}. Allowed: PDF, PNG, JPEG, WebP",
        )

    data = await file.read()
    ext = Path(file.filename or "file.pdf").suffix
    rel_path = f"rubrics/{exam_id}/{uuid.uuid4()}{ext}"
    saved_path = await storage.save(data, rel_path)

    exam.rubric_source_filename = file.filename
    exam.rubric_source_path = saved_path
    exam.status = "draft"
    await db.commit()

    background_tasks.add_task(
        run_rubric_extraction,
        exam_id=exam_id,
        file_path=saved_path,
        teacher_id=current_user.id,
    )

    return {
        "message": "Rubric file uploaded. Extraction started.",
        "filename": file.filename,
    }


@router.get("/{exam_id}/rubric-extraction", response_model=RubricExtractionStatus)
async def rubric_extraction_status(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    count_result = await db.execute(
        select(func.count()).select_from(Question).where(Question.exam_id == exam_id)
    )
    questions_count = count_result.scalar_one()
    return RubricExtractionStatus(
        exam_id=exam_id,
        status=exam.status,
        rubric_source_filename=exam.rubric_source_filename,
        questions_count=questions_count,
    )


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam
