FROM ghcr.io/astral-sh/uv:0.9.26 AS uv

FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_SYNC=1

COPY --from=uv /uv /uvx /usr/local/bin/

RUN groupadd --gid 10001 opensession \
    && useradd --uid 10001 --gid opensession --create-home opensession

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY docker-entrypoint.sh /usr/local/bin/open-session-entrypoint

RUN chmod 0755 /usr/local/bin/open-session-entrypoint \
    && mkdir -p /data/files \
    && chown -R opensession:opensession /app /data

USER opensession

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=5 \
  CMD ["uv", "run", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

ENTRYPOINT ["open-session-entrypoint"]
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*"]
