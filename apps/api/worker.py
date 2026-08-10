import anyio.to_thread
from sqlalchemy.orm import sessionmaker
from workers import WorkerEntrypoint


async def _run_sync_inline(func, *args, **kwargs):
    """Execute FastAPI's synchronous endpoints without a Worker thread pool.

    Cloudflare's Pyodide runtime is single-threaded. Starlette normally sends
    every regular `def` dependency and endpoint through anyio's thread helper,
    which fails before our route code runs. In the Worker build only, execute
    those short database/service calls inline on the event loop instead.
    """
    return func(*args)


anyio.to_thread.run_sync = _run_sync_inline

from app.core.db import create_d1_engine_from_binding  # noqa: E402
from app.core.worker_runtime import configure_settings_from_worker_env  # noqa: E402
from app.jobs.reminders import run_due_reminders  # noqa: E402
from app.main import app  # noqa: E402
from app.repositories import create_repositories  # noqa: E402


class Default(WorkerEntrypoint):
    """Cloudflare entry point for FastAPI requests and scheduled jobs."""

    async def fetch(self, request):
        import asgi

        configure_settings_from_worker_env(self.env)
        return await asgi.fetch(app, request, self.env)

    async def scheduled(self, controller, env, ctx):
        # Wrangler's local scheduled-event shim currently passes `env=None`;
        # the entrypoint binding remains available on self.env in both local
        # and deployed runtimes.
        runtime_env = env or self.env
        configure_settings_from_worker_env(runtime_env)
        engine = create_d1_engine_from_binding(runtime_env.DB)
        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
        with factory() as db:
            sent = run_due_reminders(db, create_repositories(db))
        print(f"Open Session reminder cron sent {sent} messages")
