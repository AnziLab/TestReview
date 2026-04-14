import asyncio

from google import genai

from app.security import decrypt_api_key


def get_gemini_client(encrypted_api_key: str) -> genai.Client:
    """Decrypt user's stored API key and return an authenticated Gemini client."""
    api_key = decrypt_api_key(encrypted_api_key)
    return genai.Client(api_key=api_key)


async def ping_gemini(encrypted_api_key: str) -> bool:
    """Return True if the API key is valid (simple model list call)."""
    try:
        client = get_gemini_client(encrypted_api_key)
        # A lightweight call: list models
        await asyncio.to_thread(client.models.list)
        return True
    except Exception:
        return False
