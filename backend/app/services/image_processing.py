import base64
import io
import json
import re
from typing import List, Dict, Tuple

from PIL import Image


# ── PIL grid detection ────────────────────────────────────────────────────────

def _projection_profile(pixels: list, width: int, height: int, axis: str, threshold: int = 180) -> list:
    """
    axis='h': returns list of length height, each value = count of dark pixels in that row
    axis='v': returns list of length width,  each value = count of dark pixels in that col
    """
    if axis == 'h':
        profile = [0] * height
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < threshold:
                    profile[y] += 1
    else:
        profile = [0] * width
        for y in range(height):
            for x in range(width):
                if pixels[y * width + x] < threshold:
                    profile[x] += 1
    return profile


def _find_lines(profile: list, size: int, min_ratio: float = 0.4) -> list:
    """Find line positions where dark pixel ratio exceeds min_ratio."""
    min_count = int(size * min_ratio)
    lines = []
    in_line = False
    start = 0
    for i, v in enumerate(profile):
        if v >= min_count:
            if not in_line:
                in_line = True
                start = i
        else:
            if in_line:
                in_line = False
                center = (start + i) // 2
                lines.append(center)
    if in_line:
        lines.append((start + len(profile)) // 2)
    return lines


def _detect_grid(image_bytes: bytes) -> Tuple[List[int], List[int], int, int]:
    """
    Returns (h_lines, v_lines, img_w, img_h).
    h_lines: sorted y-coordinates of horizontal lines (pixels)
    v_lines: sorted x-coordinates of vertical lines (pixels)
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("L")

    # Downscale for speed while keeping enough resolution
    max_dim = 1200
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    img_w, img_h = img.size
    pixels = list(img.getdata())

    h_profile = _projection_profile(pixels, img_w, img_h, 'h', threshold=160)
    v_profile = _projection_profile(pixels, img_w, img_h, 'v', threshold=160)

    h_lines = _find_lines(h_profile, img_w, min_ratio=0.35)
    v_lines = _find_lines(v_profile, img_h, min_ratio=0.25)

    return h_lines, v_lines, img_w, img_h


def _crop_cell_bytes(image_bytes: bytes, x1: int, y1: int, x2: int, y2: int, orig_w: int, orig_h: int) -> bytes:
    """Crop a cell from the original image using pixel coords from the downscaled version."""
    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    # Scale coords back to original image size
    sx = w / orig_w
    sy = h / orig_h
    box = (int(x1 * sx), int(y1 * sy), int(x2 * sx), int(y2 * sy))
    cropped = img.crop(box)
    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()


# ── Gemini cell classifier ────────────────────────────────────────────────────

def _classify_columns_gemini(image_bytes: bytes, v_lines: List[int], h_lines: List[int],
                               img_w: int, img_h: int, api_key: str, model: str) -> List[int]:
    """
    For each column gap, crop a representative cell and ask Gemini which columns are answer boxes.
    Returns list of column indices (0-based) that are answer columns.
    """
    from google import genai
    from google.genai import types

    if len(v_lines) < 2 or len(h_lines) < 2:
        return []

    # Pick the middle row as representative
    mid_row = len(h_lines) // 2
    y1 = h_lines[mid_row - 1] if mid_row > 0 else 0
    y2 = h_lines[mid_row] if mid_row < len(h_lines) else img_h

    # Build one image with all column crops side by side, labeled
    col_crops = []
    for i in range(len(v_lines) - 1):
        x1 = v_lines[i]
        x2 = v_lines[i + 1]
        cell_bytes = _crop_cell_bytes(image_bytes, x1, y1, x2, y2, img_w, img_h)
        col_crops.append((i, cell_bytes))

    if not col_crops:
        return []

    # Send all crops in one Gemini call
    parts = []
    desc_lines = []
    for i, cell_bytes in col_crops:
        b64 = base64.standard_b64encode(cell_bytes).decode("utf-8")
        parts.append(types.Part.from_bytes(data=b64, mime_type="image/png"))
        desc_lines.append(f"이미지 {i}: 열 {i}")

    prompt = (
        "위 이미지들은 한국 시험 답안지의 표에서 각 열(column)의 대표 셀입니다.\n"
        "각 이미지 번호에 대해, 해당 열이 '학생이 답을 쓰는 빈 칸(답란)'인지 판단하세요.\n"
        "답란은 보통 넓고 비어 있는 셀입니다.\n"
        "문항 번호, 배점, 점수 칸은 답란이 아닙니다.\n\n"
        "다음 JSON 형식으로만 응답하세요:\n"
        '{"answer_columns": [0, 2, 3]}\n\n'
        "answer_columns에는 답란인 열의 인덱스(0부터 시작)만 포함하세요.\n"
        "JSON만 반환하세요."
    )
    parts.append(prompt)

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=parts)
    raw = response.text.strip()

    try:
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)
            raw = raw.strip()
        data = json.loads(raw)
        return data.get("answer_columns", [])
    except (json.JSONDecodeError, KeyError, TypeError):
        # Fallback: pick the widest column(s)
        widths = [(i, v_lines[i + 1] - v_lines[i]) for i in range(len(v_lines) - 1)]
        widths.sort(key=lambda x: -x[1])
        return [widths[0][0]] if widths else []


# ── Main entry point ──────────────────────────────────────────────────────────

async def detect_regions_gemini(image_bytes: bytes, api_key: str, model: str = "gemini-2.5-flash") -> List[Dict[str, float]]:
    """
    Hybrid approach:
    1. PIL projection profile → detect grid lines precisely
    2. Gemini → classify which columns are answer boxes (1 call)
    3. Return all cells in answer columns as regions
    """
    import asyncio

    loop = asyncio.get_running_loop()

    def _run():
        h_lines, v_lines, img_w, img_h = _detect_grid(image_bytes)

        if len(h_lines) < 2 or len(v_lines) < 2:
            return []

        # Classify which columns are answer boxes
        answer_cols = _classify_columns_gemini(
            image_bytes, v_lines, h_lines, img_w, img_h, api_key, model
        )

        if not answer_cols:
            # Fallback: pick the widest column
            widths = [(i, v_lines[i + 1] - v_lines[i]) for i in range(len(v_lines) - 1)]
            widths.sort(key=lambda x: -x[1])
            answer_cols = [widths[0][0]] if widths else []

        regions = []
        for row_i in range(len(h_lines) - 1):
            y1 = h_lines[row_i]
            y2 = h_lines[row_i + 1]
            row_h = y2 - y1
            # Skip very thin rows (likely just decorative lines, not cells)
            if row_h < img_h * 0.01:
                continue
            for col_i in answer_cols:
                if col_i >= len(v_lines) - 1:
                    continue
                x1 = v_lines[col_i]
                x2 = v_lines[col_i + 1]
                regions.append({
                    "x": round(x1 / img_w, 4),
                    "y": round(y1 / img_h, 4),
                    "width": round((x2 - x1) / img_w, 4),
                    "height": round((y2 - y1) / img_h, 4),
                })

        return regions

    return await loop.run_in_executor(None, _run)


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
