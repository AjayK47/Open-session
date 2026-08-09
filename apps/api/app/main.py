from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routers import api_router
from app.core.config import settings
from app.core.db import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.models  # noqa: F401  ensure all models are registered

    # Developer/test convenience only. Production deployments must migrate
    # explicitly so schema changes are ordered and auditable.
    if settings.environment in {"development", "test"}:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Open Session API",
    description=(
        "REST API for Open Session — call-for-speakers forms, submission review, "
        "the speaker portal, agenda building, and the public event widgets. "
        "Session-cookie auth: sign in via /api/v1/auth (email + one-time code), "
        "or use an API key via the Authorization header for server-to-server access."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def same_origin_cookie_mutations(request: Request, call_next):
    """Reject cross-origin cookie-authenticated mutations.

    SameSite=Lax session cookies already block normal cross-site POSTs. Checking
    Origin as well protects clients and proxies that relax cookie behavior while
    leaving bearer-token API calls and non-browser jobs unaffected.
    """
    if request.method not in {"GET", "HEAD", "OPTIONS"} and request.cookies.get("session"):
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins:
            return JSONResponse(status_code=403, content={"detail": "Cross-origin mutation rejected"})
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "environment": settings.environment}


app.include_router(api_router)
