"""FastAPI application entrypoint for MAECAS."""

import logging
import sys
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.services.lseg import MarketDataService
from backend.db.database import init_db
from backend.settings import settings

_HANDLER_TAG = "_maecas_backend_stream"


def _resolve_log_level() -> int:
    return getattr(logging, settings.log_level.upper(), logging.INFO)


def attach_backend_stream_handler() -> None:
    """Attach a console handler to the `backend` logger tree.

    Uvicorn reapplies logging after the worker process starts, which can drop
    application loggers from the root handler chain. Keeping a dedicated
    StreamHandler on `backend` ensures HTTP middleware and agent logs stay
    visible in the same terminal as Uvicorn.
    """
    level = _resolve_log_level()
    fmt = logging.Formatter(
        "%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    backend = logging.getLogger("backend")
    for h in list(backend.handlers):
        if getattr(h, _HANDLER_TAG, False):
            backend.removeHandler(h)
    sh = logging.StreamHandler(sys.stderr)
    setattr(sh, _HANDLER_TAG, True)
    sh.setLevel(level)
    sh.setFormatter(fmt)
    backend.addHandler(sh)
    backend.setLevel(level)
    backend.propagate = False

    for noisy in (
        "httpx",
        "httpcore",
        "langchain",
        "chromadb",
        "urllib3",
        "aiosqlite",
        "sqlalchemy.engine",
        "sqlalchemy.pool",
    ):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def setup_logging():
    level = _resolve_log_level()
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        force=True,
    )
    for noisy in ("httpx", "httpcore", "langchain", "chromadb", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).setLevel(level)

    attach_backend_stream_handler()


setup_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    attach_backend_stream_handler()
    logger.info("MAECAS starting up")
    await init_db()
    MarketDataService.open()
    logger.info("Startup complete — DB initialised, LSEG session opened")
    yield
    MarketDataService.close()
    logger.info("MAECAS shut down")


app = FastAPI(title="MAECAS API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    path = request.url.path
    method = request.method
    logger.info("HTTP %s %s — started", method, path)
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info("HTTP %s %s — %d (%.0fms)", method, path, response.status_code, elapsed_ms)
    return response


app.include_router(router, prefix="/api")
