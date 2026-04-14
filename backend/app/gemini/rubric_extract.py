"""Extract exam questions and rubric from a PDF/image file using Gemini."""
import asyncio
import json
from pathlib import Path

import fitz  # PyMuPDF
from google import genai
from google.genai import types

RUBRIC_EXTRACT_PROMPT = """이 채점기준표에서 모든 문항 정보를 JSON으로 추출해줘.

출력 형식:
{
  "questions": [
    {
      "number": "1",
      "question_text": "문제 내용",
      "max_score": 2,
      "model_answer": "모범 답안",
      "criteria": [
        {"description": "채점 기준 설명", "points": 1}
      ]
    }
  ]
}

주의사항:
- 모든 문항을 빠짐없이 추출해줘
- 배점(max_score)은 숫자로
- criteria는 세부 채점 기준 목록
- 문항 번호는 "1", "2", "2-1" 등 원문 그대로
"""


def _pdf_to_images(pdf_path: str) -> list[bytes]:
    """Convert each page of a PDF to a PNG bytes object."""
    doc = fitz.open(pdf_path)
    images = []
    for page in doc:
        mat = fitz.Matrix(2.0, 2.0)  # 2x zoom for better OCR quality
        pix = page.get_pixmap(matrix=mat)
        images.append(pix.tobytes("png"))
    doc.close()
    return images


async def extract_rubric_from_file(
    client: genai.Client,
    file_path: str,
) -> dict:
    """
    Send PDF pages to Gemini and return structured rubric JSON.
    Returns: {"questions": [...]}
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        page_images = _pdf_to_images(file_path)
    elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        with open(file_path, "rb") as f:
            page_images = [f.read()]
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    # Build parts list: all page images + the prompt
    parts = []
    for img_bytes in page_images:
        parts.append(
            types.Part.from_bytes(data=img_bytes, mime_type="image/png")
        )
    parts.append(types.Part.from_text(text=RUBRIC_EXTRACT_PROMPT))

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.0-flash",
        contents=parts,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid JSON: {exc}\nRaw: {response.text[:500]}")

    if "questions" not in data:
        data = {"questions": []}

    return data
