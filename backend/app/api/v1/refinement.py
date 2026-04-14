from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.answer import Answer
from app.models.exam import Exam, Question
from app.models.refinement import AnswerCluster, ClusterMember, RefinementSession
from app.models.user import User
from app.schemas.refinement import AnswerClusterOut, ClusterMemberOut, RefinementSessionOut
from app.services.refinement_service import run_refinement

router = APIRouter(tags=["refinement"])


async def _session_to_out(session: RefinementSession, db: AsyncSession) -> RefinementSessionOut:
    cluster_count_result = await db.execute(
        select(func.count()).select_from(AnswerCluster).where(AnswerCluster.session_id == session.id)
    )
    cluster_count = cluster_count_result.scalar_one()

    unjudgable_count_result = await db.execute(
        select(func.count())
        .select_from(AnswerCluster)
        .where(AnswerCluster.session_id == session.id, AnswerCluster.judgable == False)  # noqa: E712
    )
    unjudgable_count = unjudgable_count_result.scalar_one()

    return RefinementSessionOut(
        id=session.id,
        question_id=session.question_id,
        rubric_snapshot_json=session.rubric_snapshot_json,
        status=session.status,
        error=session.error,
        cluster_count=cluster_count,
        unjudgable_count=unjudgable_count,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


async def _get_question_owned(question_id: int, teacher_id: int, db: AsyncSession) -> Question:
    question = await db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    exam = await db.get(Exam, question.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your question")
    return question


@router.get("/questions/{question_id}/refinement-sessions", response_model=list[RefinementSessionOut])
async def list_refinement_sessions(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_question_owned(question_id, current_user.id, db)
    result = await db.execute(
        select(RefinementSession)
        .where(RefinementSession.question_id == question_id)
        .order_by(RefinementSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [await _session_to_out(session, db) for session in sessions]


@router.post("/questions/{question_id}/refine", response_model=RefinementSessionOut, status_code=status.HTTP_202_ACCEPTED)
async def refine_question(
    question_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await _get_question_owned(question_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    session = RefinementSession(
        question_id=question_id,
        rubric_snapshot_json=question.rubric_json,
        status="running",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    background_tasks.add_task(
        run_refinement,
        session_id=session.id,
        question_id=question_id,
        teacher_id=current_user.id,
    )

    return await _session_to_out(session, db)


@router.post("/exams/{exam_id}/refine-all", status_code=status.HTTP_202_ACCEPTED)
async def refine_all_questions(
    exam_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your exam")

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    questions_result = await db.execute(
        select(Question).where(Question.exam_id == exam_id)
    )
    questions = questions_result.scalars().all()

    sessions = []
    for question in questions:
        session = RefinementSession(
            question_id=question.id,
            rubric_snapshot_json=question.rubric_json,
            status="running",
        )
        db.add(session)
        await db.flush()
        sessions.append(session)
        background_tasks.add_task(
            run_refinement,
            session_id=session.id,
            question_id=question.id,
            teacher_id=current_user.id,
        )

    await db.commit()
    return {"message": f"Refinement started for {len(sessions)} questions", "session_count": len(sessions)}


@router.get("/refinement-sessions/{session_id}", response_model=RefinementSessionOut)
async def get_refinement_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(RefinementSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    # ownership check
    question = await db.get(Question, session.question_id)
    exam = await db.get(Exam, question.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")
    return await _session_to_out(session, db)


@router.get("/refinement-sessions/{session_id}/clusters", response_model=list[AnswerClusterOut])
async def list_clusters(
    session_id: int,
    judgable: Optional[bool] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(RefinementSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    question = await db.get(Question, session.question_id)
    exam = await db.get(Exam, question.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your session")

    query = select(AnswerCluster).where(AnswerCluster.session_id == session_id)
    if judgable is not None:
        query = query.where(AnswerCluster.judgable == judgable)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/clusters/{cluster_id}/members", response_model=list[ClusterMemberOut])
async def list_cluster_members(
    cluster_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cluster = await db.get(AnswerCluster, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # ownership check
    session = await db.get(RefinementSession, cluster.session_id)
    question = await db.get(Question, session.question_id)
    exam = await db.get(Exam, question.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your cluster")

    result = await db.execute(
        select(ClusterMember, Answer)
        .join(Answer, ClusterMember.answer_id == Answer.id)
        .where(ClusterMember.cluster_id == cluster_id)
    )
    rows = result.all()

    return [
        ClusterMemberOut(
            id=member.id,
            cluster_id=member.cluster_id,
            answer_id=member.answer_id,
            answer_text=answer.answer_text,
        )
        for member, answer in rows
    ]
