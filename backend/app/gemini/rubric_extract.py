"""Extract exam questions and rubric from a PDF/image file using Gemini."""
import asyncio
import json
from pathlib import Path

import fitz  # PyMuPDF
from google import genai
from google.genai import types

from app.gemini.prompts import RUBRIC_EXTRACT_DEFAULT, select_template


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
    prompt_override: str | None = None,
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
    prompt_text = select_template(prompt_override, RUBRIC_EXTRACT_DEFAULT)
    parts.append(types.Part.from_text(text=prompt_text))

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
