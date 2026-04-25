"""Background service: extract rubric from uploaded PDF and populate questions."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.rubric_extract import extract_rubric_from_file
from app.models.exam import Exam, Question
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_rubric_extraction(exam_id: int, file_path: str, teacher_id: int) -> None:
    """
    BackgroundTask entry point.
    Extracts rubric from file, saves questions to DB, updates exam status.
    """
    async with AsyncSessionLocal() as db:
        try:
            # Load exam and teacher
            exam = await db.get(Exam, exam_id)
            if exam is None:
                logger.error(f"Exam {exam_id} not found for rubric extraction")
                return

            teacher = await db.get(User, teacher_id)
            if teacher is None or not teacher.gemini_api_key_encrypted:
                exam.status = "draft"
                await db.commit()
                logger.error(f"Teacher {teacher_id} has no API key")
                return

            client = get_gemini_client(teacher.gemini_api_key_encrypted)
            data = await extract_rubric_from_file(
                client, file_path,
                prompt_override=teacher.rubric_extract_prompt_override,
            )

            # Remove old questions for this exam
            existing = await db.execute(select(Question).where(Question.exam_id == exam_id))
            for q in existing.scalars().all():
                await db.delete(q)

            # Insert new questions
            for idx, q_data in enumerate(data.get("questions", [])):
                criteria = q_data.get("criteria", [])
                question = Question(
                    exam_id=exam_id,
                    number=str(q_data.get("number", idx + 1)),
                    order_index=idx,
                    question_text=q_data.get("question_text"),
                    max_score=float(q_data.get("max_score", 0)),
                    model_answer=q_data.get("model_answer"),
                    rubric_json={
                        "criteria": [
                            {"description": c.get("description", ""), "points": c.get("points", 0)}
                            for c in criteria
                        ],
                        "notes": "",
                    },
                    rubric_version=1,
                )
                db.add(question)

            exam.status = "rubric_ready"
            await db.commit()
            logger.info(f"Rubric extraction done for exam {exam_id}: {len(data.get('questions', []))} questions")

        except Exception as exc:
            logger.exception(f"Rubric extraction failed for exam {exam_id}: {exc}")
            try:
                exam = await db.get(Exam, exam_id)
                if exam:
                    exam.status = "rubric_failed"
                    await db.commit()
            except Exception:
                pass
