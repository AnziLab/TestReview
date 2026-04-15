"""OCR: extract student answers from class PDF using Gemini."""
import asyncio
import json
from pathlib import Path

import fitz  # PyMuPDF
from google import genai
from google.genai import types

def _build_ocr_prompt(question_numbers: list[str]) -> str:
    q_list = "\n".join(f"- {q}" for q in question_numbers)
    return f"""이 시험 답안지 이미지에서 학생 정보와 답안을 추출해줘.

이 시험의 문항 번호 목록 (정확히 이 번호를 사용할 것):
{q_list}

출력 형식:
{{
  "student_number": "학번",
  "name": "이름",
  "answers": [
    {{"question_number": "1-1)", "answer_text": "답안"}},
    {{"question_number": "1-2)", "answer_text": "답안"}}
  ]
}}

규칙:
- question_number는 반드시 위 목록에 있는 번호 그대로 사용
- 답안지의 각 칸을 문항 번호 순서대로 읽어서 매핑
- 답안이 없거나 빈칸이면 빈 문자열 ""
- 학번/이름이 없으면 null
- 손글씨가 불분명해도 최선을 다해 해독
- 모든 문항을 빠짐없이 포함 (빈칸도 포함)
- JSON만 반환, 다른 설명 없음"""


def _pdf_page_to_image(pdf_path: str, page_index: int) -> bytes:
    doc = fitz.open(pdf_path)
    page = doc[page_index]
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat)
    data = pix.tobytes("png")
    doc.close()
    return data


def _group_pages(total_pages: int, scan_mode: str) -> list[list[int]]:
    """Return list of page-index groups per student."""
    if scan_mode == "double":
        groups = []
        for i in range(0, total_pages, 2):
            group = [i]
            if i + 1 < total_pages:
                group.append(i + 1)
            groups.append(group)
        return groups
    # single
    return [[i] for i in range(total_pages)]


async def _call_gemini_for_student(
    client: genai.Client,
    pdf_path: str,
    page_indices: list[int],
    question_numbers: list[str],
) -> dict:
    """Call Gemini on the given pages and parse the student answer JSON."""
    parts = []
    for idx in page_indices:
        img_bytes = _pdf_page_to_image(pdf_path, idx)
        parts.append(types.Part.from_bytes(data=img_bytes, mime_type="image/png"))
    parts.append(types.Part.from_text(text=_build_ocr_prompt(question_numbers)))

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=parts,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError:
        # Fallback: return empty structure
        data = {"student_number": None, "name": None, "answers": []}

    return data


def _assess_confidence(data: dict) -> str:
    """Heuristic OCR confidence: high/medium/low."""
    if not data.get("answers"):
        return "low"
    if data.get("student_number") and data.get("name"):
        return "high"
    if data.get("student_number") or data.get("name"):
        return "medium"
    return "low"


async def ocr_class_pdf(
    client: genai.Client,
    pdf_path: str,
    scan_mode: str,
    question_numbers: list[str] | None = None,
) -> list[dict]:
    """
    Process a full class PDF and return a list of student records.

    Each record:
    {
        "student_number": str | None,
        "name": str | None,
        "page_indices": [int, ...],
        "ocr_confidence": "high"|"medium"|"low",
        "needs_review": bool,
        "answers": [{"question_number": str, "answer_text": str}]
    }
    """
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    doc.close()

    groups = _group_pages(total_pages, scan_mode)
    results = []

    q_numbers = question_numbers or []

    for page_indices in groups:
        try:
            data = await _call_gemini_for_student(client, pdf_path, page_indices, q_numbers)
        except Exception:
            try:
                data = await _call_gemini_for_student(client, pdf_path, page_indices[:1], q_numbers)
            except Exception:
                data = {"student_number": None, "name": None, "answers": []}

        confidence = _assess_confidence(data)
        needs_review = confidence == "low"

        results.append(
            {
                "student_number": data.get("student_number"),
                "name": data.get("name"),
                "page_indices": page_indices,
                "ocr_confidence": confidence,
                "needs_review": needs_review,
                "answers": data.get("answers", []),
            }
        )

    return results
