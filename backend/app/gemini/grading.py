"""Batch grading of answers using Gemini."""
import asyncio
import json

from google import genai
from google.genai import types

GRADING_PROMPT_TEMPLATE = """아래는 한 문항의 채점기준과 채점할 학생 답안 목록입니다.

## 채점기준
{rubric_json}

## 학생 답안 목록
{answers_json}

각 답안을 채점기준에 따라 채점해줘.

출력 형식:
{{
  "results": [
    {{
      "answer_id": 1,
      "score": 2.0,
      "matched_criteria_ids": ["criteria_0", "criteria_1"],
      "rationale": "채점 근거 설명"
    }}
  ]
}}

주의사항:
- 모든 답안에 대해 결과를 반환
- score는 0 이상 max_score 이하의 숫자
- matched_criteria_ids는 적용된 기준의 description 또는 인덱스
- rationale은 간결하게 한국어로
"""


async def grade_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
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

    prompt = GRADING_PROMPT_TEMPLATE.format(
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
        raise ValueError(f"Gemini returned invalid JSON for grading: {exc}")

    return data.get("results", [])
