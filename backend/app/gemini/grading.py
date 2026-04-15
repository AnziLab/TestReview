"""Batch grading of answers using Gemini."""
import asyncio
import json

from google import genai
from google.genai import types

GRADING_PROMPT_TEMPLATE = """아래는 한 문항의 정보와 채점할 학생 답안 목록입니다.

{question_text_section}## 모범답안
{model_answer}

## 채점기준 (배점: {max_score}점)
{rubric_json}

## 학생 답안 목록
{answers_json}

각 답안을 채점해줘.

채점 원칙:
1. **내용 정확성 우선**: 문법이 맞아도 내용이 틀리면 오답. 모범답안의 의미/조건을 충족해야 정답.
2. 모범답안과 내용상 동등한 표현은 정답으로 인정.
3. 채점기준에 감점 조건이 있으면 그에 따라 감점.
4. 빈칸, "모르겠다", "모름" 등 무응답은 0점.
{extra_section}
출력 형식:
{{
  "results": [
    {{
      "answer_id": 1,
      "score": 2.0,
      "matched_criteria_ids": ["criteria_0"],
      "rationale": "채점 근거 (내용 정확성과 감점 이유 명시)"
    }}
  ]
}}

주의사항:
- 모든 답안에 대해 결과를 반환
- score는 0 이상 {max_score} 이하
- rationale은 한국어로, 내용이 맞는지 틀린지를 명확히 설명
"""


async def grade_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
    model_answer: str | None = None,
    max_score: float = 0,
    question_text: str | None = None,
    extra_instructions: str | None = None,
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

    prompt = GRADING_PROMPT_TEMPLATE.format(
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
