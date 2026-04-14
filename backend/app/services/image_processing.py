import base64
import io
import json
import re
from typing import List, Dict

from PIL import Image


async def detect_regions_gemini(image_bytes: bytes, api_key: str, model: str = "gemini-2.0-flash") -> List[Dict[str, float]]:
    """
    Use Gemini to detect answer regions in an exam sheet image.
    Returns list of {x, y, width, height} as fractions (0.0–1.0).
    """
    from app.services.llm_client import GeminiClient
    import asyncio

    client = GeminiClient(api_key=api_key, model=model)

    prompt = (
        "이 시험지 이미지에서 학생이 답을 적는 빈칸(답안 영역)을 모두 찾아주세요.\n"
        "각 영역의 위치를 이미지 크기 대비 비율(0.0~1.0)로 반환해주세요.\n"
        "정확히 다음 JSON 형식으로만 응답하세요:\n"
        '{"regions": [{"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.05}, ...]}\n\n'
        "- x, y는 영역 왼쪽 상단 모서리 좌표\n"
        "- width, height는 영역의 너비와 높이\n"
        "- 답안을 작성하는 빈칸만 포함하고, 문제 텍스트나 여백은 제외\n"
        "- 위에서 아래, 왼쪽에서 오른쪽 순서로 정렬\n"
        "JSON만 반환하고 다른 설명은 추가하지 마세요."
    )

    loop = asyncio.get_running_loop()

    def _sync():
        from google import genai
        from google.genai import types
        b64 = base64.standard_b64encode(image_bytes).decode("utf-8")
        image_part = types.Part.from_bytes(data=b64, mime_type="image/png")
        genai_client = genai.Client(api_key=api_key)
        response = genai_client.models.generate_content(
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


def detect_cells(image_path: str) -> List[Dict[str, float]]:
    """
    Use OpenCV to detect rectangular cells in an answer sheet.

    Returns a list of dicts with keys x, y, width, height as
    percentages (0.0–1.0) relative to image dimensions.
    """
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not read image at {image_path}")

    img_h, img_w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Adaptive threshold to handle varying illumination
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15,
        C=4,
    )

    # Morphological operations to close gaps in grid lines
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    # Detect horizontal and vertical lines separately then combine
    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(img_w // 20, 20), 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(img_h // 20, 20)))

    h_lines = cv2.morphologyEx(closed, cv2.MORPH_OPEN, h_kernel)
    v_lines = cv2.morphologyEx(closed, cv2.MORPH_OPEN, v_kernel)

    grid = cv2.add(h_lines, v_lines)

    # Dilate slightly to connect nearby lines
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grid = cv2.dilate(grid, dilate_kernel, iterations=1)

    contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (img_w * img_h) * 0.005   # at least 0.5% of image area
    max_area = (img_w * img_h) * 0.95    # not the whole image

    cells: List[Dict[str, float]] = []
    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        area = w * h

        if area < min_area or area > max_area:
            continue

        aspect = w / h
        if aspect < 0.1 or aspect > 20:
            continue

        cells.append({
            "x": round(x / img_w, 4),
            "y": round(y / img_h, 4),
            "width": round(w / img_w, 4),
            "height": round(h / img_h, 4),
        })

    # Sort top-to-bottom, left-to-right
    cells.sort(key=lambda c: (round(c["y"] * 10), c["x"]))

    return cells


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

    # Clamp to image boundaries
    px = max(0, min(px, img_w - 1))
    py = max(0, min(py, img_h - 1))
    pw = max(1, min(pw, img_w - px))
    ph = max(1, min(ph, img_h - py))

    cropped = img.crop((px, py, px + pw, py + ph))

    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
