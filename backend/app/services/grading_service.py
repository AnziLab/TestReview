from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import Region, StudentAnswer, Settings
from app.services.llm_client import GeminiClient


async def _get_llm_client(db: AsyncSession) -> GeminiClient:
    result = await db.execute(select(Settings).limit(1))
    settings = result.scalar_one_or_none()
    if settings is None or not settings.gemini_api_key:
        raise ValueError("Gemini API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 입력해주세요.")
    return GeminiClient(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model or "gemini-2.0-flash",
    )


async def check_grading_for_region(region_id: str, db: AsyncSession) -> dict:
    """Grade all student answers for a specific question/region."""
    llm_client = await _get_llm_client(db)

    result = await db.execute(select(Region).where(Region.id == region_id))
    region = result.scalar_one_or_none()
    if not region:
        raise ValueError("영역을 찾을 수 없습니다.")

    if not region.model_answer and not region.rubric:
        raise ValueError("모범 답안 또는 채점 기준을 먼저 입력해주세요.")

    answers_result = await db.execute(
        select(StudentAnswer)
        .where(StudentAnswer.region_id == region_id)
        .options(selectinload(StudentAnswer.student))
    )
    answers = answers_result.scalars().all()

    if not answers:
        raise ValueError("이 문항에 대한 학생 답안이 없습니다. 먼저 OCR을 실행해주세요.")

    results = []
    ambiguous_count = 0

    for answer in answers:
        if not answer.ocr_text:
            continue

        try:
            evaluation = await llm_client.evaluate_answer(
                student_answer=answer.ocr_text,
                model_answer=region.model_answer or "",
                rubric=region.rubric or "",
                max_score=region.max_score,
            )

            answer.score = evaluation["score"]
            answer.grading_feedback = evaluation["feedback"]
            answer.is_ambiguous = evaluation["is_ambiguous"]
            answer.ambiguity_reason = evaluation.get("ambiguity_reason")
            answer.grading_status = "needs_review" if evaluation["is_ambiguous"] else "graded"
            answer.updated_at = datetime.utcnow()

            if evaluation["is_ambiguous"]:
                ambiguous_count += 1

            results.append({
                "student_id": answer.student_id,
                "student_name": answer.student.name if answer.student else "",
                "ocr_text": answer.ocr_text,
                "score": evaluation["score"],
                "feedback": evaluation["feedback"],
                "is_ambiguous": evaluation["is_ambiguous"],
                "ambiguity_reason": evaluation.get("ambiguity_reason"),
            })

        except Exception as e:
            answer.grading_status = "needs_review"
            answer.is_ambiguous = True
            answer.ambiguity_reason = f"채점 오류: {str(e)}"
            answer.updated_at = datetime.utcnow()
            ambiguous_count += 1

            results.append({
                "student_id": answer.student_id,
                "student_name": answer.student.name if answer.student else "",
                "ocr_text": answer.ocr_text,
                "score": None,
                "feedback": f"오류: {str(e)}",
                "is_ambiguous": True,
                "ambiguity_reason": f"채점 오류: {str(e)}",
            })

    await db.commit()

    return {
        "region_id": region_id,
        "question_number": region.question_number,
        "total_processed": len(results),
        "ambiguous_count": ambiguous_count,
        "results": results,
    }
