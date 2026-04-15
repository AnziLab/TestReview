"""Background service: extract question texts from exam paper and populate questions."""
import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.exam_paper_extract import extract_exam_paper
from app.models.exam import Exam, Question
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_exam_paper_extraction(
    exam_id: int,
    file_path: str,
    teacher_id: int,
    question_from: int,
    question_to: int,
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            exam = await db.get(Exam, exam_id)
            if not exam:
                return

            teacher = await db.get(User, teacher_id)
            if not teacher or not teacher.gemini_api_key_encrypted:
                exam.exam_paper_status = "failed"
                await db.commit()
                return

            client = get_gemini_client(teacher.gemini_api_key_encrypted)

            # {question_number (int): text}
            extracted = await extract_exam_paper(client, file_path, question_from, question_to)

            # Fetch all questions for this exam
            questions = (
                await db.execute(
                    select(Question).where(Question.exam_id == exam_id)
                )
            ).scalars().all()

            # Match by parsing the leading integer from question.number
            # e.g. "3-1)" → 3, "9-2)" → 9, "5" → 5
            def leading_int(s: str) -> int | None:
                m = re.match(r"(\d+)", s)
                return int(m.group(1)) if m else None

            updated = 0
            for q in questions:
                num = leading_int(q.number)
                if num is not None and num in extracted:
                    q.question_text = extracted[num]
                    updated += 1

            exam.exam_paper_status = "done"
            await db.commit()
            logger.info(f"Exam paper extraction done for exam {exam_id}: {updated} questions updated")

        except Exception as exc:
            logger.exception(f"Exam paper extraction failed for exam {exam_id}: {exc}")
            try:
                exam = await db.get(Exam, exam_id)
                if exam:
                    exam.exam_paper_status = "failed"
                    await db.commit()
            except Exception:
                pass
