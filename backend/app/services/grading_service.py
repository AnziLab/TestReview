"""Background service: auto-grade all answers for an exam."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.grading import grade_answers
from app.models.answer import Answer
from app.models.exam import Exam, Question
from app.models.grading import Grading
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_grading(exam_id: int, teacher_id: int) -> None:
    """BackgroundTask: auto-grade all answers for an exam question by question."""
    async with AsyncSessionLocal() as db:
        exam = await db.get(Exam, exam_id)
        if exam is None:
            return

        teacher = await db.get(User, teacher_id)
        if teacher is None or not teacher.gemini_api_key_encrypted:
            logger.error(f"Teacher {teacher_id} has no Gemini API key")
            return

        try:
            client = get_gemini_client(teacher.gemini_api_key_encrypted)

            questions_result = await db.execute(
                select(Question).where(Question.exam_id == exam_id)
            )
            questions = questions_result.scalars().all()

            for question in questions:
                answers_result = await db.execute(
                    select(Answer).where(Answer.question_id == question.id)
                )
                answers = answers_result.scalars().all()
                if not answers:
                    continue

                answer_dicts = [
                    {"id": a.id, "text": a.answer_text} for a in answers
                ]

                try:
                    grading_results = await grade_answers(
                        client, question.rubric_json, answer_dicts
                    )
                except Exception as exc:
                    logger.warning(f"Grading failed for question {question.id}: {exc}")
                    continue

                for result in grading_results:
                    answer_id = result.get("answer_id")
                    if answer_id is None:
                        continue

                    # Upsert grading
                    existing = await db.execute(
                        select(Grading).where(Grading.answer_id == answer_id)
                    )
                    grading = existing.scalar_one_or_none()

                    if grading is None:
                        grading = Grading(
                            answer_id=answer_id,
                            score=float(result.get("score", 0)),
                            matched_criteria_ids=result.get("matched_criteria_ids"),
                            rationale=result.get("rationale"),
                            graded_by="auto",
                            rubric_version=question.rubric_version,
                        )
                        db.add(grading)
                    else:
                        grading.score = float(result.get("score", 0))
                        grading.matched_criteria_ids = result.get("matched_criteria_ids")
                        grading.rationale = result.get("rationale")
                        grading.graded_by = "auto"
                        grading.rubric_version = question.rubric_version
                        grading.updated_at = datetime.now(timezone.utc)

            exam.status = "graded"
            await db.commit()
            logger.info(f"Grading done for exam {exam_id}")

        except Exception as exc:
            logger.exception(f"Grading failed for exam {exam_id}: {exc}")
