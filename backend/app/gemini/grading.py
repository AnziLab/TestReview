"""Batch grading of answers using Gemini."""
import asyncio
import json

from google import genai
from google.genai import types

from app.gemini.prompts import GRADING_DEFAULT, render, select_template


async def grade_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
    model_answer: str | None = None,
    max_score: float = 0,
    question_text: str | None = None,
    extra_instructions: str | None = None,
    prompt_override: str | None = None,
) -> list[dict]:
    """
    Grade a list of answers for a single question.

    answers: [{"id": int, "text": str}, ...]
    Returns: [{"answer_id", "score", "matched_criteria_ids", "rationale"}, ...]
    """
    if not answers:
        return []

    rubric_str = json.dumps(rubric_json, ensure_ascii=False, indent=2)
    answers_str = json.dumps(
        [{"answer_id": a["id"], "text": a["text"]} for a in answers],
        ensure_ascii=False,
        indent=2,
    )

    # 문항 맥락이 있으면 포함
    qt_section = f"## 문항 내용 (맥락)\n{question_text.strip()}\n\n" if question_text and question_text.strip() else ""

    # 언어 지시 + 커스텀 지시사항
    extra_section = (
        "\n추가 채점 원칙:\n"
        "- 문항에서 특정 언어(영어/한국어 등)로 쓰라고 명시한 경우, 채점기준에 별도 규정이 없어도 지시된 언어를 따르지 않으면 감점 또는 오답 처리\n"
    )
    if extra_instructions and extra_instructions.strip():
        extra_section += f"- {extra_instructions.strip()}\n"

    template = select_template(prompt_override, GRADING_DEFAULT)
    prompt = render(
        template, GRADING_DEFAULT,
        question_text_section=qt_section,
        model_answer=model_answer or "(모범답안 없음)",
        max_score=max_score,
        rubric_json=rubric_str,
        answers_json=answers_str,
        extra_section=extra_section,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    try:
        data = json.loads(response.text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid JSON for grading: {exc}")

    return data.get("results", [])
