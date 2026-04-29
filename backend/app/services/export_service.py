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

    # 각 문항당 [점수, 채점이유] 두 컬럼
    header = ["반", "학번", "이름"]
    for q in questions:
        header.append(f"문{q.number}({q.max_score}점)")
        header.append(f"문{q.number} 채점이유")
    header.append("합계")
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(horizontal="center")

    for cls in classes:
        for student in cls.students:
            score_map: dict[int, float] = {}
            rationale_map: dict[int, str] = {}
            for answer in student.answers:
                g = answer.grading
                if g is not None:
                    score_map[answer.question_id] = float(g.score)
                    rationale_map[answer.question_id] = g.rationale or ""

            row: list = [cls.name, student.student_number or "", student.name or ""]
            total = 0.0
            for q in questions:
                score = score_map.get(q.id, "")
                row.append(score)
                row.append(rationale_map.get(q.id, ""))
                if isinstance(score, float):
                    total += score
            row.append(total)
            ws.append(row)

    # 컬럼 너비 + 채점이유 셀 텍스트 줄바꿈
    from openpyxl.utils import get_column_letter
    ws.column_dimensions[get_column_letter(1)].width = 10  # 반
    ws.column_dimensions[get_column_letter(2)].width = 10  # 학번
    ws.column_dimensions[get_column_letter(3)].width = 10  # 이름
    # 4번부터 문항별 [점수, 이유] 반복
    col = 4
    for _ in questions:
        ws.column_dimensions[get_column_letter(col)].width = 10      # 점수
        ws.column_dimensions[get_column_letter(col + 1)].width = 40  # 이유
        col += 2
    ws.column_dimensions[get_column_letter(col)].width = 10  # 합계

    # 채점이유 셀에 자동 줄바꿈 적용 (header 제외, 데이터 row만)
    rationale_cols = [4 + i * 2 + 1 for i in range(len(questions))]
    wrap = Alignment(wrap_text=True, vertical="top")
    for row_idx in range(2, ws.max_row + 1):
        for c in rationale_cols:
            ws.cell(row=row_idx, column=c).alignment = wrap

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
