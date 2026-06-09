import httpx
from google import genai

from app.security import decrypt_api_key

DEFAULT_MODEL = "gemini-3.5-flash"
PREFERRED_MODELS = (DEFAULT_MODEL, "gemini-3-flash-preview", "gemini-2.5-flash")
MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"

NON_RETRYABLE_ERROR_MARKERS = (
    "resource_exhausted",
    "quota exceeded",
    "free_tier",
    "requestsperday",
    "prepayment credits are depleted",
    "invalid_argument",
    "permission_denied",
    "unauthenticated",
    "api key not valid",
)


def get_gemini_client(encrypted_api_key: str) -> genai.Client:
    """Decrypt user's stored API key and return an authenticated Gemini client."""
    api_key = decrypt_api_key(encrypted_api_key)
    return genai.Client(api_key=api_key)


def should_retry_gemini_error(exc: Exception) -> bool:
    """Return False for errors that another immediate request cannot resolve."""
    message = str(exc).lower()
    return not any(marker in message for marker in NON_RETRYABLE_ERROR_MARKERS)


def _developer_api_error(message: str, status: str | None, reason: str | None) -> ValueError:
    hint = ""
    combined = f"{message} {status or ''} {reason or ''}".lower()
    if "api_key_service_blocked" in combined or "api has not been used" in combined:
        hint = " Google Cloud에서 Generative Language API를 활성화하거나, AI Studio에서 만든 키를 사용하세요."
    elif "referer" in combined or "ip address" in combined:
        hint = " 이 앱은 백엔드에서 호출하므로 API 키의 HTTP 리퍼러/IP 제한을 확인하세요."
    elif "permission_denied" in combined or "forbidden" in combined:
        hint = " Vertex AI 전용 키는 현재 지원하지 않습니다. Gemini Developer API용 키인지 확인하세요."
    suffix = f" ({status}{f': {reason}' if reason else ''})" if status else ""
    return ValueError(f"Gemini Developer API 오류: {message}{suffix}{hint}")


async def list_gemini_models(encrypted_api_key: str) -> list[dict]:
    """List text-generating models from the Gemini Developer API."""
    api_key = decrypt_api_key(encrypted_api_key)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            MODELS_URL,
            headers={"x-goog-api-key": api_key},
            params={"pageSize": 1000},
        )
    if not response.is_success:
        try:
            error = response.json().get("error", {})
            message = error.get("message") or response.text
            status = error.get("status")
            details = error.get("details") or []
            reason = next(
                (
                    detail.get("reason")
                    for detail in details
                    if isinstance(detail, dict) and detail.get("reason")
                ),
                None,
            )
            raise _developer_api_error(message, status, reason)
        except (ValueError, TypeError) as exc:
            if isinstance(exc, ValueError) and str(exc).startswith("Gemini Developer API 오류:"):
                raise
            raise ValueError(
                f"Gemini Developer API 오류 ({response.status_code}): {response.text[:500]}"
            ) from exc

    result = []
    for model in response.json().get("models", []):
        name = (model.get("name") or "").removeprefix("models/")
        actions = model.get("supportedGenerationMethods") or []
        if (
            not name.startswith("gemini-")
            or "generateContent" not in actions
            or any(part in name for part in ("embedding", "image", "live", "tts", "audio"))
        ):
            continue
        result.append({
            "id": name,
            "name": model.get("displayName") or name,
            "description": model.get("description"),
        })
    return sorted(result, key=lambda item: item["id"], reverse=True)


def choose_default_model(models: list[dict]) -> str:
    available = {model["id"] for model in models}
    for model in PREFERRED_MODELS:
        if model in available:
            return model
    if not models:
        raise ValueError("이 API 키로 사용할 수 있는 Gemini 텍스트 생성 모델이 없습니다.")
    return models[0]["id"]
