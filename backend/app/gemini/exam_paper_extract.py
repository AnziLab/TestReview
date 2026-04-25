"""Extract question text (지문+질문) from exam paper PDF for a given question range."""
import asyncio
import json
import re
from pathlib import Path

import fitz
from google import genai
from google.genai import types

from app.gemini.prompts import EXAM_PAPER_EXTRACT_DEFAULT, render, select_template


def _build_prompt(
    question_from: int,
    question_to: int,
    template_override: str | None = None,
) -> str:
    template = select_template(template_override, EXAM_PAPER_EXTRACT_DEFAULT)
    return render(
        template, EXAM_PAPER_EXTRACT_DEFAULT,
        question_from=question_from,
        question_to=question_to,
    )


async def extract_exam_paper(
    client: genai.Client,
    file_path: str,
    question_from: int,
    question_to: int,
    prompt_override: str | None = None,
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
    parts.append(types.Part.from_text(text=_build_prompt(question_from, question_to, prompt_override)))

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
