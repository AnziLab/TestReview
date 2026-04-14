import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as api_v1_router
from app.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure storage directory exists
    Path(settings.STORAGE_PATH).mkdir(parents=True, exist_ok=True)
    logger.info(f"Storage path: {settings.STORAGE_PATH}")
    yield


app = FastAPI(
    title="Handwriting Grading System",
    description="한국 중고등학교 서답형 시험 채점기준표 정제 및 자동채점 API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
