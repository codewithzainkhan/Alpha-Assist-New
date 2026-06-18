"""FastAPI application entrypoint.

Every route is mounted under `/api` (frontend hits `/api/chat`, `/api/tasks/...`,
etc.). CORS is open by default; override with CORS_ORIGINS.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, LOG_LEVEL, assert_required_env
from .routes import chat, voice, image, tone, tasks, goals, voice_clone, calls as calls_module, account
from logging.handlers import RotatingFileHandler

file_handler = RotatingFileHandler(
    "logs/app.log", maxBytes=5*1024*1024, backupCount=3
)
file_handler.setFormatter(logging.Formatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
))

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(),   # still print to terminal
        file_handler,              # also write to file
    ]
)
logger = logging.getLogger(__name__)

# Fail fast on missing required env vars so prod never boots half-configured.
assert_required_env()

app = FastAPI(title="Alpha Assist", version="2.0.0")


@app.on_event("startup")
async def _startup() -> None:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    sched = AsyncIOScheduler()
    sched.start()
    calls_module.scheduler = sched
    logger.info("[scheduler] APScheduler started")


@app.on_event("shutdown")
async def _shutdown() -> None:
    if calls_module.scheduler:
        calls_module.scheduler.shutdown(wait=False)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def health():
    return {"status": "ok", "service": "alpha-assist"}


# ── API routes ─────────────────────────────────────────────────────────────
# Every router is mounted under /api to match the frontend's fetch paths.
app.include_router(chat.router,        prefix="/api")
app.include_router(voice.router,       prefix="/api")
app.include_router(image.router,       prefix="/api")
app.include_router(tone.router,        prefix="/api")
app.include_router(tasks.router,       prefix="/api")
app.include_router(goals.router,       prefix="/api")
app.include_router(voice_clone.router,       prefix="/api")
app.include_router(calls_module.router,     prefix="/api")
app.include_router(account.router,          prefix="/api")
