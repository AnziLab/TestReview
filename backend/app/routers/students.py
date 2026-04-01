import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import UPLOADS_DIR
from app.database import get_db
from app.models.models import Exam, Student, StudentPage
from app.schemas.schemas import StudentResponse, StudentDetailResponse

router = APIRouter(tags=["students"])


def _split_pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Split a PDF into a list of PNG image bytes (one per page)."""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="PyMuPDF is not installed. Install it with: pip install PyMuPDF",
        )
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []
    for page in doc:
        pix = page.get_pixmap(dpi=150)
        pages.append(pix.tobytes("png"))
    doc.close()
    return pages


@router.post("/exams/{exam_id}/students", response_model=StudentResponse)
async def upload_student(
    exam_id: str,
    file: UploadFile = File(...),
    name: str = Form(...),
    student_number: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a single student scan (single image file)."""
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

    now = datetime.utcnow()
    student = Student(
        id=student_id,
        exam_id=exam_id,
        name=name,
        student_number=student_number,
        scan_image_path=f"uploads/{filename}",
        created_at=now,
    )
    db.add(student)

    # Also create a StudentPage record for page 1
    page = StudentPage(
        id=str(uuid.uuid4()),
        student_id=student_id,
        page_number=1,
        image_path=f"uploads/{filename}",
        created_at=now,
    )
    db.add(page)

    await db.commit()
    await db.refresh(student)
    return student


@router.post("/exams/{exam_id}/students/batch", response_model=List[StudentResponse])
async def batch_upload_students(
    exam_id: str,
    files: List[UploadFile] = File(...),
    pages_per_student: int = Form(default=1),
    names: Optional[str] = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Batch upload student scans.

    Accepts:
    - A single PDF (split into pages automatically)
    - One or more image files (treated as individual pages in order)

    pages_per_student: how many consecutive pages belong to one student
        1 = single-sided (default)
        2 = double-sided (pages 1-2 = student 1, pages 3-4 = student 2, etc.)

    names: optional comma-separated list of student names.
        If omitted or shorter than the number of students, remaining students
        are named "학생 N".
    """
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    if pages_per_student < 1:
        raise HTTPException(status_code=400, detail="pages_per_student는 1 이상이어야 합니다.")

    # Parse optional names list
    name_list: list[str] = []
    if names:
        name_list = [n.strip() for n in names.split(",") if n.strip()]

    # Collect all page image bytes in order
    all_pages: list[bytes] = []

    for uploaded_file in files:
        content = await uploaded_file.read()
        fname = uploaded_file.filename or ""
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "bin"

        if ext == "pdf":
            split = _split_pdf_to_images(content)
            all_pages.extend(split)
        else:
            all_pages.append(content)

    if not all_pages:
        raise HTTPException(status_code=400, detail="업로드할 파일이 없습니다.")

    # Split pages into groups of pages_per_student
    now = datetime.utcnow()
    created_students: list[Student] = []
    student_index = 0

    for group_start in range(0, len(all_pages), pages_per_student):
        group = all_pages[group_start: group_start + pages_per_student]
        student_index += 1

        student_name = (
            name_list[student_index - 1]
            if student_index - 1 < len(name_list)
            else f"학생 {student_index}"
        )
        student_number = str(student_index)

        student_id = str(uuid.uuid4())

        # First page is also stored as scan_image_path for backwards compat
        first_page_filename = f"student_{student_id}_p1.png"
        first_page_path = UPLOADS_DIR / first_page_filename
        first_page_path.write_bytes(group[0])
        scan_image_path = f"uploads/{first_page_filename}"

        student = Student(
            id=student_id,
            exam_id=exam_id,
            name=student_name,
            student_number=student_number,
            scan_image_path=scan_image_path,
            created_at=now,
        )
        db.add(student)

        # Create StudentPage records for each page in the group
        for page_idx, page_bytes in enumerate(group, start=1):
            page_filename = f"student_{student_id}_p{page_idx}.png"
            page_path = UPLOADS_DIR / page_filename
            if page_idx > 1:
                # Page 1 already written above
                page_path.write_bytes(page_bytes)

            sp = StudentPage(
                id=str(uuid.uuid4()),
                student_id=student_id,
                page_number=page_idx,
                image_path=f"uploads/{page_filename}",
                created_at=now,
            )
            db.add(sp)

        created_students.append(student)

    await db.commit()
    for s in created_students:
        await db.refresh(s)

    return created_students


@router.get("/exams/{exam_id}/students", response_model=List[StudentResponse])
async def list_students(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Student)
        .where(Student.exam_id == exam_id)
        .options(selectinload(Student.pages))
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
        .options(selectinload(Student.answers), selectinload(Student.pages))
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
