"""Cluster student answers using Gemini to refine rubrics."""
import asyncio
import json

from google import genai
from google.genai import types

from app.gemini.prompts import CLUSTERING_DEFAULT, render, select_template


async def cluster_answers(
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
    Cluster answers and return list of cluster dicts.

    answers: [{"id": int, "text": str}, ...]
    Returns: [{"label", "representative_text", "member_ids", "judgable",
               "suggested_score", "reason"}, ...]
    """
    if not answers:
        return []

    rubric_str = json.dumps(rubric_json, ensure_ascii=False, indent=2)
    answers_str = json.dumps(
        [{"id": a["id"], "text": a["text"]} for a in answers],
        ensure_ascii=False,
        indent=2,
    )

    qt_section = f"## 문항 내용 (맥락)\n{question_text.strip()}\n\n" if question_text and question_text.strip() else ""
    extra_section = (
        "\n추가 원칙:\n"
        "- 문항에서 특정 언어로 쓰라고 명시한 경우, 지시된 언어를 따르지 않은 답안은 오답 클러스터로 분류\n"
    )
    if extra_instructions and extra_instructions.strip():
        extra_section += f"- {extra_instructions.strip()}\n"

    template = select_template(prompt_override, CLUSTERING_DEFAULT)
    prompt = render(
        template, CLUSTERING_DEFAULT,
        question_text_section=qt_section,
        extra_section=extra_section,
        model_answer=model_answer or "(모범답안 없음)",
        max_score=max_score,
        rubric_json=rubric_str,
        answers_json=answers_str,
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
        raise ValueError(f"Gemini returned invalid JSON for clustering: {exc}")

    return data.get("clusters", [])
