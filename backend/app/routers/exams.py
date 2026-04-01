import io
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
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


@router.post("/exams/{exam_id}/template", response_model=List[AnswerSheetResponse])
async def upload_template(
    exam_id: str,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload one or more template pages for an exam.
    Accepts:
    - A single PDF file (split into pages automatically)
    - One or more image files (each becomes a page in order)
    Replaces any previously uploaded template pages.
    """
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="시험을 찾을 수 없습니다.")

    # Delete existing answer sheets for this exam
    old_result = await db.execute(
        select(AnswerSheet).where(AnswerSheet.exam_id == exam_id)
    )
    for old in old_result.scalars().all():
        await db.delete(old)
    await db.flush()

    page_images: list[tuple[str, bytes]] = []  # (original_filename_hint, image_bytes)

    for uploaded_file in files:
        content = await uploaded_file.read()
        fname = uploaded_file.filename or ""
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "png"

        if ext == "pdf":
            # Split PDF into individual page images
            split_pages = _split_pdf_to_images(content)
            for i, page_bytes in enumerate(split_pages):
                page_images.append((f"pdf_page_{i + 1}", page_bytes))
        else:
            page_images.append((fname, content))

    if not page_images:
        raise HTTPException(status_code=400, detail="업로드할 파일이 없습니다.")

    now = datetime.utcnow()
    created_sheets: list[AnswerSheet] = []

    for page_number, (fname_hint, image_bytes) in enumerate(page_images, start=1):
        filename = f"template_{exam_id}_p{page_number}.png"
        filepath = UPLOADS_DIR / filename
        filepath.write_bytes(image_bytes)

        sheet = AnswerSheet(
            id=str(uuid.uuid4()),
            exam_id=exam_id,
            image_path=f"uploads/{filename}",
            page_number=page_number,
            created_at=now,
        )
        db.add(sheet)
        created_sheets.append(sheet)

    await db.commit()
    for sheet in created_sheets:
        await db.refresh(sheet)

    return created_sheets


@router.get("/exams/{exam_id}/template", response_model=List[AnswerSheetResponse])
async def get_template(exam_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnswerSheet)
        .where(AnswerSheet.exam_id == exam_id)
        .order_by(AnswerSheet.page_number)
    )
    sheets = result.scalars().all()
    if not sheets:
        raise HTTPException(status_code=404, detail="템플릿이 없습니다.")
    return sheets


@router.post(
    "/exams/{exam_id}/detect-regions", response_model=List[DetectedRegion]
)
async def detect_regions_endpoint(
    exam_id: str,
    page_number: Optional[int] = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AnswerSheet).where(
            AnswerSheet.exam_id == exam_id,
            AnswerSheet.page_number == page_number,
        )
    )
    sheet = result.scalar_one_or_none()
    if not sheet:
        raise HTTPException(
            status_code=404,
            detail=f"페이지 {page_number}의 템플릿이 없습니다.",
        )

    from app.config import BASE_DIR
    full_path = str(BASE_DIR / sheet.image_path)

    try:
        cells = detect_cells(full_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"영역 감지 실패: {str(e)}")

    return [DetectedRegion(**c) for c in cells]
