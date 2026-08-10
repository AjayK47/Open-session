import asyncio

from fastapi import Request
from sqlalchemy import create_engine, inspect, text

from app.core.blob_storage import LocalBlobStorage, R2BlobStorage
from app.core.config import settings
from app.core.db import _request_engine, create_d1_engine_from_binding, engine
from app.core.worker_runtime import configure_settings_from_worker_env
from app.jobs.cloudflare_migrate import migrate


def test_local_blob_storage_round_trip(tmp_path):
    async def exercise():
        storage = LocalBlobStorage(tmp_path)

        await storage.put("event/file", b"slides")
        assert await storage.get("event/file") == b"slides"

        await storage.delete("event/file")
        assert await storage.get("event/file") is None

    asyncio.run(exercise())


def test_r2_blob_storage_round_trip():
    class StoredObject:
        async def arrayBuffer(self):
            return bytearray(b"headshot")

    class Bucket:
        value = None

        async def put(self, key, content):
            self.value = (key, content)

        async def get(self, key):
            return StoredObject() if self.value and self.value[0] == key else None

        async def delete(self, key):
            self.value = None

    async def exercise():
        bucket = Bucket()
        storage = R2BlobStorage(bucket)

        await storage.put("speaker/photo", b"headshot")
        assert await storage.get("speaker/photo") == b"headshot"

        await storage.delete("speaker/photo")
        assert await storage.get("speaker/photo") is None

    asyncio.run(exercise())


def test_database_engine_uses_d1_binding_when_present(monkeypatch):
    binding = object()
    dialect = type("Dialect", (), {})()
    d1_engine = type("Engine", (), {"dialect": dialect})()
    env = type("Env", (), {"DB": binding})()
    request = Request({"type": "http", "env": env})

    monkeypatch.setattr("sqlalchemy_cloudflare_d1.create_engine_from_binding", lambda value: d1_engine)

    assert _request_engine(request) is d1_engine
    assert _request_engine(Request({"type": "http"})) is engine
    assert create_d1_engine_from_binding(binding).dialect._json_serializer({"ready": True}) == '{"ready": true}'


def test_worker_bindings_configure_shared_settings(monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "email_enabled", False)
    monkeypatch.setattr(settings, "cors_origins", ["http://localhost:5173"])
    env = type(
        "Env",
        (),
        {
            "OPEN_SESSION_EMAIL_ENABLED": "true",
            "OPEN_SESSION_CORS_ORIGINS": '["https://sessions.example.com"]',
        },
    )()

    configure_settings_from_worker_env(env)

    assert settings.environment == "production"
    assert settings.email_enabled is True
    assert settings.cors_origins == ["https://sessions.example.com"]


def test_fresh_cloudflare_schema_is_created_at_current_head(tmp_path):
    database_path = tmp_path / "fresh-d1.db"
    database_url = f"sqlite:///{database_path}"

    assert migrate(database_url) == "initialized"

    schema = inspect(create_engine(database_url))
    assert schema.has_table("events")
    assert schema.has_table("organizations")
    with create_engine(database_url).connect() as connection:
        revision = connection.scalar(text("SELECT version_num FROM alembic_version"))
    assert revision == "0017_refresh_transactional_emails"
