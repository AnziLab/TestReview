"""Background service: generate draft rubric from exam paper."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.generate_rubric import generate_rubric_from_paper
from app.models.exam import Exam, Question
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_rubric_generation(
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
                exam.status = "draft"
                await db.commit()
                return

            client = get_gemini_client(teacher.gemini_api_key_encrypted)
            data = await generate_rubric_from_paper(
                client, file_path, question_from, question_to,
                subject=exam.subject,
                school_level=exam.school_level,
                grade=exam.grade,
            )

            # 기존 문항 삭제 후 새로 저장
            existing = (await db.execute(select(Question).where(Question.exam_id == exam_id))).scalars().all()
            for q in existing:
                await db.delete(q)

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
            logger.info(f"Rubric generation done for exam {exam_id}: {len(data.get('questions', []))} questions")

        except Exception as exc:
            logger.exception(f"Rubric generation failed for exam {exam_id}: {exc}")
            try:
                exam = await db.get(Exam, exam_id)
                if exam:
                    exam.status = "rubric_failed"
                    await db.commit()
            except Exception:
                pass
