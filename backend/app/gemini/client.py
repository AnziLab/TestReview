import asyncio

from google import genai

from app.security import decrypt_api_key


def get_gemini_client(encrypted_api_key: str) -> genai.Client:
    """Decrypt user's stored API key and return an authenticated Gemini client."""
    api_key = decrypt_api_key(encrypted_api_key)
    return genai.Client(api_key=api_key)


async def ping_gemini(encrypted_api_key: str) -> bool:
    """Return True if the API key is valid."""
    try:
        client = get_gemini_client(encrypted_api_key)
        # generate_content with minimal input to verify the key actually works
        def _ping():
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents="hi",
            )
            return response.text is not None
        return await asyncio.to_thread(_ping)
    except Exception:
        return False
