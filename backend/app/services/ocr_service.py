"""Background service: OCR a class PDF and populate students + answers."""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.gemini.client import get_gemini_client
from app.gemini.ocr import ocr_class_pdf
from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Question
from app.models.user import User

logger = logging.getLogger(__name__)


async def run_ocr(class_id: int, teacher_id: int) -> None:
    """BackgroundTask: OCR class PDF, create students and answers."""
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
        await db.commit()

        try:
            client = get_gemini_client(teacher.gemini_api_key_encrypted)
            student_records = await ocr_class_pdf(
                client,
                class_obj.source_pdf_path,
                class_obj.scan_mode,
            )

            # Load questions for this exam
            q_result = await db.execute(
                select(Question).where(Question.exam_id == class_obj.exam_id)
            )
            questions = {q.number: q for q in q_result.scalars().all()}

            # Delete existing students for re-processing
            existing_students = await db.execute(
                select(Student).where(Student.class_id == class_id)
            )
            for st in existing_students.scalars().all():
                await db.delete(st)
            await db.flush()

            for record in student_records:
                student = Student(
                    class_id=class_id,
                    student_number=record["student_number"],
                    name=record["name"],
                    page_indices=record["page_indices"],
                    ocr_confidence=record["ocr_confidence"],
                    needs_review=record["needs_review"],
                )
                db.add(student)
                await db.flush()  # get student.id

                for ans_data in record.get("answers", []):
                    q_number = str(ans_data.get("question_number", ""))
                    question = questions.get(q_number)
                    if question is None:
                        continue
                    answer = Answer(
                        student_id=student.id,
                        question_id=question.id,
                        answer_text=ans_data.get("answer_text", ""),
                    )
                    db.add(answer)

            class_obj.ocr_status = "done"
            class_obj.ocr_error = None
            await db.commit()
            logger.info(f"OCR done for class {class_id}: {len(student_records)} students")

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
