from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_current_user, get_db
from app.models.exam import Exam, Question
from app.models.user import User
from app.schemas.question import QuestionCreate, QuestionOut, QuestionUpdate, RubricDraftSave

router = APIRouter(tags=["questions"])


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam


async def _get_question_owned(question_id: int, teacher_id: int, db: AsyncSession) -> Question:
    question = await db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found")
    exam = await db.get(Exam, question.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your question")
    return question


@router.get("/exams/{exam_id}/questions", response_model=list[QuestionOut])
async def list_questions(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)
    result = await db.execute(
        select(Question)
        .where(Question.exam_id == exam_id)
        .order_by(Question.order_index)
    )
    return result.scalars().all()


@router.post("/exams/{exam_id}/questions", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
async def create_question(
    exam_id: int,
    body: QuestionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)
    question = Question(
        exam_id=exam_id,
        number=body.number,
        order_index=body.order_index,
        question_text=body.question_text,
        max_score=body.max_score,
        model_answer=body.model_answer,
        rubric_json=body.rubric_json or {"criteria": [], "notes": ""},
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: int,
    body: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await _get_question_owned(question_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return question


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await _get_question_owned(question_id, current_user.id, db)
    await db.delete(question)
    await db.commit()


@router.put("/questions/{question_id}/rubric-draft", response_model=QuestionOut)
async def save_rubric_draft(
    question_id: int,
    body: RubricDraftSave,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-save rubric draft without incrementing version."""
    question = await _get_question_owned(question_id, current_user.id, db)
    question.rubric_draft_json = body.rubric_draft_json
    await db.commit()
    await db.refresh(question)
    return question


@router.post("/questions/{question_id}/rubric-draft/commit", response_model=QuestionOut)
async def commit_rubric_draft(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Promote rubric_draft_json → rubric_json and increment version.
    draft가 없으면 현재 rubric_json을 그대로 확정(버전만 증가)."""
    question = await _get_question_owned(question_id, current_user.id, db)
    if question.rubric_draft_json is not None:
        question.rubric_json = question.rubric_draft_json
        question.rubric_draft_json = None
    # draft 없으면 현재 rubric_json 유지, 버전만 증가
    question.rubric_version += 1
    await db.commit()
    await db.refresh(question)
    return question
