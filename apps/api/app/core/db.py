import json
from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import DateTime, Engine, MetaData, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import settings

_connect_args: dict[str, object] = {}
if settings.database_url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, connect_args=_connect_args)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UTCDateTime(TypeDecorator):
    """Stores datetimes as naive UTC in the database, exposes aware UTC in Python.

    SQLite drops the tz offset, so we normalize at the boundary to avoid
    aware/naive comparison errors and to always serialize with an offset.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=UTC)
            return value.astimezone(UTC).replace(tzinfo=None)
        return value

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow, nullable=False)


def _request_engine(request: Request | None) -> Engine:
    """Return the database engine for the current deployment target.

    A normal Python process uses the configured DB URL. Cloudflare Python
    Workers expose D1 as a request-scoped binding instead of a filesystem path
    or network connection string, so the Worker ASGI adapter places `env` in
    the request scope and we wrap its `DB` binding with the SQLAlchemy dialect.
    """
    env = request.scope.get("env") if request is not None else None
    d1_binding = getattr(env, "DB", None) if env is not None else None
    if d1_binding is None:
        return engine

    return create_d1_engine_from_binding(d1_binding)


def create_d1_engine_from_binding(binding) -> Engine:
    from sqlalchemy_cloudflare_d1 import create_engine_from_binding

    d1_engine = create_engine_from_binding(binding)
    # sqlalchemy-cloudflare-d1 0.3.11 subclasses SQLite's dialect without
    # initializing the JSON hooks expected by SQLAlchemy's JSON bind type.
    # Several existing models use JSON columns, so supply SQLite's defaults.
    d1_engine.dialect._json_serializer = json.dumps
    d1_engine.dialect._json_deserializer = json.loads
    return d1_engine


def get_db(request: Request):
    request_engine = _request_engine(request)
    factory = SessionLocal if request_engine is engine else sessionmaker(
        bind=request_engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    db = factory()
    try:
        yield db
    finally:
        db.close()
