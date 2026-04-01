import base64
import json
import re
from typing import Optional

from fastapi import HTTPException


class LLMClient:
    """Abstraction over Anthropic and OpenAI multimodal APIs."""

    def __init__(self, provider: str, api_key: str, model: Optional[str] = None):
        """
        provider: 'anthropic' or 'openai'
        api_key:  the raw API key
        model:    model name override; if None a sensible default is chosen
        """
        self.provider = provider.lower()
        self.api_key = api_key

        if self.provider == "anthropic":
            self.model = model or "claude-opus-4-5"
        elif self.provider == "openai":
            self.model = model or "gpt-5.4-nano"
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")

    # ─── Public helpers ───────────────────────────────────────────────────────

    async def recognize_handwriting(self, image_bytes: bytes, mime_type: str = "image/png") -> str:
        """
        Send a cropped answer-region image to the multimodal LLM.
        Returns the recognized text (OCR result).
        """
        prompt = (
            "이 이미지에 있는 손글씨를 정확하게 읽어주세요. "
            "텍스트만 반환해주세요. 추가 설명 없이 손글씨 내용만 반환하세요."
        )

        if self.provider == "anthropic":
            return await self._anthropic_image_request(image_bytes, mime_type, prompt)
        else:
            return await self._openai_image_request(image_bytes, mime_type, prompt)

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

        if self.provider == "anthropic":
            raw = await self._anthropic_text_request(prompt)
        else:
            raw = await self._openai_text_request(prompt)

        return self._parse_grading_response(raw, max_score)

    # ─── Anthropic implementation ─────────────────────────────────────────────

    async def _anthropic_image_request(
        self, image_bytes: bytes, mime_type: str, prompt: str
    ) -> str:
        try:
            import anthropic
        except ImportError:
            raise HTTPException(status_code=500, detail="anthropic package not installed")

        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        message = await client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        return message.content[0].text.strip()

    async def _anthropic_text_request(self, prompt: str) -> str:
        try:
            import anthropic
        except ImportError:
            raise HTTPException(status_code=500, detail="anthropic package not installed")

        client = anthropic.AsyncAnthropic(api_key=self.api_key)
        message = await client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()

    # ─── OpenAI implementation ────────────────────────────────────────────────

    async def _openai_image_request(
        self, image_bytes: bytes, mime_type: str, prompt: str
    ) -> str:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise HTTPException(status_code=500, detail="openai package not installed")

        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64}"

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "high"},
                        },
                    ],
                }
            ],
        )
        return response.choices[0].message.content.strip()

    async def _openai_text_request(self, prompt: str) -> str:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise HTTPException(status_code=500, detail="openai package not installed")

        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content.strip()

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
        # Strip markdown code fences if present
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
            # Best-effort extraction
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
