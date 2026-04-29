from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Exam
from app.models.grading import Grading
from app.models.user import User
from app.schemas.grading import GradingOut, GradingUpdate
from app.services.export_service import export_gradings_xlsx
from app.services.grading_service import run_grading

router = APIRouter(tags=["grading"])


class GradeRequest(BaseModel):
    class_ids: Optional[list[int]] = None


async def _get_exam_owned(exam_id: int, teacher_id: int, db: AsyncSession) -> Exam:
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your exam")
    return exam


@router.post("/exams/{exam_id}/grade", status_code=status.HTTP_202_ACCEPTED)
async def start_grading(
    exam_id: int,
    background_tasks: BackgroundTasks,
    body: GradeRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """일괄 채점 시작. body.class_ids가 있으면 그 반만, 없으면 전체."""
    await _get_exam_owned(exam_id, current_user.id, db)

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    class_ids = body.class_ids if body else None
    if class_ids is not None:
        if not class_ids:
            raise HTTPException(status_code=400, detail="채점할 반을 하나 이상 선택하세요.")
        # 선택한 반들이 모두 이 시험에 속하는지 검증
        result = await db.execute(
            select(Class.id).where(Class.exam_id == exam_id, Class.id.in_(class_ids))
        )
        valid_ids = {row for row in result.scalars().all()}
        invalid = set(class_ids) - valid_ids
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"이 시험에 속하지 않는 반: {sorted(invalid)}"
            )

    background_tasks.add_task(
        run_grading,
        exam_id=exam_id,
        teacher_id=current_user.id,
        class_ids=class_ids,
    )
    return {"message": "Grading started in background", "class_ids": class_ids}


@router.get("/exams/{exam_id}/grading-status")
async def grading_status(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """일괄 채점 진행상황. 프론트엔드에서 폴링."""
    exam = await _get_exam_owned(exam_id, current_user.id, db)
    return {
        "id": exam.id,
        "grading_status": exam.grading_status,  # processing | done | failed | None
        "grading_progress_current": exam.grading_progress_current,
        "grading_progress_total": exam.grading_progress_total,
        "grading_error": exam.grading_error,
    }


@router.get("/exams/{exam_id}/gradings")
async def list_gradings(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생별로 그룹핑된 채점 결과 반환.
    [{student_id, student_number, name, scores: {question_id: score}, total}]
    """
    await _get_exam_owned(exam_id, current_user.id, db)

    rows = (await db.execute(
        select(Grading, Answer, Student, Class)
        .join(Answer, Grading.answer_id == Answer.id)
        .join(Student, Answer.student_id == Student.id)
        .join(Class, Student.class_id == Class.id)
        .where(Class.exam_id == exam_id)
        .order_by(Class.name, Student.student_number, Answer.question_id)
    )).all()

    # Group by student
    students: dict[int, dict] = {}
    for grading, answer, student, cls in rows:
        if student.id not in students:
            students[student.id] = {
                "student_id": student.id,
                "student_number": student.student_number,
                "name": student.name,
                "class_id": cls.id,
                "class_name": cls.name,
                "scores": {},
                "total": 0.0,
            }
        students[student.id]["scores"][answer.question_id] = float(grading.score)
        students[student.id]["total"] = round(
            students[student.id]["total"] + float(grading.score), 2
        )

    return list(students.values())


@router.put("/gradings/{grading_id}", response_model=GradingOut)
async def update_grading(
    grading_id: int,
    body: GradingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    grading = await db.get(Grading, grading_id)
    if grading is None:
        raise HTTPException(status_code=404, detail="Grading not found")

    # Ownership check
    answer = await db.get(Answer, grading.answer_id)
    student = await db.get(Student, answer.student_id)
    cls = await db.get(Class, student.class_id)
    exam = await db.get(Exam, cls.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your grading")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(grading, field, value)
    grading.graded_by = "manual"
    grading.graded_by_user_id = current_user.id

    await db.commit()
    await db.refresh(grading)
    return grading


@router.get("/exams/{exam_id}/gradings.xlsx")
async def download_gradings_xlsx(
    exam_id: int,
    score: int = 1,
    rationale: int = 1,
    answer: int = 0,
    model_answer: int = 0,
    criteria: int = 0,
    total: int = 1,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_exam_owned(exam_id, current_user.id, db)
    xlsx_bytes = await export_gradings_xlsx(
        db, exam_id,
        include_score=bool(score),
        include_rationale=bool(rationale),
        include_answer=bool(answer),
        include_model_answer=bool(model_answer),
        include_criteria=bool(criteria),
        include_total=bool(total),
    )
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="gradings_{exam_id}.xlsx"'},
    )


@router.get("/students/{student_id}/grading-detail")
async def student_grading_detail(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생 1명의 문항별 상세 채점 결과."""
    from app.models.exam import Question
    from sqlalchemy.orm import selectinload

    student = await db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    cls = await db.get(Class, student.class_id)
    exam = await db.get(Exam, cls.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your student")

    rows = (await db.execute(
        select(Answer, Grading, Question)
        .outerjoin(Grading, Grading.answer_id == Answer.id)
        .join(Question, Answer.question_id == Question.id)
        .where(Answer.student_id == student_id)
        .order_by(Question.order_index)
    )).all()

    return [
        {
            "question_id": q.id,
            "question_number": q.number,
            "max_score": float(q.max_score),
            "model_answer": q.model_answer,
            "answer_text": a.answer_text,
            "score": float(g.score) if g else None,
            "rationale": g.rationale if g else None,
            "graded_by": g.graded_by if g else None,
        }
        for a, g, q in rows
    ]


@router.post("/questions/{question_id}/grade", status_code=status.HTTP_202_ACCEPTED)
async def grade_question(
    question_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """특정 문항만 재채점."""
    from app.models.exam import Question
    from app.services.grading_service import run_grading_question

    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    background_tasks.add_task(
        run_grading_question,
        question_id=question_id,
        teacher_id=current_user.id,
    )
    return {"message": f"Re-grading started for question {question_id}"}


@router.get("/questions/{question_id}/grading-results")
async def question_grading_results(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """문항 1개의 전체 학생 답안 + 채점결과."""
    from app.models.exam import Question

    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    rows = (await db.execute(
        select(Answer, Grading, Student)
        .outerjoin(Grading, Grading.answer_id == Answer.id)
        .join(Student, Answer.student_id == Student.id)
        .where(Answer.question_id == question_id)
        .order_by(Student.student_number)
    )).all()

    return [
        {
            "student_id": s.id,
            "student_number": s.student_number,
            "name": s.name,
            "answer_text": a.answer_text,
            "score": float(g.score) if g else None,
            "max_score": float(question.max_score),
            "rationale": g.rationale if g else None,
            "graded_by": g.graded_by if g else None,
        }
        for a, g, s in rows
    ]
