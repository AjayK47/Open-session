from pydantic import TypeAdapter

from app.core.config import Settings, settings


def configure_settings_from_worker_env(env) -> None:
    """Load Worker vars and secrets into the process-wide application settings.

    Cloudflare bindings are not operating-system environment variables. Keeping
    this translation at the Worker boundary lets the rest of the FastAPI app use
    the same settings object in Docker and Workers.
    """
    for name, field in Settings.model_fields.items():
        binding_name = f"OPEN_SESSION_{name.upper()}"
        try:
            raw = getattr(env, binding_name)
        except (AttributeError, TypeError):
            continue
        if raw is None:
            continue

        value = str(raw)
        adapter = TypeAdapter(field.annotation)
        try:
            parsed = adapter.validate_json(value) if value.startswith(("[", "{")) else adapter.validate_python(value)
        except ValueError:
            # Strings such as URLs are not JSON documents; their direct string
            # representation is the intended value.
            parsed = adapter.validate_python(value)
        setattr(settings, name, parsed)

    settings.environment = "production"


def worker_public_config() -> dict[str, object]:
    """Safe diagnostics for health checks; never expose secret values."""
    return {
        "environment": settings.environment,
        "email_enabled": settings.email_enabled,
        "ai_review_enabled": settings.ai_review_enabled,
        "calendar_enabled": bool(settings.composio_api_key),
    }
