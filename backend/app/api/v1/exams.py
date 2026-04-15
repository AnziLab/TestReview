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
from app.services.exam_paper_service import run_exam_paper_extraction
from app.services.rubric_generate_service import run_rubric_generation
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


@router.get("/{exam_id}/rubric-extraction")
async def rubric_extraction_status(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id).order_by(Question.order_index)
    )
    questions = questions_result.scalars().all()

    # 프론트가 기대하는 status: pending | processing | done | failed
    if exam.status == "rubric_ready":
        ext_status = "done"
    elif exam.status == "rubric_failed":
        ext_status = "failed"
    elif exam.rubric_source_filename and exam.status == "draft":
        ext_status = "processing"
    else:
        ext_status = "pending"

    return {
        "exam_id": exam_id,
        "status": ext_status,
        "rubric_source_filename": exam.rubric_source_filename,
        "questions_count": len(questions),
        "questions": [
            {
                "id": q.id,
                "number": q.number,
                "question_text": q.question_text,
                "max_score": float(q.max_score),
                "model_answer": q.model_answer,
                "rubric_json": q.rubric_json,
                "rubric_version": q.rubric_version,
            }
            for q in questions
        ] if ext_status == "done" else [],
    }


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam


@router.post("/{exam_id}/exam-paper")
async def upload_exam_paper(
    exam_id: int,
    background_tasks: BackgroundTasks,
    question_from: int,
    question_to: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload exam paper PDF and extract question texts for a range."""
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    if question_from < 1 or question_to < question_from:
        raise HTTPException(status_code=400, detail="Invalid question range")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_RUBRIC_TYPES:
        raise HTTPException(status_code=400, detail="PDF 파일만 지원합니다")

    data = await file.read()
    ext = Path(file.filename or "file.pdf").suffix
    rel_path = f"exam_papers/{exam_id}/{uuid.uuid4()}{ext}"
    saved_path = await storage.save(data, rel_path)

    exam.exam_paper_filename = file.filename
    exam.exam_paper_path = saved_path
    exam.exam_paper_status = "processing"
    await db.commit()

    background_tasks.add_task(
        run_exam_paper_extraction,
        exam_id=exam_id,
        file_path=saved_path,
        teacher_id=current_user.id,
        question_from=question_from,
        question_to=question_to,
    )

    return {"message": "시험지 업로드 완료. 문항 텍스트 추출 시작.", "filename": file.filename}


@router.get("/{exam_id}/exam-paper-status")
async def exam_paper_status(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    return {
        "status": exam.exam_paper_status or "none",
        "filename": exam.exam_paper_filename,
    }


@router.post("/{exam_id}/generate-rubric")
async def generate_rubric_from_paper(
    exam_id: int,
    background_tasks: BackgroundTasks,
    question_from: int,
    question_to: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload exam paper and generate draft rubric (model answers + criteria)."""
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    if question_from < 1 or question_to < question_from:
        raise HTTPException(status_code=400, detail="Invalid question range")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_RUBRIC_TYPES:
        raise HTTPException(status_code=400, detail="PDF 파일만 지원합니다")

    data = await file.read()
    ext = Path(file.filename or "file.pdf").suffix
    rel_path = f"exam_papers/{exam_id}/{uuid.uuid4()}{ext}"
    saved_path = await storage.save(data, rel_path)

    exam.exam_paper_filename = file.filename
    exam.exam_paper_path = saved_path
    exam.status = "draft"
    await db.commit()

    background_tasks.add_task(
        run_rubric_generation,
        exam_id=exam_id,
        file_path=saved_path,
        teacher_id=current_user.id,
        question_from=question_from,
        question_to=question_to,
    )

    return {"message": "시험지 업로드 완료. 채점기준 초안 생성 시작.", "filename": file.filename}
