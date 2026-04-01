from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import AnswerSheet, Region, Student, StudentAnswer
from app.schemas.schemas import (
    StudentAnswerUpdate,
    StudentAnswerResponse,
    GradingRegionSummary,
    GradingSummaryResponse,
    AmbiguousAnswerResponse,
    CheckGradingResponse,
)
from app.services.ocr_service import run_ocr_for_exam, save_ocr_correction
from app.services.grading_service import check_grading_for_region

router = APIRouter(tags=["grading"])


@router.post("/exams/{exam_id}/ocr")
async def run_ocr(exam_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await run_ocr_for_exam(exam_id, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/exams/{exam_id}/regions/{region_id}/check-grading",
    response_model=CheckGradingResponse,
)
async def check_grading(
    exam_id: str, region_id: str, db: AsyncSession = Depends(get_db)
):
    try:
        result = await check_grading_for_region(region_id, db)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/exams/{exam_id}/grading-summary", response_model=GradingSummaryResponse)
async def grading_summary(exam_id: str, db: AsyncSession = Depends(get_db)):
    sheets_result = await db.execute(
        select(AnswerSheet)
        .where(AnswerSheet.exam_id == exam_id)
        .options(selectinload(AnswerSheet.regions))
        .order_by(AnswerSheet.page_number)
    )
    sheets = sheets_result.scalars().all()

    student_count_result = await db.execute(
        select(func.count(Student.id)).where(Student.exam_id == exam_id)
    )
    total_students = student_count_result.scalar() or 0

    questions: list[GradingRegionSummary] = []

    # Collect all regions across all pages
    all_regions: list[Region] = []
    for sheet in sheets:
        all_regions.extend(sheet.regions)

    for region in sorted(all_regions, key=lambda r: r.question_number):
        answers_result = await db.execute(
            select(StudentAnswer).where(StudentAnswer.region_id == region.id)
        )
        answers = answers_result.scalars().all()

        graded = [a for a in answers if a.grading_status == "graded"]
        ambiguous = [a for a in answers if a.is_ambiguous]
        scores = [a.score for a in answers if a.score is not None]

        questions.append(
            GradingRegionSummary(
                region_id=region.id,
                question_number=region.question_number,
                total_students=len(answers),
                graded_count=len(graded),
                ambiguous_count=len(ambiguous),
                avg_score=round(sum(scores) / len(scores), 2) if scores else None,
                max_score=region.max_score,
            )
        )

    return GradingSummaryResponse(
        exam_id=exam_id,
        total_students=total_students,
        questions=questions,
    )


@router.get(
    "/exams/{exam_id}/ambiguous", response_model=List[AmbiguousAnswerResponse]
)
async def list_ambiguous(exam_id: str, db: AsyncSession = Depends(get_db)):
    sheets_result = await db.execute(
        select(AnswerSheet)
        .where(AnswerSheet.exam_id == exam_id)
        .options(selectinload(AnswerSheet.regions))
    )
    sheets = sheets_result.scalars().all()
    if not sheets:
        return []

    region_ids = [r.id for sheet in sheets for r in sheet.regions]
    if not region_ids:
        return []

    result = await db.execute(
        select(StudentAnswer)
        .where(
            StudentAnswer.region_id.in_(region_ids),
            StudentAnswer.is_ambiguous == True,
        )
        .options(
            selectinload(StudentAnswer.student),
            selectinload(StudentAnswer.region),
        )
    )
    answers = result.scalars().all()

    return [
        AmbiguousAnswerResponse(
            id=a.id,
            student_id=a.student_id,
            region_id=a.region_id,
            student_name=a.student.name if a.student else "",
            student_number=a.student.student_number if a.student else "",
            question_number=a.region.question_number if a.region else "",
            ocr_text=a.ocr_text,
            score=a.score,
            ambiguity_reason=a.ambiguity_reason,
            grading_feedback=a.grading_feedback,
            grading_status=a.grading_status,
        )
        for a in answers
    ]


@router.put("/student-answers/{answer_id}", response_model=StudentAnswerResponse)
async def update_student_answer(
    answer_id: str,
    payload: StudentAnswerUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.id == answer_id)
    )
    answer = result.scalar_one_or_none()
    if not answer:
        raise HTTPException(status_code=404, detail="답안을 찾을 수 없습니다.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(answer, field, value)

    answer.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(answer)
    return answer


@router.get(
    "/exams/{exam_id}/students/{student_id}/answers",
    response_model=List[StudentAnswerResponse],
)
async def get_student_answers(
    exam_id: str, student_id: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(StudentAnswer).where(StudentAnswer.student_id == student_id)
    )
    return result.scalars().all()


@router.put("/student-answers/{answer_id}/correct-ocr")
async def correct_ocr_text(
    answer_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher manually corrects OCR text.
    This correction is stored and can be used as training data for
    future OCR model fine-tuning.
    """
    corrected_text = payload.get("corrected_text", "")
    if not corrected_text:
        raise HTTPException(status_code=400, detail="corrected_text가 필요합니다.")
    await save_ocr_correction(answer_id, corrected_text, db)
    return {"message": "OCR 텍스트가 수정되었습니다."}


