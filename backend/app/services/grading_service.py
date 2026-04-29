"""Background service: auto-grade all answers for an exam."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.grading import grade_answers
from app.models.answer import Answer
from app.models.class_ import Student
from app.models.exam import Exam, Question
from app.models.grading import Grading
from app.models.user import User

logger = logging.getLogger(__name__)


async def _grade_question(
    db, client, question,
    extra_instructions: str | None = None,
    prompt_override: str | None = None,
    class_ids: list[int] | None = None,
) -> None:
    """문항 1개 채점 (upsert). 공통 로직.

    class_ids가 주어지면 해당 반에 속한 학생의 답안만 채점.
    """
    from app.gemini.grading import grade_answers

    stmt = select(Answer).where(Answer.question_id == question.id)
    if class_ids:
        stmt = stmt.join(Student, Answer.student_id == Student.id).where(Student.class_id.in_(class_ids))
    answers = (await db.execute(stmt)).scalars().all()
    if not answers:
        return

    answer_dicts = [{"id": a.id, "text": a.answer_text} for a in answers]
    grading_results = await grade_answers(
        client, question.rubric_json, answer_dicts,
        model_answer=question.model_answer,
        max_score=float(question.max_score),
        question_text=question.question_text,
        extra_instructions=extra_instructions,
        prompt_override=prompt_override,
    )

    answer_ids = [r.get("answer_id") for r in grading_results if r.get("answer_id")]
    existing = {
        g.answer_id: g for g in (
            await db.execute(select(Grading).where(Grading.answer_id.in_(answer_ids)))
        ).scalars().all()
    }

    for result in grading_results:
        answer_id = result.get("answer_id")
        if answer_id is None:
            continue
        g = existing.get(answer_id)
        if g is None:
            db.add(Grading(
                answer_id=answer_id,
                score=float(result.get("score", 0)),
                matched_criteria_ids=result.get("matched_criteria_ids"),
                rationale=result.get("rationale"),
                graded_by="auto",
                rubric_version=question.rubric_version,
            ))
        else:
            g.score = float(result.get("score", 0))
            g.matched_criteria_ids = result.get("matched_criteria_ids")
            g.rationale = result.get("rationale")
            g.graded_by = "auto"
            g.rubric_version = question.rubric_version
            g.updated_at = datetime.now(timezone.utc)

    await db.flush()


async def run_grading_question(question_id: int, teacher_id: int) -> None:
    """BackgroundTask: 문항 1개만 재채점."""
    async with AsyncSessionLocal() as db:
        from app.models.exam import Question
        question = await db.get(Question, question_id)
        if not question:
            return
        teacher = await db.get(User, teacher_id)
        if not teacher or not teacher.gemini_api_key_encrypted:
            return
        try:
            client = get_gemini_client(teacher.gemini_api_key_encrypted)
            await _grade_question(
                db, client, question,
                extra_instructions=teacher.grading_extra_instructions,
                prompt_override=teacher.grading_prompt_override,
            )
            await db.commit()
            logger.info(f"Re-grading done for question {question_id}")
        except Exception as exc:
            logger.exception(f"Re-grading failed for question {question_id}: {exc}")


async def run_grading(
    exam_id: int,
    teacher_id: int,
    class_ids: list[int] | None = None,
) -> None:
    """BackgroundTask: auto-grade all answers for an exam question by question.

    class_ids가 주어지면 그 반의 학생 답안만 채점, 미지정 시 전체 반.
    """
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
                try:
                    await _grade_question(
                        db, client, question,
                        extra_instructions=teacher.grading_extra_instructions,
                        prompt_override=teacher.grading_prompt_override,
                        class_ids=class_ids,
                    )
                except Exception as exc:
                    logger.warning(f"Grading failed for question {question.id}: {exc}")
                    continue

            # 전체 반을 채점한 경우에만 status를 graded로 변경
            if not class_ids:
                exam.status = "graded"
            await db.commit()
            logger.info(f"Grading done for exam {exam_id} (classes={class_ids or 'all'})")

        except Exception as exc:
            logger.exception(f"Grading failed for exam {exam_id}: {exc}")
