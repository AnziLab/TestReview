from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Exam
from app.models.grading import Grading
from app.models.user import User
from app.schemas.grading import GradingOut, GradingUpdate
from app.services.export_service import export_gradings_xlsx
from app.services.grading_service import run_grading

router = APIRouter(tags=["grading"])


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam


@router.post("/exams/{exam_id}/grade", status_code=status.HTTP_202_ACCEPTED)
async def start_grading(
    exam_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    background_tasks.add_task(run_grading, exam_id=exam_id, teacher_id=current_user.id)
    return {"message": "Grading started in background"}


@router.get("/exams/{exam_id}/gradings", response_model=list[GradingOut])
async def list_gradings(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)

    # Join Grading → Answer → Student → Class (exam_id filter)
    result = await db.execute(
        select(Grading)
        .join(Answer, Grading.answer_id == Answer.id)
        .join(Student, Answer.student_id == Student.id)
        .join(Class, Student.class_id == Class.id)
        .where(Class.exam_id == exam_id)
    )
    return result.scalars().all()


@router.put("/gradings/{grading_id}", response_model=GradingOut)
async def update_grading(
    grading_id: int,
    body: GradingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    grading = await db.get(Grading, grading_id)
    if grading is None:
        raise HTTPException(status_code=404, detail="Grading not found")

    # Ownership check
    answer = await db.get(Answer, grading.answer_id)
    student = await db.get(Student, answer.student_id)
    cls = await db.get(Class, student.class_id)
    exam = await db.get(Exam, cls.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your grading")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(grading, field, value)
    grading.graded_by = "manual"
    grading.graded_by_user_id = current_user.id

    await db.commit()
    await db.refresh(grading)
    return grading


@router.get("/exams/{exam_id}/gradings.xlsx")
async def download_gradings_xlsx(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)
    xlsx_bytes = await export_gradings_xlsx(db, exam_id)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="gradings_{exam_id}.xlsx"'},
    )
