import asyncio
import base64
import json
import re
from typing import Optional

from google import genai
from google.genai import types


class GeminiClient:
    """Google Gemini multimodal API client for OCR and grading."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model
        self._client = genai.Client(api_key=api_key)

    # ─── Public helpers ───────────────────────────────────────────────────────

    async def recognize_handwriting(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        """
        Send full page image + region coords to Gemini, return [{region_id, text, confidence}].
        One API call per page with all regions listed by coordinate.
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._recognize_handwriting_sync, image_bytes, regions)

    async def evaluate_answer(
        self,
        student_answer: str,
        model_answer: str,
        rubric: str,
        max_score: float,
    ) -> dict:
        """
        Grade a student answer against the model answer and rubric.

        Returns:
            {
                "score": float,
                "feedback": str,
                "is_ambiguous": bool,
                "ambiguity_reason": str | None,
            }
        """
        prompt = self._build_grading_prompt(student_answer, model_answer, rubric, max_score)
        loop = asyncio.get_running_loop()
        raw = await loop.run_in_executor(None, self._text_request_sync, prompt)
        return self._parse_grading_response(raw, max_score)

    # ─── Sync implementations (wrapped in executor) ───────────────────────────

    def _recognize_handwriting_sync(self, image_bytes: bytes, regions: list[dict]) -> list[dict]:
        if not regions:
            return []

        # Build a numbered list of regions with their coordinates for the prompt
        region_lines = []
        for i, r in enumerate(regions, start=1):
            region_lines.append(
                f"{i}. 문항 '{r['question_number']}' "
                f"(x={r['x']:.4f}, y={r['y']:.4f}, "
                f"w={r['width']:.4f}, h={r['height']:.4f})"
            )
        region_desc = "\n".join(region_lines)

        prompt = (
            "이 시험지 이미지에서 아래에 나열된 각 답안 영역의 손글씨를 읽어주세요. "
            "좌표는 이미지 크기 대비 비율(0.0~1.0)입니다. "
            "각 영역의 텍스트만 반환하고, 정확히 다음 JSON 형식으로 응답해주세요:\n"
            '{"results": [{"index": 1, "text": "..."}, {"index": 2, "text": "..."}, ...]}\n\n'
            "영역 목록:\n" + region_desc + "\n\n"
            "텍스트를 읽을 수 없는 경우 해당 영역의 text를 빈 문자열로 반환하세요. "
            "JSON만 반환하고 다른 설명은 추가하지 마세요."
        )

        b64_data = base64.standard_b64encode(image_bytes).decode("utf-8")
        image_part = types.Part.from_bytes(data=b64_data, mime_type="image/png")

        response = self._client.models.generate_content(
            model=self.model,
            contents=[image_part, prompt],
        )
        raw = response.text.strip()

        # Parse JSON response
        try:
            if raw.startswith("```"):
                raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
                raw = re.sub(r"\n?```$", "", raw)
                raw = raw.strip()
            data = json.loads(raw)
            index_to_text = {item["index"]: item.get("text", "") for item in data.get("results", [])}
        except (json.JSONDecodeError, KeyError, TypeError):
            index_to_text = {}

        results = []
        for i, r in enumerate(regions, start=1):
            text = index_to_text.get(i, "")
            results.append({
                "region_id": r["id"],
                "text": text,
                "confidence": 0.9 if text else 0.0,
            })

        return results

    def _text_request_sync(self, prompt: str) -> str:
        response = self._client.models.generate_content(
            model=self.model,
            contents=prompt,
        )
        return response.text.strip()

    # ─── Prompt & response parsing ────────────────────────────────────────────

    @staticmethod
    def _build_grading_prompt(
        student_answer: str,
        model_answer: str,
        rubric: str,
        max_score: float,
    ) -> str:
        return f"""당신은 시험 채점 전문가입니다. 학생의 답안을 채점 기준에 따라 평가해주세요.

[모범 답안]
{model_answer}

[채점 기준]
{rubric}

[최대 점수]
{max_score}점

[학생 답안]
{student_answer}

다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{{
  "score": <획득 점수 (숫자)>,
  "feedback": "<채점 근거 및 피드백 (한국어)>",
  "is_ambiguous": <true 또는 false>,
  "ambiguity_reason": "<모호한 이유 (is_ambiguous가 true일 때만, 아니면 null)>"
}}

is_ambiguous를 true로 표시해야 하는 경우:
1. 채점 기준이 이 유형의 답안을 명확하게 다루지 않을 때
2. 손글씨 인식이 불확실하여 답안 내용이 불분명할 때
3. 부분 정답이지만 채점 기준이 이 경우를 명시적으로 다루지 않을 때
4. 답안이 다양하게 해석될 수 있을 때

JSON만 반환하고 다른 설명은 추가하지 마세요."""

    @staticmethod
    def _parse_grading_response(raw: str, max_score: float) -> dict:
        """Parse LLM grading response, with fallback for malformed JSON."""
        text = raw.strip()
        if text.startswith("```"):
            text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
            text = text.strip()

        try:
            data = json.loads(text)
            score = float(data.get("score", 0))
            score = max(0.0, min(score, max_score))
            return {
                "score": score,
                "feedback": str(data.get("feedback", "")),
                "is_ambiguous": bool(data.get("is_ambiguous", False)),
                "ambiguity_reason": data.get("ambiguity_reason") or None,
            }
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            score_match = re.search(r'"score"\s*:\s*([0-9.]+)', text)
            ambiguous_match = re.search(r'"is_ambiguous"\s*:\s*(true|false)', text, re.IGNORECASE)
            reason_match = re.search(r'"ambiguity_reason"\s*:\s*"([^"]*)"', text)
            feedback_match = re.search(r'"feedback"\s*:\s*"([^"]*)"', text)

            score = float(score_match.group(1)) if score_match else 0.0
            score = max(0.0, min(score, max_score))
            is_ambiguous = (
                ambiguous_match.group(1).lower() == "true" if ambiguous_match else True
            )
            return {
                "score": score,
                "feedback": feedback_match.group(1) if feedback_match else "자동 채점 파싱 오류",
                "is_ambiguous": is_ambiguous,
                "ambiguity_reason": reason_match.group(1) if reason_match else "LLM 응답 파싱 실패",
            }
