"""Extract exam questions and rubric from a PDF/image file using Gemini."""
import asyncio
import json
from pathlib import Path

import fitz  # PyMuPDF
from google import genai
from google.genai import types

RUBRIC_EXTRACT_PROMPT = """이 문서는 한국 학교 시험의 서답형 채점기준표입니다.

표의 컬럼 구조는 다음과 같습니다:
- 첫 번째 컬럼: 번호 (문항 번호)
- 두 번째 컬럼: 정답 또는 인정답 (모범답안)
- 세 번째 컬럼: 채점기준 (감점 조건, 부분점수 기준 등)
- 네 번째/다섯 번째 컬럼: 배점

각 문항을 아래 규칙에 따라 추출하세요:

1. 하위 문항 처리: 하나의 번호 아래 "(1)", "1)", "①" 등으로 구분된 항목은 각각 별도 문항으로 추출
   예) 번호 1의 1), 2) → number를 "1-1)", "1-2)"로 표기
   예) 번호 3의 1), 2) → "3-1)", "3-2)"로 표기

2. model_answer: 반드시 해당 하위 문항의 정답만 기재. 다른 번호의 정답 혼입 금지.

3. criteria: 해당 하위 문항의 채점기준만 기재. 감점 조건, 부분점수 기준 등을 포함.
   배점 숫자(단독)는 criteria로 쓰지 말 것.

4. max_score: 해당 하위 문항의 요소별 배점(각 항목 점수)을 사용.
   전체 배점(합계)이 아닌 각 하위 문항의 배점을 쓸 것.

5. question_text: 이 표에는 문제 내용이 없으므로 빈 문자열("")로 설정."""


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

    response_schema = {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "number": {"type": "string"},
                        "question_text": {"type": "string"},
                        "max_score": {"type": "number"},
                        "model_answer": {"type": "string"},
                        "criteria": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "description": {"type": "string"},
                                    "points": {"type": "number"},
                                },
                                "required": ["description", "points"],
                            },
                        },
                    },
                    "required": ["number", "max_score"],
                },
            }
        },
        "required": ["questions"],
    }

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=parts,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
        ),
    )

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid JSON: {exc}\nRaw: {response.text[:500]}")

    if "questions" not in data:
        data = {"questions": []}

    return data
