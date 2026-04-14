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

def _classify_columns_by_width(v_lines: List[int]) -> List[int]:
    """
    답란은 항상 가장 넓은 열이다.
    전체 평균보다 1.5배 이상 넓은 열을 답란으로 선택.
    """
    if len(v_lines) < 2:
        return []

    widths = [(i, v_lines[i + 1] - v_lines[i]) for i in range(len(v_lines) - 1)]
    avg_w = sum(w for _, w in widths) / len(widths)
    answer_cols = [i for i, w in widths if w >= avg_w * 1.5]

    # 해당 없으면 가장 넓은 열 하나만 선택
    if not answer_cols:
        answer_cols = [max(widths, key=lambda x: x[1])[0]]

    return answer_cols


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

        # 답란 = 가장 넓은 열 (배점/점수 칸은 항상 좁음)
        answer_cols = _classify_columns_by_width(v_lines)

        img_gray = Image.open(io.BytesIO(image_bytes)).convert("L")
        scale_w = img_gray.width / img_w
        scale_h = img_gray.height / img_h
        if max(img_gray.width, img_gray.height) > 1200:
            sc = 1200 / max(img_gray.width, img_gray.height)
            img_gray = img_gray.resize((int(img_gray.width * sc), int(img_gray.height * sc)), Image.LANCZOS)
        gray_w, gray_h = img_gray.size
        gray_pixels = list(img_gray.getdata())

        regions = []
        for row_i in range(len(h_lines) - 1):
            y1 = h_lines[row_i]
            y2 = h_lines[row_i + 1]
            row_h = y2 - y1
            if row_h < img_h * 0.01:
                continue

            for col_i in answer_cols:
                if col_i >= len(v_lines) - 1:
                    continue
                x1 = v_lines[col_i]
                x2 = v_lines[col_i + 1]
                cell_w = x2 - x1

                # Secondary vertical projection inside this cell to detect sub-dividers
                sub_profile = [0] * cell_w
                for cy in range(y1, y2):
                    for cx in range(x1, x2):
                        idx = cy * img_w + cx
                        if idx < len(gray_pixels) and gray_pixels[idx] < 160:
                            sub_profile[cx - x1] += 1

                # Find internal vertical lines (must span >60% of cell height)
                sub_lines = _find_lines(sub_profile, row_h, min_ratio=0.6)

                # Build sub-column boundaries
                sub_x_boundaries = [x1] + [x1 + s for s in sub_lines] + [x2]
                # Deduplicate and remove boundaries too close to each other
                merged = [sub_x_boundaries[0]]
                for bx in sub_x_boundaries[1:]:
                    if bx - merged[-1] > cell_w * 0.05:
                        merged.append(bx)
                sub_x_boundaries = merged

                for si in range(len(sub_x_boundaries) - 1):
                    sx1 = sub_x_boundaries[si]
                    sx2 = sub_x_boundaries[si + 1]
                    if (sx2 - sx1) < img_w * 0.02:
                        continue
                    regions.append({
                        "x": round(sx1 / img_w, 4),
                        "y": round(y1 / img_h, 4),
                        "width": round((sx2 - sx1) / img_w, 4),
                        "height": round(row_h / img_h, 4),
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
