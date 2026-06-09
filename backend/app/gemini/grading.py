"""Batch grading of answers using Gemini."""
import asyncio
import json
import logging

from google import genai
from google.genai import types

from app.gemini.prompts import GRADING_DEFAULT, render, select_template
from app.gemini.client import DEFAULT_MODEL

logger = logging.getLogger(__name__)

GRADING_BATCH_SIZE = 20
GRADING_MAX_ATTEMPTS = 3


def _grading_response_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "answer_id": {"type": "integer"},
                        "score": {"type": "number"},
                        "matched_criteria_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "rationale": {"type": "string"},
                    },
                    "required": [
                        "answer_id",
                        "score",
                        "matched_criteria_ids",
                        "rationale",
                    ],
                },
            }
        },
        "required": ["results"],
    }


def _validate_results(data: dict, answers: list[dict], max_score: float) -> list[dict]:
    results = data.get("results")
    if not isinstance(results, list):
        raise ValueError("Gemini grading response has no results list")

    expected_ids = {answer["id"] for answer in answers}
    returned_ids = [result.get("answer_id") for result in results]
    if len(returned_ids) != len(set(returned_ids)):
        raise ValueError("Gemini grading response contains duplicate answer IDs")

    missing_ids = expected_ids - set(returned_ids)
    unexpected_ids = set(returned_ids) - expected_ids
    if missing_ids or unexpected_ids:
        raise ValueError(
            "Gemini grading response answer IDs do not match the request. "
            f"Missing: {sorted(missing_ids)}, unexpected: {list(unexpected_ids)}"
        )

    for result in results:
        score = result.get("score")
        if not isinstance(score, (int, float)) or isinstance(score, bool):
            raise ValueError(f"Invalid score for answer {result.get('answer_id')}: {score}")
        if score < 0 or score > max_score:
            raise ValueError(
                f"Score out of range for answer {result.get('answer_id')}: "
                f"{score} (maximum {max_score})"
            )

    return results


async def grade_answers(
    client: genai.Client,
    rubric_json: dict,
    answers: list[dict],
    model_answer: str | None = None,
    max_score: float = 0,
    question_text: str | None = None,
    extra_instructions: str | None = None,
    prompt_override: str | None = None,
    model: str = DEFAULT_MODEL,
) -> list[dict]:
    """
    Grade a list of answers for a single question.

    answers: [{"id": int, "text": str}, ...]
    Returns: [{"answer_id", "score", "matched_criteria_ids", "rationale"}, ...]
    """
    if not answers:
        return []

    rubric_str = json.dumps(rubric_json, ensure_ascii=False, indent=2)
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
    all_results: list[dict] = []
    for start in range(0, len(answers), GRADING_BATCH_SIZE):
        batch = answers[start:start + GRADING_BATCH_SIZE]
        answers_str = json.dumps(
            [{"answer_id": a["id"], "text": a["text"]} for a in batch],
            ensure_ascii=False,
            indent=2,
        )
        prompt = render(
            template, GRADING_DEFAULT,
            question_text_section=qt_section,
            model_answer=model_answer or "(모범답안 없음)",
            max_score=max_score,
            rubric_json=rubric_str,
            answers_json=answers_str,
            extra_section=extra_section,
        )
        # 사용자 정의 프롬프트를 쓰더라도 구조화 출력 계약은 항상 유지한다.
        prompt += (
            "\n\n## 필수 출력 계약\n"
            "유효한 JSON 객체만 반환하세요. 설명이나 마크다운 코드 블록을 추가하지 마세요. "
            "위 학생 답안 목록의 모든 answer_id를 수정 없이 정확히 한 번씩 반환하고, "
            "누락하거나 중복하지 마세요."
        )

        last_error: Exception | None = None
        for attempt in range(1, GRADING_MAX_ATTEMPTS + 1):
            try:
                response = await asyncio.to_thread(
                    client.models.generate_content,
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=_grading_response_schema(),
                    ),
                )
                try:
                    data = json.loads(response.text)
                except (json.JSONDecodeError, TypeError) as exc:
                    raw = response.text[:500] if response.text else "(empty response)"
                    raise ValueError(f"Gemini returned invalid JSON for grading: {raw}") from exc

                all_results.extend(_validate_results(data, batch, max_score))
                break
            except Exception as exc:
                last_error = exc
                if attempt == GRADING_MAX_ATTEMPTS:
                    raise
                logger.warning(
                    "Gemini grading batch failed (answers %s, attempt %s/%s): %s",
                    [answer["id"] for answer in batch],
                    attempt,
                    GRADING_MAX_ATTEMPTS,
                    exc,
                )
                await asyncio.sleep(attempt)
        else:
            raise last_error or ValueError("Gemini grading failed")

    return all_results
