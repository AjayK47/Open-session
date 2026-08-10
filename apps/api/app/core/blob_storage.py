from pathlib import Path
from typing import Protocol

from fastapi import Request

from app.core.config import settings


class BlobStorage(Protocol):
    async def put(self, key: str, content: bytes) -> None: ...

    async def get(self, key: str) -> bytes | None: ...

    async def delete(self, key: str) -> None: ...


class LocalBlobStorage:
    """Persistent filesystem storage used by local and VPS deployments."""

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        path = self.root.joinpath(*key.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    async def put(self, key: str, content: bytes) -> None:
        self._path(key).write_bytes(content)

    async def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.exists() else None

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()


class R2BlobStorage:
    """Cloudflare R2 adapter backed by a native Worker binding."""

    def __init__(self, bucket):
        self.bucket = bucket

    async def put(self, key: str, content: bytes) -> None:
        await self.bucket.put(key, content)

    async def get(self, key: str) -> bytes | None:
        obj = await self.bucket.get(key)
        if obj is None:
            return None
        return bytes(await obj.arrayBuffer())

    async def delete(self, key: str) -> None:
        await self.bucket.delete(key)


def get_blob_storage(request: Request) -> BlobStorage:
    env = request.scope.get("env")
    bucket = getattr(env, "FILES", None) if env is not None else None
    if bucket is not None:
        return R2BlobStorage(bucket)
    return LocalBlobStorage(settings.files_storage_dir)
