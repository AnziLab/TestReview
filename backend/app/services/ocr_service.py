"""Background service: OCR a class PDF and populate students + answers."""
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.ocr import _call_gemini_for_student, _group_pages, _assess_confidence
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Question
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_ocr(class_id: int, teacher_id: int) -> None:
    """BackgroundTask: OCR class PDF, create students and answers.
    학생 1명씩 처리하며 진행상황을 즉시 DB에 반영."""
    async with AsyncSessionLocal() as db:
        class_obj = await db.get(Class, class_id)
        if class_obj is None:
            logger.error(f"Class {class_id} not found")
            return

        teacher = await db.get(User, teacher_id)
        if teacher is None or not teacher.gemini_api_key_encrypted:
            class_obj.ocr_status = "failed"
            class_obj.ocr_error = "Teacher has no Gemini API key"
            await db.commit()
            return

        class_obj.ocr_status = "processing"
        class_obj.students_processed = 0
        await db.commit()

        doc = None
        try:
            import fitz
            doc = fitz.open(class_obj.source_pdf_path)
            total_pages = len(doc)

            client = get_gemini_client(teacher.gemini_api_key_encrypted)

            # 문항 번호 목록 로드
            q_result = await db.execute(
                select(Question)
                .where(Question.exam_id == class_obj.exam_id)
                .order_by(Question.order_index)
            )
            questions_list = q_result.scalars().all()
            questions = {q.number: q for q in questions_list}
            question_numbers = [q.number for q in questions_list]

            # 기존 학생 삭제
            existing = (await db.execute(
                select(Student).where(Student.class_id == class_id)
            )).scalars().all()
            for st in existing:
                await db.delete(st)
            await db.flush()
            await db.commit()

            groups = _group_pages(total_pages, class_obj.scan_mode)

            for page_indices in groups:
                try:
                    data = await _call_gemini_for_student(
                        client, doc, page_indices, question_numbers
                    )
                except Exception as e:
                    logger.warning(f"OCR primary call failed for pages {page_indices}: {e}")
                    try:
                        data = await _call_gemini_for_student(
                            client, doc, page_indices[:1], question_numbers
                        )
                    except Exception as e2:
                        logger.warning(f"OCR fallback call failed for pages {page_indices[:1]}: {e2}")
                        data = {"answers": []}

                confidence = _assess_confidence(data)

                # 학번/이름은 OCR로 추출하지 않음 — 사용자가 표에 직접 입력
                student = Student(
                    class_id=class_id,
                    student_number=None,
                    name=None,
                    page_indices=page_indices,
                    ocr_confidence=confidence,
                    needs_review=(confidence == "low"),
                )
                db.add(student)
                await db.flush()

                for ans_data in data.get("answers", []):
                    q_number = str(ans_data.get("question_number", ""))
                    question = questions.get(q_number)
                    if question is None:
                        continue
                    db.add(Answer(
                        student_id=student.id,
                        question_id=question.id,
                        answer_text=ans_data.get("answer_text", ""),
                    ))

                # 즉시 커밋 → 폴링에서 진행상황 확인 가능
                class_obj.students_processed += 1
                await db.commit()

                logger.info(
                    f"OCR class {class_id}: {class_obj.students_processed}/{len(groups)} 완료"
                )

            class_obj.ocr_status = "done"
            class_obj.ocr_error = None
            await db.commit()
            logger.info(f"OCR done for class {class_id}: {len(groups)} students")

        except Exception as exc:
            logger.exception(f"OCR failed for class {class_id}: {exc}")
            try:
                class_obj = await db.get(Class, class_id)
                if class_obj:
                    class_obj.ocr_status = "failed"
                    class_obj.ocr_error = str(exc)[:1000]
                    await db.commit()
            except Exception:
                pass
        finally:
            if doc is not None:
                try:
                    doc.close()
                except Exception:
                    pass
