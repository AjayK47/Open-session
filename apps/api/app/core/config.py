from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Open Session API"
    environment: str = "development"

    database_url: str = "sqlite:///./open_session.db"

    session_secret: str = "dev-only-change-me-please"
    session_max_age_seconds: int = 30 * 24 * 3600
    login_token_ttl_seconds: int = 15 * 60

    # Explicitly gated, evaluation-only passwordless shortcuts. These are off by
    # default and must never be enabled on a normal production deployment.
    evaluation_mode: bool = False
    evaluation_organizer_email: str = "sbek-organizer@example.com"
    evaluation_speaker_email: str = "sbek-speaker@example.com"
    evaluation_reviewer_email: str = "sbek-reviewer@example.com"
    evaluation_event_slug: str = "devflow-conf-2027"

    # Optional real-model submission review. Disabled unless deliberately
    # configured; the API key is server-only.
    ai_review_enabled: bool = False
    openai_api_key: str | None = None
    ai_review_model: str = "gpt-5.6-luna"
    ai_review_timeout_seconds: float = 45.0
    ai_review_max_runs_per_submission: int = 5

    # Optional speaker-owned calendar synchronization through Composio managed
    # auth. The Open Session user UUID is used as the distinct Composio user ID.
    web_app_url: str = "http://localhost:5173"
    composio_api_key: str | None = None

    files_storage_dir: str = "./data/files"
    default_organization_id: str = "org_default"

    # Internal scheduler-to-API authentication. Production deployments run the
    # reminder loop as a separate process and never expose /internal routes at
    # the public reverse proxy.
    internal_job_secret: str | None = None
    internal_api_url: str = "http://127.0.0.1:8000"
    reminder_interval_seconds: int = 3600

    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Rate limiting (§26). Throttles brute-force/spam against magic-login codes and
    # public CFP submission creation; stand-in for Turnstile until that's wired up.
    #
    # Sign-in codes are limited on three independent dimensions, all sharing one
    # window:
    #   - per email  (auth_request_code_limit)      — stops one inbox being spammed
    #   - per IP     (auth_request_code_ip_limit)    — coarse ceiling for a whole
    #     network (an office behind one NAT'd IP shares this pool)
    #   - per device (auth_request_code_device_limit) — a lighter cookie-based
    #     sub-limit *within* the IP pool, so one busy browser can't burn through
    #     the whole office's allowance by itself. This is a false-positive
    #     reducer, not a security boundary — clearing cookies resets it, so the
    #     per-email and per-IP limits remain the real backstops.
    rate_limit_enabled: bool = True
    auth_request_code_limit: int = 8
    auth_request_code_ip_limit: int = 20
    auth_request_code_device_limit: int = 8
    auth_request_code_window_seconds: int = 15 * 60
    auth_verify_limit: int = 15
    auth_verify_window_seconds: int = 15 * 60
    public_submission_limit: int = 30
    public_submission_window_seconds: int = 3600

    # "smtp" (default; covers Mailpit/MailHog locally and Cloudflare's
    # authenticated SMTP endpoint) or "cloudflare" for their REST API.
    email_provider: str = "smtp"
    # Cloudflare Email Service. The same token works for both transports: as a
    # Bearer token for REST, and as the SMTP password (with username "api_token").
    cloudflare_api_token: str | None = None
    cloudflare_account_id: str | None = None
    email_enabled: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    # STARTTLS on 587. Cloudflare instead requires implicit TLS from connect on
    # 465, which is `smtp_use_ssl` below — the two are mutually exclusive.
    smtp_use_tls: bool = False
    smtp_use_ssl: bool = False
    email_sender_name: str = "Open Session"
    email_sender_address: str = "noreply@localhost"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="OPEN_SESSION_", extra="ignore")


settings = Settings()
