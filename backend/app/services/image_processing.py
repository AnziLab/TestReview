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

    prompt = (
        "이 이미지는 한국 중고등학교 서답형(주관식) 시험 답안지입니다.\n"
        "표 형태로 구성되어 있으며, 각 행에 문항 번호와 학생이 직접 답을 쓰는 빈 칸이 있습니다.\n\n"
        "답안을 작성하는 빈 칸(답란)만 정확히 찾아주세요.\n"
        "각 빈 칸의 위치를 이미지 전체 크기 대비 비율(0.0~1.0)로 반환하세요.\n\n"
        "주의사항:\n"
        "- 문항 번호, 배점, 점수 칸, 제목, 학교명 등은 제외\n"
        "- 실제 답을 쓰는 빈 칸만 포함 (가로로 긴 직사각형 형태)\n"
        "- 하나의 문항에 여러 빈 칸이 있으면 각각 별도 영역으로 처리\n"
        "- 빈 칸의 경계선을 정확히 포함하도록 좌표 지정\n"
        "- 위에서 아래, 왼쪽에서 오른쪽 순서로 정렬\n\n"
        "정확히 다음 JSON 형식으로만 응답하세요:\n"
        '{"regions": [{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05}, ...]}\n\n'
        "x, y는 영역 왼쪽 상단 모서리, width/height는 너비/높이입니다.\n"
        "JSON만 반환하고 다른 설명은 추가하지 마세요."
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
        data = json.loads(raw)
        regions = []
        for r in data.get("regions", []):
            x = float(r.get("x", 0))
            y = float(r.get("y", 0))
            w = float(r.get("width", 0))
            h = float(r.get("height", 0))
            if w > 0 and h > 0:
                regions.append({
                    "x": round(max(0.0, min(x, 1.0)), 4),
                    "y": round(max(0.0, min(y, 1.0)), 4),
                    "width": round(max(0.0, min(w, 1.0)), 4),
                    "height": round(max(0.0, min(h, 1.0)), 4),
                })
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
