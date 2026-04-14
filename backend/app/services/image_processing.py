import base64
import io
import json
import re
from typing import List, Dict

from PIL import Image


async def detect_regions_gemini(image_bytes: bytes, api_key: str, model: str = "gemini-2.5-flash") -> List[Dict[str, float]]:
    """
    Use Gemini to detect answer regions in an exam sheet image.
    Returns list of {x, y, width, height} as fractions (0.0–1.0).
    """
    import asyncio

    # Gemini 2.5 native bounding box detection.
    # The model returns boxes as [y_min, x_min, y_max, x_max] normalized to 0–1000.
    prompt = (
        "이 이미지는 한국 중고등학교 서답형(주관식) 시험 답안지입니다.\n"
        "학생이 답을 직접 쓰는 빈 칸(답란)을 모두 감지하고 bounding box를 반환하세요.\n\n"
        "감지 규칙:\n"
        "- 실제 답을 쓰는 빈 칸만 포함 (가로로 긴 직사각형)\n"
        "- 문항 번호, 배점, 점수 칸, 제목, 학교명 등은 제외\n"
        "- 하나의 문항에 여러 칸이 있으면 각각 별도 box\n\n"
        "다음 JSON 형식으로만 응답하세요 (좌표는 0~1000 정수):\n"
        '[{"box_2d": [y_min, x_min, y_max, x_max], "label": "답란"}]\n\n'
        "JSON 배열만 반환하고 다른 설명은 추가하지 마세요."
    )

    loop = asyncio.get_running_loop()

    def _sync():
        from google import genai
        from google.genai import types
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        image_part = types.Part.from_bytes(data=b64, mime_type="image/png")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model,
            contents=[image_part, prompt],
        )
        return response.text.strip()

    raw = await loop.run_in_executor(None, _sync)

    try:
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            raw = raw.strip()
        items = json.loads(raw)
        regions = []
        for item in items:
            box = item.get("box_2d", [])
            if len(box) != 4:
                continue
            y_min, x_min, y_max, x_max = [v / 1000.0 for v in box]
            x = max(0.0, min(x_min, 1.0))
            y = max(0.0, min(y_min, 1.0))
            w = max(0.01, min(x_max - x_min, 1.0 - x))
            h = max(0.01, min(y_max - y_min, 1.0 - y))
            regions.append({
                "x": round(x, 4),
                "y": round(y, 4),
                "width": round(w, 4),
                "height": round(h, 4),
            })
        # Sort top-to-bottom, left-to-right
        regions.sort(key=lambda r: (round(r["y"] * 20), r["x"]))
        return regions
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return []


def crop_region(
    image_path: str,
    x: float,
    y: float,
    width: float,
    height: float,
) -> bytes:
    """
    Crop a region from an image using percentage-based coordinates.
    x, y, width, height are all in range 0.0–1.0 relative to image dimensions.
    Returns the cropped region as PNG bytes.
    """
    img = Image.open(image_path)
    img_w, img_h = img.size

    px = int(x * img_w)
    py = int(y * img_h)
    pw = int(width * img_w)
    ph = int(height * img_h)

    px = max(0, min(px, img_w - 1))
    py = max(0, min(py, img_h - 1))
    pw = max(1, min(pw, img_w - px))
    ph = max(1, min(ph, img_h - py))

    cropped = img.crop((px, py, px + pw, py + ph))

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
