import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import UPLOADS_DIR
from app.database import get_db
from app.models.models import Exam, Student
from app.schemas.schemas import StudentResponse, StudentDetailResponse

router = APIRouter(tags=["students"])


@router.post("/exams/{exam_id}/students", response_model=StudentResponse)
async def upload_student(
    exam_id: str,
    file: UploadFile = File(...),
    name: str = Form(...),
    student_number: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    student_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"student_{student_id}.{ext}"
    filepath = UPLOADS_DIR / filename
    content = await file.read()
    filepath.write_bytes(content)

    student = Student(
        id=student_id,
        exam_id=exam_id,
        name=name,
        student_number=student_number,
        scan_image_path=f"uploads/{filename}",
        created_at=datetime.utcnow(),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)
    return student


@router.get("/exams/{exam_id}/students", response_model=List[StudentResponse])
async def list_students(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Student)
        .where(Student.exam_id == exam_id)
        .order_by(Student.student_number)
    )
    return result.scalars().all()


@router.get(
    "/exams/{exam_id}/students/{student_id}",
    response_model=StudentDetailResponse,
)
async def get_student(
    exam_id: str, student_id: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Student)
        .where(Student.id == student_id, Student.exam_id == exam_id)
        .options(selectinload(Student.answers))
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    return student


@router.delete("/exams/{exam_id}/students/{student_id}")
async def delete_student(
    exam_id: str, student_id: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Student).where(Student.id == student_id, Student.exam_id == exam_id)
    )
    student = result.scalar_one_or_none()
    if not student:
        raise HTTPException(status_code=404, detail="학생을 찾을 수 없습니다.")
    await db.delete(student)
    await db.commit()
    return {"message": "학생이 삭제되었습니다."}
