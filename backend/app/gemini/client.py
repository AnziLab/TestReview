import asyncio

from google import genai

from app.security import decrypt_api_key

DEFAULT_MODEL = "gemini-3.5-flash"
PREFERRED_MODELS = (DEFAULT_MODEL, "gemini-3-flash-preview", "gemini-2.5-flash")


def get_gemini_client(encrypted_api_key: str) -> genai.Client:
    """Decrypt user's stored API key and return an authenticated Gemini client."""
    api_key = decrypt_api_key(encrypted_api_key)
    return genai.Client(api_key=api_key)


async def list_gemini_models(encrypted_api_key: str) -> list[dict]:
    """List text-generating Gemini models available to this API key."""
    client = get_gemini_client(encrypted_api_key)
    models = await asyncio.to_thread(lambda: list(client.models.list()))
    result = []
    for model in models:
        name = (getattr(model, "name", "") or "").removeprefix("models/")
        actions = (
            getattr(model, "supported_actions", None)
            or getattr(model, "supported_generation_methods", None)
            or []
        )
        if (
            not name.startswith("gemini-")
            or (actions and "generateContent" not in actions)
            or any(part in name for part in ("embedding", "image", "live", "tts", "audio"))
        ):
            continue
        result.append({
            "id": name,
            "name": getattr(model, "display_name", None) or name,
            "description": getattr(model, "description", None),
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
