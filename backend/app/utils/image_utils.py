import io
from pathlib import Path


def get_image_mime_type(file_path: str) -> str:
    """Determine MIME type from file extension."""
    suffix = Path(file_path).suffix.lower()
    mapping = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
    }
    return mapping.get(suffix, "image/jpeg")


def bytes_to_png(image_bytes: bytes) -> bytes:
    """Re-encode image bytes to PNG format using Pillow."""
    from PIL import Image

    img = Image.open(io.BytesIO(image_bytes))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
