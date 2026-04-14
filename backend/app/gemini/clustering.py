"""Cluster student answers using Gemini to refine rubrics."""
import asyncio
import json

from google import genai
from google.genai import types

CLUSTERING_PROMPT_TEMPLATE = """아래는 한 문항의 채점기준과 학생 답안 목록입니다.

## 채점기준
{rubric_json}

## 학생 답안 목록
{answers_json}

위 답안들을 유사한 유형으로 클러스터링하고,
각 클러스터가 현재 채점기준으로 판단 가능한지 분류해줘.

출력 형식:
{{
  "clusters": [
    {{
      "label": "클러스터 레이블 (핵심 특징 요약)",
      "representative_text": "대표 답안 텍스트",
      "member_ids": [1, 2, 3],
      "judgable": true,
      "suggested_score": 2.0,
      "reason": "이 점수를 부여하는 이유"
    }}
  ]
}}

주의사항:
- member_ids는 제공된 답안의 id 값
- judgable: 현재 채점기준으로 명확히 판단 가능하면 true, 기준이 모호하거나 새로운 유형이면 false
- judgable=false인 경우 suggested_score는 null 가능
- 모든 답안이 정확히 하나의 클러스터에 속해야 함
"""


async def cluster_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
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

    prompt = CLUSTERING_PROMPT_TEMPLATE.format(
        rubric_json=rubric_str,
        answers_json=answers_str,
    )

    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.0-flash",
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
