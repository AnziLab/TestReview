import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import AnswerSheet, Region, Settings, Student, StudentAnswer, StudentPage
from app.services.llm_client import GeminiClient


# ─── Base OCR Engine ─────────────────────────────────────────────────────────

class OCREngine:
    """Base OCR interface."""

    async def recognize(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        """
        Given a full page image and region coordinates, return text for each region.

        Args:
            image_bytes: Raw bytes of the full page image (PNG/JPEG).
            regions: List of dicts with keys:
                        id (str), question_number (str),
                        x, y, width, height (floats, 0.0–1.0 relative to image)

        Returns:
            List of dicts: {region_id, text, confidence}
        """
        raise NotImplementedError


# ─── Gemini OCR Engine ───────────────────────────────────────────────────────

class GeminiOCREngine(OCREngine):
    """Uses Google Gemini multimodal API for OCR (one API call per page, all regions at once)."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self._client = GeminiClient(api_key=api_key, model=model)

    async def recognize(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        return await self._client.recognize_handwriting(image_bytes, regions)


# ─── OCR correction helper ───────────────────────────────────────────────────

async def save_ocr_correction(
    answer_id: str,
    corrected_text: str,
    db: AsyncSession,
) -> None:
    """
    Record a teacher's manual correction of OCR output.
    The corrected text replaces the stored ocr_text.
    """
    result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if answer is None:
        return

    answer.ocr_text = corrected_text
    answer.updated_at = datetime.utcnow()
    await db.commit()


# ─── Settings helper ─────────────────────────────────────────────────────────

async def _get_ocr_engine(db: AsyncSession) -> OCREngine:
    """Read settings and return the Gemini OCR engine."""
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if settings is None or not settings.gemini_api_key:
        raise ValueError("Gemini API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력해주세요.")

    return GeminiOCREngine(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model or "gemini-2.0-flash",
    )


# ─── Main OCR pipeline ────────────────────────────────────────────────────────

async def run_ocr_for_exam(exam_id: str, db: AsyncSession) -> dict:
    """
    For each student in the exam, run OCR on each page.
    Regions are matched to pages via AnswerSheet.page_number.
    One OCR API call is made per page per student.

    Returns a summary dict with counts.
    """
    from app.config import BASE_DIR

    # Determine OCR engine from settings
    engine = await _get_ocr_engine(db)

    # Fetch all answer sheets (pages) for this exam, each with their regions
    sheets_result = await db.execute(
        select(AnswerSheet)
        .where(AnswerSheet.exam_id == exam_id)
        .options(selectinload(AnswerSheet.regions))
        .order_by(AnswerSheet.page_number)
    )
    answer_sheets = sheets_result.scalars().all()

    if not answer_sheets:
        raise ValueError("이 시험에 업로드된 답안지 템플릿이 없습니다.")

    # Check that at least one sheet has regions
    all_regions = [r for sheet in answer_sheets for r in sheet.regions]
    if not all_regions:
        raise ValueError("답안지에 정의된 영역이 없습니다.")

    # Build a map: page_number -> (sheet, [regions])
    page_map: dict[int, tuple[AnswerSheet, list[Region]]] = {}
    for sheet in answer_sheets:
        if sheet.regions:
            page_map[sheet.page_number] = (sheet, sheet.regions)

    # Fetch all students for this exam with their pages
    students_result = await db.execute(
        select(Student)
        .where(Student.exam_id == exam_id)
        .options(selectinload(Student.pages))
    )
    students = students_result.scalars().all()

    if not students:
        raise ValueError("이 시험에 등록된 학생이 없습니다.")

    total_processed = 0
    total_errors = 0
    now = datetime.utcnow()

    for student in students:
        # Build page_number -> image_path map for this student
        student_page_map: dict[int, str] = {}

        if student.pages:
            for sp in student.pages:
                student_page_map[sp.page_number] = str(BASE_DIR / sp.image_path)
        elif student.scan_image_path:
            # Backwards compat: single scan treated as page 1
            student_page_map[1] = str(BASE_DIR / student.scan_image_path)

        if not student_page_map:
            continue

        for page_number, (sheet, regions) in page_map.items():
            scan_path = student_page_map.get(page_number)
            if not scan_path:
                # Student has no image for this page — skip
                continue

            # Read the full page image
            try:
                with open(scan_path, "rb") as f:
                    image_bytes = f.read()
            except Exception:
                total_errors += 1
                continue

            # Build region dicts for the engine
            region_dicts = [
                {
                    "id": r.id,
                    "question_number": r.question_number,
                    "x": r.x,
                    "y": r.y,
                    "width": r.width,
                    "height": r.height,
                }
                for r in regions
            ]

            # Run OCR — one call per page
            try:
                ocr_results = await engine.recognize(image_bytes, region_dicts)
            except Exception as e:
                # Mark all regions on this page as errored
                for r in regions:
                    await _upsert_answer(
                        db=db,
                        student_id=student.id,
                        region_id=r.id,
                        ocr_text=f"[OCR 오류: {str(e)}]",
                        confidence=0.0,
                        now=now,
                    )
                    total_errors += 1
                continue

            # Map region_id -> OCR result
            result_map = {item["region_id"]: item for item in ocr_results}

            for r in regions:
                ocr_item = result_map.get(r.id)
                text = ocr_item["text"] if ocr_item else ""
                confidence = ocr_item["confidence"] if ocr_item else 0.0

                await _upsert_answer(
                    db=db,
                    student_id=student.id,
                    region_id=r.id,
                    ocr_text=text,
                    confidence=confidence,
                    now=now,
                )
                total_processed += 1

    await db.commit()

    return {
        "exam_id": exam_id,
        "total_students": len(students),
        "total_pages": len(page_map),
        "total_processed": total_processed,
        "total_errors": total_errors,
        "message": f"OCR 완료: {total_processed}개 처리, {total_errors}개 오류",
    }


async def _upsert_answer(
    db: AsyncSession,
    student_id: str,
    region_id: str,
    ocr_text: str,
    confidence: float,
    now: datetime,
) -> None:
    """Create or update a StudentAnswer row."""
    existing_result = await db.execute(
        select(StudentAnswer).where(
            StudentAnswer.student_id == student_id,
            StudentAnswer.region_id == region_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.ocr_text = ocr_text
        existing.ocr_confidence = confidence
        existing.grading_status = "pending"
        existing.updated_at = now
    else:
        new_answer = StudentAnswer(
            id=str(uuid.uuid4()),
            student_id=student_id,
            region_id=region_id,
            ocr_text=ocr_text,
            ocr_confidence=confidence,
            grading_status="pending",
            created_at=now,
            updated_at=now,
        )
        db.add(new_answer)
