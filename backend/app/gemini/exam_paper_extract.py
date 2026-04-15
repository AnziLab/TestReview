"""Extract question text (지문+질문) from exam paper PDF for a given question range."""
import asyncio
import json
import re
from pathlib import Path

import fitz
from google import genai
from google.genai import types


def _build_prompt(question_from: int, question_to: int) -> str:
    return f"""이 문서는 한국 학교 시험지입니다.

{question_from}번부터 {question_to}번 문항의 내용을 추출하세요.

규칙:
- 각 문항 번호(1, 2, 3 ... {question_to})마다 그 문항에 필요한 모든 텍스트를 추출
- 지문(reading passage)이 있으면 지문 전체를 해당 문항 텍스트에 포함
- 하위 문항(예: 3-(1), 3-(2))은 상위 문항(3번)과 같은 지문을 공유하므로,
  상위 문항 번호(정수)를 키로 지문+질문 전체를 저장
- 지문이 여러 문항에 걸쳐 있으면 각 문항에 중복 저장해도 됨

출력 형식 (JSON):
{{
  "questions": [
    {{
      "number": 1,
      "text": "문항 1의 지문 및 질문 전체 텍스트"
    }},
    {{
      "number": 2,
      "text": "문항 2의 지문 및 질문 전체 텍스트"
    }}
  ]
}}

- number는 정수 (1, 2, 3 ...)
- text에는 해당 문항을 이해하는 데 필요한 모든 내용 포함 (지문, 보기, 질문 지시문 등)
- {question_from}번 미만 또는 {question_to}번 초과 문항은 무시
- JSON만 반환, 다른 설명 없음"""


async def extract_exam_paper(
    client: genai.Client,
    file_path: str,
    question_from: int,
    question_to: int,
) -> dict[int, str]:
    """
    Returns {question_number (int): question_text (str)} for numbers in [from, to].
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        doc = fitz.open(file_path)
        images = []
        for page in doc:
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            images.append(pix.tobytes("png"))
        doc.close()
    else:
        with open(file_path, "rb") as f:
            images = [f.read()]

    parts = [types.Part.from_bytes(data=img, mime_type="image/png") for img in images]
    parts.append(types.Part.from_text(text=_build_prompt(question_from, question_to)))

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=parts,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()

    data = json.loads(raw)
    result: dict[int, str] = {}
    for item in data.get("questions", []):
        num = item.get("number")
        text = item.get("text", "")
        if isinstance(num, int) and question_from <= num <= question_to and text:
            result[num] = text

    return result
