import abc
from pathlib import Path


class BaseStorage(abc.ABC):
    @abc.abstractmethod
    async def save(self, data: bytes, relative_path: str) -> str:
        """Save bytes and return the stored path."""

    @abc.abstractmethod
    async def read(self, path: str) -> bytes:
        """Read bytes from a stored path."""

    @abc.abstractmethod
    async def delete(self, path: str) -> None:
        """Delete a file."""
