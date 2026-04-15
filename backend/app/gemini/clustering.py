"""Cluster student answers using Gemini to refine rubrics."""
import asyncio
import json

from google import genai
from google.genai import types

CLUSTERING_PROMPT_TEMPLATE = """아래는 한 문항의 정보와 학생 답안 목록입니다.

{question_text_section}## 모범답안
{model_answer}

## 채점기준 (배점: {max_score}점)
{rubric_json}

## 학생 답안 목록
{answers_json}

위 학생 답안들을 유사한 유형으로 클러스터링하고,
각 클러스터에 대해 현재 채점기준으로 점수 판단이 가능한지 분류해줘.

채점 원칙:
- 모범답안과 동일하거나 내용상 동등한 답안은 정답 처리
- 문장형 답안은 핵심 의미가 맞으면 정답으로 인정
- 채점기준이 "정답만 인정"이라도 모범답안을 기준으로 내용의 정확성을 판단할 것
- 채점기준에 명시되지 않은 유형(부분 정답, 다른 표현의 정답 등)은 judgable=false로 표시
- 빈칸, "모르겠다", "모름", "?" 등 무응답/포기 답안은 채점기준과 무관하게 0점 처리 (judgable=true, suggested_score=0)
{extra_section}
출력 형식:
{{
  "clusters": [
    {{
      "label": "클러스터 레이블 (핵심 특징 요약)",
      "representative_text": "대표 답안 텍스트",
      "member_ids": [1, 2, 3],
      "judgable": true,
      "suggested_score": 2.0,
      "reason": "판단 근거 또는 판단 불가 이유"
    }}
  ]
}}

주의사항:
- member_ids는 제공된 답안의 id 값
- judgable=true: 모범답안 기준으로 명확히 점수 판단 가능
- judgable=false: 채점기준으로 처리되지 않는 새로운 유형이거나 부분 정답
- suggested_score는 0 이상 {max_score} 이하
- 모든 답안이 정확히 하나의 클러스터에 속해야 함
"""


async def cluster_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
    model_answer: str | None = None,
    max_score: float = 0,
    question_text: str | None = None,
    extra_instructions: str | None = None,
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
    prompt = CLUSTERING_PROMPT_TEMPLATE.format(
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
