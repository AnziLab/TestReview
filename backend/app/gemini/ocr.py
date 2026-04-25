"""OCR: extract student answers from class PDF using Gemini."""
import asyncio
import json
from pathlib import Path

import fitz  # PyMuPDF
from google import genai
from google.genai import types

def _build_ocr_prompt(question_numbers: list[str]) -> str:
    q_list = "\n".join(f"- {q}" for q in question_numbers)
    return f"""이 시험 답안지 이미지에서 학생 답안을 추출해줘.

이 시험의 문항 번호 목록 (정확히 이 번호를 사용할 것):
{q_list}

출력 형식:
{{
  "answers": [
    {{"question_number": "1-1)", "answer_text": "답안"}},
    {{"question_number": "1-2)", "answer_text": "답안"}}
  ]
}}

규칙:
- question_number는 반드시 위 목록에 있는 번호 그대로 사용
- 답안지의 각 칸을 문항 번호 순서대로 읽어서 매핑
- 답안이 없거나 빈칸이면 빈 문자열 ""
- **취소선이 그어진 글자는 무시할 것**. 학생이 답을 고치며 글자 위에 줄을 그어 지운 경우(한 줄/두 줄/여러 줄 가로선, 사선, 지그재그 포함), 그 글자는 답안에 포함하지 않음. 옆이나 아래에 새로 쓴 답안만 추출.
- 학생 정보(학번/이름)는 추출하지 않음
- 손글씨가 불분명해도 최선을 다해 해독
- 모든 문항을 빠짐없이 포함 (빈칸도 포함)
- JSON만 반환, 다른 설명 없음"""


def _render_page(doc: fitz.Document, page_index: int) -> bytes:
    """열려있는 doc에서 페이지 하나를 PNG bytes로 렌더링."""
    page = doc[page_index]
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat)
    return pix.tobytes("png")


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
    doc: fitz.Document,
    page_indices: list[int],
    question_numbers: list[str],
) -> dict:
    """열려있는 doc에서 해당 페이지만 렌더링해 Gemini 호출."""
    parts = []
    for idx in page_indices:
        img_bytes = _render_page(doc, idx)
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
        data = {"answers": []}

    return data


def _assess_confidence(data: dict) -> str:
    """Heuristic OCR confidence based on answers only.

    high   : 답안이 있고, 빈칸 비율이 절반 미만
    medium : 답안이 있지만 절반 이상이 빈칸
    low    : 답안이 하나도 없음
    """
    answers = data.get("answers") or []
    if not answers:
        return "low"
    blank = sum(1 for a in answers if not (a.get("answer_text") or "").strip())
    if blank * 2 >= len(answers):
        return "medium"
    return "high"


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
        "page_indices": [int, ...],
        "ocr_confidence": "high"|"medium"|"low",
        "needs_review": bool,
        "answers": [{"question_number": str, "answer_text": str}]
    }
    학번/이름은 OCR로 추출하지 않으며, 사용자가 직접 입력.
    """
    # PDF 한 번만 열고 전체 처리 후 닫음
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    groups = _group_pages(total_pages, scan_mode)
    results = []
    q_numbers = question_numbers or []

    for page_indices in groups:
        try:
            data = await _call_gemini_for_student(client, doc, page_indices, q_numbers)
        except Exception:
            try:
                data = await _call_gemini_for_student(client, doc, page_indices[:1], q_numbers)
            except Exception:
                data = {"answers": []}

        confidence = _assess_confidence(data)
        needs_review = confidence == "low"

        results.append(
            {
                "page_indices": page_indices,
                "ocr_confidence": confidence,
                "needs_review": needs_review,
                "answers": data.get("answers", []),
            }
        )

    doc.close()
    return results
