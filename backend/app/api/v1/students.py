import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.deps import get_current_user, get_db
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Exam, Question
from app.models.user import User
from app.schemas.answer import AnswerOut, AnswerUpdate
from app.schemas.class_ import StudentOut, StudentUpdate
from app.services.export_service import export_answers_xlsx

logger = logging.getLogger(__name__)
router = APIRouter(tags=["students"])


async def _get_class_owned(class_id: int, teacher_id: int, db: AsyncSession) -> Class:
    cls = await db.get(Class, class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    exam = await db.get(Exam, cls.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your class")
    return cls


async def _get_student_owned(student_id: int, teacher_id: int, db: AsyncSession) -> Student:
    student = await db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    cls = await db.get(Class, student.class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail="Class not found")
    exam = await db.get(Exam, cls.exam_id)
    if exam is None or exam.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="Not your student")
    return student


@router.get("/students/{student_id}/answers", response_model=list[AnswerOut])
async def get_student_answers(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_student_owned(student_id, current_user.id, db)
    result = await db.execute(select(Answer).where(Answer.student_id == student_id))
    return result.scalars().all()


@router.get("/classes/{class_id}/students", response_model=list[StudentOut])
async def list_students(
    class_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_class_owned(class_id, current_user.id, db)
    result = await db.execute(select(Student).where(Student.class_id == class_id))
    return result.scalars().all()


@router.put("/students/{student_id}", response_model=StudentOut)
async def update_student(
    student_id: int,
    body: StudentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    student = await _get_student_owned(student_id, current_user.id, db)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(student, field, value)
    await db.commit()
    await db.refresh(student)
    return student


@router.post("/students/{student_id}/re-ocr", response_model=StudentOut)
async def re_ocr_student(
    student_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """학생 1명의 페이지만 다시 OCR. 반 전체 재처리 없이 인식 안 된 row만 갱신."""
    student = await _get_student_owned(student_id, current_user.id, db)
    cls = await db.get(Class, student.class_id)
    if not cls or not cls.source_pdf_path:
        raise HTTPException(status_code=400, detail="원본 PDF가 없습니다. 반을 다시 업로드해주세요.")
    if not student.page_indices:
        raise HTTPException(status_code=400, detail="이 학생의 페이지 정보가 없습니다.")
    if not current_user.gemini_api_key_encrypted:
        raise HTTPException(status_code=400, detail="Gemini API key not configured")

    from app.gemini.client import get_gemini_client
    from app.gemini.ocr import _assess_confidence, _call_gemini_for_student
    import fitz

    # 문항 번호 목록 로드
    q_result = await db.execute(
        select(Question)
        .where(Question.exam_id == cls.exam_id)
        .order_by(Question.order_index)
    )
    questions_list = q_result.scalars().all()
    questions_by_number = {q.number: q for q in questions_list}
    question_numbers = [q.number for q in questions_list]

    client = get_gemini_client(current_user.gemini_api_key_encrypted)
    doc = fitz.open(cls.source_pdf_path)
    try:
        try:
            data = await _call_gemini_for_student(
                client, doc, list(student.page_indices), question_numbers,
                current_user.ocr_prompt_override,
            )
        except Exception as e:
            logger.warning(f"Re-OCR primary call failed for student {student_id}: {e}")
            try:
                data = await _call_gemini_for_student(
                    client, doc, list(student.page_indices)[:1], question_numbers,
                    current_user.ocr_prompt_override,
                )
            except Exception as e2:
                logger.exception(f"Re-OCR fallback call failed for student {student_id}: {e2}")
                raise HTTPException(status_code=500, detail=f"OCR 실패: {e2}")
    finally:
        try:
            doc.close()
        except Exception:
            pass

    # 기존 답안 삭제 (Grading은 cascade로 함께 삭제)
    await db.execute(delete(Answer).where(Answer.student_id == student_id))

    # 새 답안 생성
    for ans_data in data.get("answers", []):
        q_number = str(ans_data.get("question_number", ""))
        question = questions_by_number.get(q_number)
        if question is None:
            continue
        db.add(Answer(
            student_id=student.id,
            question_id=question.id,
            answer_text=ans_data.get("answer_text", ""),
        ))

    confidence = _assess_confidence(data)
    student.ocr_confidence = confidence
    student.needs_review = (confidence == "low")

    await db.commit()
    await db.refresh(student)
    return student


@router.put("/answers/{answer_id}", response_model=AnswerOut)
async def update_answer(
    answer_id: int,
    body: AnswerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    answer = await db.get(Answer, answer_id)
    if answer is None:
        raise HTTPException(status_code=404, detail="Answer not found")
    # ownership check via student → class → exam
    student = await db.get(Student, answer.student_id)
    cls = await db.get(Class, student.class_id)
    exam = await db.get(Exam, cls.exam_id)
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your answer")

    answer.answer_text = body.answer_text
    await db.commit()
    await db.refresh(answer)
    return answer


@router.get("/exams/{exam_id}/answers.xlsx")
async def download_answers_xlsx(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    exam = await db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your exam")

    xlsx_bytes = await export_answers_xlsx(db, exam_id)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="answers_{exam_id}.xlsx"'},
    )
