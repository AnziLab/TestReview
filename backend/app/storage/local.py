import os
from pathlib import Path

import anyio

from app.config import settings
from app.storage.base import BaseStorage


class LocalStorage(BaseStorage):
    def __init__(self, base_path: str | None = None):
        self.base = Path(base_path or settings.STORAGE_PATH)
        self.base.mkdir(parents=True, exist_ok=True)

    async def save(self, data: bytes, relative_path: str) -> str:
        full_path = self.base / relative_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        async with await anyio.open_file(full_path, "wb") as f:
            await f.write(data)
        return str(full_path)

    async def read(self, path: str) -> bytes:
        async with await anyio.open_file(path, "rb") as f:
            return await f.read()

    async def delete(self, path: str) -> None:
        p = Path(path)
        if p.exists():
            p.unlink()


storage = LocalStorage()
