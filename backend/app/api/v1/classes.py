import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.class_ import Class, Student
from app.models.exam import Exam
from app.models.user import User
from app.schemas.class_ import ClassOut, OcrStatusOut
from app.services.ocr_service import run_ocr
from app.storage.local import storage

router = APIRouter(tags=["classes"])


async def _class_to_out(cls: Class, db: AsyncSession):
    count_result = await db.execute(
        select(func.count()).select_from(Student).where(Student.class_id == cls.id)
    )
    student_count = count_result.scalar_one()
    return ClassOut(
        id=cls.id,
        exam_id=cls.exam_id,
        name=cls.name,
        scan_mode=cls.scan_mode,
        source_pdf_filename=cls.source_pdf_filename,
        ocr_status=cls.ocr_status,
        ocr_error=cls.ocr_error,
        student_count=student_count,
        created_at=cls.created_at,
        updated_at=cls.updated_at,
    )


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam


async def _get_class_owned(class_id: int, teacher_id: int, db: AsyncSession) -> Class:
    cls = await db.get(Class, class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    exam = await db.get(Exam, cls.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your class")
    return cls


@router.get("/classes/{class_id}", response_model=ClassOut)
async def get_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cls = await _get_class_owned(class_id, current_user.id, db)
    return await _class_to_out(cls, db)


@router.get("/exams/{exam_id}/classes", response_model=list[ClassOut])
async def list_classes(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)
    result = await db.execute(select(Class).where(Class.exam_id == exam_id))
    classes = result.scalars().all()
    return [await _class_to_out(cls, db) for cls in classes]


@router.post("/exams/{exam_id}/classes", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
async def create_class(
    exam_id: int,
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    scan_mode: str = Form("single"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    if scan_mode not in ("single", "double"):
        raise HTTPException(status_code=400, detail="scan_mode must be 'single' or 'double'")

    data = await file.read()
    ext = Path(file.filename or "answers.pdf").suffix
    rel_path = f"classes/{exam_id}/{uuid.uuid4()}{ext}"
    saved_path = await storage.save(data, rel_path)

    # PDF 페이지 수 미리 계산
    import fitz as _fitz, io as _io
    try:
        _doc = _fitz.open(stream=_io.BytesIO(data), filetype="pdf")
        pdf_pages = len(_doc)
        _doc.close()
    except Exception:
        pdf_pages = None

    cls = Class(
        exam_id=exam_id,
        name=name,
        scan_mode=scan_mode,
        source_pdf_filename=file.filename,
        source_pdf_path=saved_path,
        source_pdf_pages=pdf_pages,
        ocr_status="pending",
        students_processed=0,
    )
    db.add(cls)
    await db.commit()
    await db.refresh(cls)

    background_tasks.add_task(run_ocr, class_id=cls.id, teacher_id=current_user.id)

    return await _class_to_out(cls, db)


@router.get("/classes/{class_id}/ocr-status", response_model=OcrStatusOut)
async def ocr_status(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cls = await _get_class_owned(class_id, current_user.id, db)
    count_result = await db.execute(
        select(func.count()).select_from(Student).where(Student.class_id == class_id)
    )
    students_count = count_result.scalar_one()
    pages = cls.source_pdf_pages or 0
    pages_per_student = 2 if cls.scan_mode == "double" else 1
    total_estimated = pages // pages_per_student if pages else None

    return {
        "id": cls.id,
        "ocr_status": cls.ocr_status,
        "ocr_error": cls.ocr_error,
        "students_count": students_count,
        "students_processed": cls.students_processed,
        "total_estimated": total_estimated,
    }


@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_class(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cls = await _get_class_owned(class_id, current_user.id, db)
    # Delete stored PDF
    if cls.source_pdf_path:
        await storage.delete(cls.source_pdf_path)
    await db.delete(cls)
    await db.commit()


@router.post("/classes/{class_id}/reprocess")
async def reprocess_class(
    class_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cls = await _get_class_owned(class_id, current_user.id, db)
    if not cls.source_pdf_path:
        raise HTTPException(status_code=400, detail="No PDF uploaded for this class")
    cls.ocr_status = "pending"
    cls.ocr_error = None
    await db.commit()
    background_tasks.add_task(run_ocr, class_id=class_id, teacher_id=current_user.id)
    return {"message": "OCR reprocessing started"}
