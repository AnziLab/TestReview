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


def _interleave_pdfs(front_bytes: bytes, back_bytes: bytes) -> tuple[bytes, int]:
    """앞면 PDF와 뒷면 PDF를 [앞0, 뒤0, 앞1, 뒤1, ...] 순으로 한 PDF에 합친다.

    같은 N번째 페이지가 동일 학생의 앞/뒷면이라고 가정.
    페이지 수가 다르면 400.
    """
    import io
    import fitz
    front = fitz.open(stream=io.BytesIO(front_bytes), filetype="pdf")
    back = fitz.open(stream=io.BytesIO(back_bytes), filetype="pdf")
    try:
        if len(front) != len(back):
            raise HTTPException(
                status_code=400,
                detail=f"앞면 PDF는 {len(front)}장, 뒷면 PDF는 {len(back)}장입니다. 두 PDF의 페이지 수가 같아야 합니다."
            )
        merged = fitz.open()
        try:
            for i in range(len(front)):
                merged.insert_pdf(front, from_page=i, to_page=i)
                merged.insert_pdf(back, from_page=i, to_page=i)
            out = merged.tobytes()
            pages = len(merged)
        finally:
            merged.close()
    finally:
        front.close()
        back.close()
    return out, pages


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
    file: UploadFile | None = File(None),
    front_file: UploadFile | None = File(None),
    back_file: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    if scan_mode not in ("single", "double", "split"):
        raise HTTPException(status_code=400, detail="scan_mode must be 'single', 'double', or 'split'")

    if scan_mode == "split":
        if front_file is None or back_file is None:
            raise HTTPException(
                status_code=400,
                detail="앞뒤 분리 스캔은 앞면 PDF와 뒷면 PDF 두 개가 모두 필요합니다."
            )
        front_data = await front_file.read()
        back_data = await back_file.read()
        merged_data, pdf_pages = _interleave_pdfs(front_data, back_data)
        rel_path = f"classes/{exam_id}/{uuid.uuid4()}.pdf"
        saved_path = await storage.save(merged_data, rel_path)
        # 인터리브 결과는 양면 PDF와 동일한 구조 → DB에는 "double"로 저장
        stored_scan_mode = "double"
        front_name = Path(front_file.filename or "front").stem
        back_name = Path(back_file.filename or "back").stem
        stored_filename = f"{front_name}+{back_name}.pdf"
    else:
        if file is None:
            raise HTTPException(status_code=400, detail="PDF 파일이 필요합니다.")
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
        stored_scan_mode = scan_mode
        stored_filename = file.filename

    cls = Class(
        exam_id=exam_id,
        name=name,
        scan_mode=stored_scan_mode,
        source_pdf_filename=stored_filename,
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
