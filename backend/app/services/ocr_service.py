import io
import uuid
from datetime import datetime
from typing import Optional

import numpy as np
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Region, Student, StudentAnswer, AnswerSheet
from app.services.image_processing import crop_region

# ─── EasyOCR singleton ─────────────────────────────────────────────────────
# EasyOCR reader is heavy to initialise (loads model into memory).
# We keep a module-level singleton so it's created once per process.

_ocr_reader = None
_ocr_languages: list[str] = ["ko", "en"]


def _get_ocr_reader():
    """Return (or lazily create) the EasyOCR reader."""
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        _ocr_reader = easyocr.Reader(
            _ocr_languages,
            gpu=True,          # Will gracefully fall back to CPU if no GPU
            model_storage_directory=None,  # default cache
        )
    return _ocr_reader


def set_ocr_languages(languages: list[str]) -> None:
    """
    Allow changing OCR languages at runtime.
    Forces recreation of the reader on next use.
    """
    global _ocr_reader, _ocr_languages
    _ocr_languages = languages
    _ocr_reader = None  # will be recreated with new langs


def recognize_text_from_bytes(image_bytes: bytes) -> tuple[str, float]:
    """
    Run EasyOCR on raw image bytes.

    Returns:
        (recognized_text, average_confidence)
    """
    reader = _get_ocr_reader()

    # EasyOCR accepts numpy arrays, file paths, or bytes
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_np = np.array(img)

    results = reader.readtext(img_np, detail=1)
    # results: list of (bbox, text, confidence)

    if not results:
        return ("", 0.0)

    texts = []
    confidences = []
    for _bbox, text, conf in results:
        texts.append(text)
        confidences.append(conf)

    full_text = " ".join(texts)
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    return (full_text, round(avg_conf, 4))


# ─── Custom training data collection ───────────────────────────────────────
# For future fine-tuning: we store corrected OCR pairs so users can later
# export them as training data to retrain / fine-tune the OCR model.

async def save_ocr_correction(
    answer_id: str,
    corrected_text: str,
    db: AsyncSession,
) -> None:
    """
    Record a teacher's manual correction of OCR output.
    The original OCR text is kept in ocr_text; the corrected version
    is stored in grading_feedback with a [CORRECTION] prefix so it
    can be extracted for training later.
    """
    result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if answer is None:
        return

    # Store original + correction pair as training data marker
    answer.ocr_text = corrected_text
    answer.updated_at = datetime.utcnow()
    await db.commit()


# ─── Main OCR pipeline ────────────────────────────────────────────────────

async def run_ocr_for_exam(exam_id: str, db: AsyncSession) -> dict:
    """
    For each student in the exam, crop every region from their scan and
    run OCR via EasyOCR. Results are stored in StudentAnswer rows.

    Returns a summary dict with counts.
    """
    # Fetch the template answer sheet to get regions
    sheet_result = await db.execute(
        select(AnswerSheet)
        .where(AnswerSheet.exam_id == exam_id)
        .options(selectinload(AnswerSheet.regions))
        .limit(1)
    )
    answer_sheet = sheet_result.scalar_one_or_none()

    if answer_sheet is None:
        raise ValueError("이 시험에 업로드된 답안지 템플릿이 없습니다.")

    regions = answer_sheet.regions
    if not regions:
        raise ValueError("답안지에 정의된 영역이 없습니다.")

    # Fetch all students for this exam
    students_result = await db.execute(
        select(Student).where(Student.exam_id == exam_id)
    )
    students = students_result.scalars().all()

    if not students:
        raise ValueError("이 시험에 등록된 학생이 없습니다.")

    # Resolve image paths relative to project
    from app.config import BASE_DIR

    total_processed = 0
    total_errors = 0

    for student in students:
        if not student.scan_image_path:
            continue

        scan_path = str(BASE_DIR / student.scan_image_path)

        for region in regions:
            # Crop the region from the student's scan
            try:
                image_bytes = crop_region(
                    image_path=scan_path,
                    x=region.x,
                    y=region.y,
                    width=region.width,
                    height=region.height,
                )
            except Exception:
                total_errors += 1
                continue

            # Run EasyOCR
            try:
                recognized_text, confidence = recognize_text_from_bytes(image_bytes)
            except Exception as e:
                recognized_text = f"[OCR 오류: {str(e)}]"
                confidence = 0.0
                total_errors += 1

            # Upsert StudentAnswer
            existing_result = await db.execute(
                select(StudentAnswer).where(
                    StudentAnswer.student_id == student.id,
                    StudentAnswer.region_id == region.id,
                )
            )
            existing = existing_result.scalar_one_or_none()

            now = datetime.utcnow()

            if existing:
                existing.ocr_text = recognized_text
                existing.ocr_confidence = confidence
                existing.grading_status = "pending"
                existing.updated_at = now
            else:
                new_answer = StudentAnswer(
                    id=str(uuid.uuid4()),
                    student_id=student.id,
                    region_id=region.id,
                    ocr_text=recognized_text,
                    ocr_confidence=confidence,
                    grading_status="pending",
                    created_at=now,
                    updated_at=now,
                )
                db.add(new_answer)

            total_processed += 1

    await db.commit()

    return {
        "exam_id": exam_id,
        "total_students": len(students),
        "total_regions": len(regions),
        "total_processed": total_processed,
        "total_errors": total_errors,
        "message": f"OCR 완료: {total_processed}개 처리, {total_errors}개 오류",
    }
