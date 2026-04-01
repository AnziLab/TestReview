import base64
import io
import json
import uuid
from datetime import datetime
from typing import Optional

import httpx
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import AnswerSheet, Region, Settings, Student, StudentAnswer, StudentPage


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


# ─── GPT OCR Engine ──────────────────────────────────────────────────────────

class GPTOCREngine(OCREngine):
    """Uses GPT multimodal API for OCR (one API call per page, all regions at once)."""

    def __init__(self, api_key: str, model: str = "gpt-5.4-nano"):
        self.api_key = api_key
        self.model = model

    async def recognize(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise RuntimeError("openai package is not installed.")

        if not regions:
            return []

        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        data_url = f"data:image/png;base64,{b64}"

        # Build a numbered list of regions with their coordinates for the prompt
        region_lines = []
        for i, r in enumerate(regions, start=1):
            region_lines.append(
                f"{i}. 문항 '{r['question_number']}' "
                f"(x={r['x']:.4f}, y={r['y']:.4f}, "
                f"w={r['width']:.4f}, h={r['height']:.4f})"
            )
        region_desc = "\n".join(region_lines)

        prompt = (
            "이 시험지 이미지에서 아래에 나열된 각 답안 영역의 손글씨를 읽어주세요. "
            "좌표는 이미지 크기 대비 비율(0.0~1.0)입니다. "
            "각 영역의 텍스트만 반환하고, 정확히 다음 JSON 형식으로 응답해주세요:\n"
            '{"results": [{"index": 1, "text": "..."}, {"index": 2, "text": "..."}, ...]}\n\n'
            "영역 목록:\n" + region_desc + "\n\n"
            "텍스트를 읽을 수 없는 경우 해당 영역의 text를 빈 문자열로 반환하세요. "
            "JSON만 반환하고 다른 설명은 추가하지 마세요."
        )

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self.model,
            max_tokens=2048,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "high"},
                        },
                    ],
                }
            ],
        )

        raw = response.choices[0].message.content.strip()

        # Parse JSON response
        try:
            # Strip markdown fences if present
            if raw.startswith("```"):
                import re
                raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw)
                raw = raw.strip()
            data = json.loads(raw)
            index_to_text = {item["index"]: item.get("text", "") for item in data.get("results", [])}
        except (json.JSONDecodeError, KeyError, TypeError):
            index_to_text = {}

        results = []
        for i, r in enumerate(regions, start=1):
            text = index_to_text.get(i, "")
            results.append({
                "region_id": r["id"],
                "text": text,
                "confidence": 0.9 if text else 0.0,
            })

        return results


# ─── Clova OCR Engine ────────────────────────────────────────────────────────

class ClovaOCREngine(OCREngine):
    """Uses Naver Clova OCR API."""

    def __init__(self, api_url: str, secret_key: str):
        self.api_url = api_url
        self.secret_key = secret_key

    async def recognize(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        if not regions:
            return []

        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        request_body = {
            "version": "V2",
            "requestId": str(uuid.uuid4()),
            "timestamp": int(datetime.utcnow().timestamp() * 1000),
            "images": [
                {
                    "format": "png",
                    "name": "page",
                    "data": b64,
                }
            ],
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                self.api_url,
                headers={
                    "X-OCR-SECRET": self.secret_key,
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            response.raise_for_status()
            clova_data = response.json()

        # Extract all text fields with their bounding boxes from Clova response
        clova_fields = []
        for image_result in clova_data.get("images", []):
            for field in image_result.get("fields", []):
                bounding_poly = field.get("boundingPoly", {})
                vertices = bounding_poly.get("vertices", [])
                if len(vertices) >= 4:
                    xs = [v.get("x", 0) for v in vertices]
                    ys = [v.get("y", 0) for v in vertices]
                    # Store as fractional coordinates — we need image dimensions for that.
                    # Clova returns pixel coords; we store raw and match below.
                    clova_fields.append({
                        "text": field.get("inferText", ""),
                        "confidence": field.get("inferConfidence", 0.0),
                        "min_x": min(xs),
                        "min_y": min(ys),
                        "max_x": max(xs),
                        "max_y": max(ys),
                    })

        # We need the image dimensions to convert our region fractions to pixels
        try:
            img = Image.open(io.BytesIO(image_bytes))
            img_w, img_h = img.size
        except Exception:
            img_w, img_h = 1, 1  # fallback — coordinates will be wrong but won't crash

        results = []
        for r in regions:
            # Convert fractional region to pixel bbox
            rx1 = r["x"] * img_w
            ry1 = r["y"] * img_h
            rx2 = (r["x"] + r["width"]) * img_w
            ry2 = (r["y"] + r["height"]) * img_h

            # Collect all Clova text fields whose centre falls within this region
            matching_texts = []
            matching_confs = []
            for cf in clova_fields:
                cx = (cf["min_x"] + cf["max_x"]) / 2
                cy = (cf["min_y"] + cf["max_y"]) / 2
                if rx1 <= cx <= rx2 and ry1 <= cy <= ry2:
                    matching_texts.append(cf["text"])
                    matching_confs.append(cf["confidence"])

            combined_text = " ".join(matching_texts)
            avg_conf = sum(matching_confs) / len(matching_confs) if matching_confs else 0.0

            results.append({
                "region_id": r["id"],
                "text": combined_text,
                "confidence": round(avg_conf, 4),
            })

        return results


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
    """Read settings and return the appropriate OCR engine."""
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()

    if settings is None:
        raise ValueError("OCR 설정이 구성되지 않았습니다. 설정 페이지에서 API 키를 입력해주세요.")

    provider = (settings.ocr_provider or "gpt").lower()

    if provider == "clova":
        if not settings.clova_api_url or not settings.clova_secret_key:
            raise ValueError("Clova OCR 설정이 불완전합니다. API URL과 Secret Key를 입력해주세요.")
        return ClovaOCREngine(
            api_url=settings.clova_api_url,
            secret_key=settings.clova_secret_key,
        )
    else:
        # Default: GPT OCR
        if not settings.llm_api_key and not settings.ocr_model:
            raise ValueError("GPT OCR 설정이 구성되지 않았습니다. API 키를 입력해주세요.")
        # Use llm_api_key for GPT OCR (same OpenAI account)
        api_key = settings.llm_api_key or ""
        model = settings.ocr_model or "gpt-5.4-nano"
        return GPTOCREngine(api_key=api_key, model=model)


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
