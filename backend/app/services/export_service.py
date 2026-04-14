"""Export exam data to Excel (.xlsx)."""
import io
from typing import Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.answer import Answer
from app.models.class_ import Class, Student
from app.models.exam import Exam, Question
from app.models.grading import Grading


async def export_answers_xlsx(db: AsyncSession, exam_id: int) -> bytes:
    """Export all student answers for an exam to Excel."""
    exam = await db.get(Exam, exam_id, options=[selectinload(Exam.questions)])
    if exam is None:
        raise ValueError(f"Exam {exam_id} not found")

    questions = sorted(exam.questions, key=lambda q: q.order_index)

    # Fetch all classes/students/answers
    classes_result = await db.execute(
        select(Class)
        .where(Class.exam_id == exam_id)
        .options(selectinload(Class.students).selectinload(Student.answers))
    )
    classes = classes_result.scalars().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "답안"

    # Header
    header = ["반", "학번", "이름"] + [f"문{q.number}" for q in questions]
    ws.append(header)
    header_font = Font(bold=True)
    for cell in ws[1]:
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for cls in classes:
        for student in cls.students:
            answer_map = {a.question_id: a.answer_text for a in student.answers}
            row = [
                cls.name,
                student.student_number or "",
                student.name or "",
            ]
            for q in questions:
                row.append(answer_map.get(q.id, ""))
            ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


async def export_gradings_xlsx(db: AsyncSession, exam_id: int) -> bytes:
    """Export all gradings for an exam to Excel."""
    exam = await db.get(Exam, exam_id, options=[selectinload(Exam.questions)])
    if exam is None:
        raise ValueError(f"Exam {exam_id} not found")

    questions = sorted(exam.questions, key=lambda q: q.order_index)

    classes_result = await db.execute(
        select(Class)
        .where(Class.exam_id == exam_id)
        .options(
            selectinload(Class.students)
            .selectinload(Student.answers)
            .selectinload(Answer.grading)
        )
    )
    classes = classes_result.scalars().all()

    wb = Workbook()
    ws = wb.active
    ws.title = "채점결과"

    header = ["반", "학번", "이름"] + [f"문{q.number}({q.max_score}점)" for q in questions] + ["합계"]
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")

    for cls in classes:
        for student in cls.students:
            grading_map: dict[int, float] = {}
            for answer in student.answers:
                g = answer.grading
                if g is not None:
                    grading_map[answer.question_id] = float(g.score)

            row = [cls.name, student.student_number or "", student.name or ""]
            total = 0.0
            for q in questions:
                score = grading_map.get(q.id, "")
                row.append(score)
                if isinstance(score, float):
                    total += score
            row.append(total)
            ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
