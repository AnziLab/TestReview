"""Background service: cluster answers to refine rubric."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.clustering import cluster_answers
from app.models.answer import Answer
from app.models.exam import Question
from app.models.refinement import AnswerCluster, ClusterMember, RefinementSession
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_refinement(session_id: int, question_id: int, teacher_id: int) -> None:
    """BackgroundTask: cluster all answers for a question."""
    async with AsyncSessionLocal() as db:
        session_obj = await db.get(RefinementSession, session_id)
        if session_obj is None:
            return

        teacher = await db.get(User, teacher_id)
        if teacher is None or not teacher.gemini_api_key_encrypted:
            session_obj.status = "failed"
            session_obj.error = "Teacher has no Gemini API key"
            session_obj.completed_at = datetime.now(timezone.utc)
            await db.commit()
            return

        try:
            question = await db.get(Question, question_id)
            if question is None:
                raise ValueError(f"Question {question_id} not found")

            # Load all answers for this question
            answers_result = await db.execute(
                select(Answer).where(Answer.question_id == question_id)
            )
            answers = answers_result.scalars().all()

            answer_dicts = [
                {"id": a.id, "text": a.answer_text} for a in answers if a.answer_text.strip()
            ]

            client = get_gemini_client(teacher.gemini_api_key_encrypted)
            clusters_data = await cluster_answers(
                client,
                question.rubric_json,
                answer_dicts,
            )

            # Build answer id → Answer map
            answer_map = {a.id: a for a in answers}

            for cluster_data in clusters_data:
                member_ids = cluster_data.get("member_ids", [])
                cluster = AnswerCluster(
                    session_id=session_id,
                    label=cluster_data.get("label", ""),
                    representative_text=cluster_data.get("representative_text", ""),
                    size=len(member_ids),
                    judgable=bool(cluster_data.get("judgable", True)),
                    suggested_score=cluster_data.get("suggested_score"),
                    reason=cluster_data.get("reason"),
                )
                db.add(cluster)
                await db.flush()

                for ans_id in member_ids:
                    if ans_id in answer_map:
                        member = ClusterMember(
                            cluster_id=cluster.id,
                            answer_id=ans_id,
                        )
                        db.add(member)

            session_obj.status = "done"
            session_obj.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"Refinement session {session_id} done: {len(clusters_data)} clusters")

        except Exception as exc:
            logger.exception(f"Refinement session {session_id} failed: {exc}")
            try:
                session_obj = await db.get(RefinementSession, session_id)
                if session_obj:
                    session_obj.status = "failed"
                    session_obj.error = str(exc)[:1000]
                    session_obj.completed_at = datetime.now(timezone.utc)
                    await db.commit()
            except Exception:
                pass
