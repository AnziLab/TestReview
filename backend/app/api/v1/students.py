from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Exam
from app.models.user import User
from app.schemas.answer import AnswerOut, AnswerUpdate
from app.schemas.class_ import StudentOut, StudentUpdate
from app.services.export_service import export_answers_xlsx

router = APIRouter(tags=["students"])


async def _get_class_owned(class_id: int, teacher_id: int, db: AsyncSession) -> Class:
    cls = await db.get(Class, class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    exam = await db.get(Exam, cls.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your class")
    return cls


async def _get_student_owned(student_id: int, teacher_id: int, db: AsyncSession) -> Student:
    student = await db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    cls = await db.get(Class, student.class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    exam = await db.get(Exam, cls.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your student")
    return student


@router.get("/students/{student_id}/answers", response_model=list[AnswerOut])
async def get_student_answers(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_student_owned(student_id, current_user.id, db)
    result = await db.execute(select(Answer).where(Answer.student_id == student_id))
    return result.scalars().all()


@router.get("/classes/{class_id}/students", response_model=list[StudentOut])
async def list_students(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_class_owned(class_id, current_user.id, db)
    result = await db.execute(select(Student).where(Student.class_id == class_id))
    return result.scalars().all()


@router.put("/students/{student_id}", response_model=StudentOut)
async def update_student(
    student_id: int,
    body: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_student_owned(student_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(student, field, value)
    await db.commit()
    await db.refresh(student)
    return student


@router.put("/answers/{answer_id}", response_model=AnswerOut)
async def update_answer(
    answer_id: int,
    body: AnswerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    answer = await db.get(Answer, answer_id)
    if answer is None:
        raise HTTPException(status_code=404, detail="Answer not found")
    # ownership check via student → class → exam
    student = await db.get(Student, answer.student_id)
    cls = await db.get(Class, student.class_id)
    exam = await db.get(Exam, cls.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your answer")

    answer.answer_text = body.answer_text
    await db.commit()
    await db.refresh(answer)
    return answer


@router.get("/exams/{exam_id}/answers.xlsx")
async def download_answers_xlsx(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your exam")

    xlsx_bytes = await export_answers_xlsx(db, exam_id)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="answers_{exam_id}.xlsx"'},
    )
