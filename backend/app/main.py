from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import UPLOADS_DIR
from app.database import create_tables
from app.routers import exams, regions, students, grading, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    yield


app = FastAPI(
    title="Handwriting Grading API",
    description="Backend for handwriting-based exam grading with OCR and LLM evaluation",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images as static files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Register all routers
app.include_router(settings.router, prefix="/api")
app.include_router(exams.router, prefix="/api")
app.include_router(regions.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(grading.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "Handwriting Grading API", "docs": "/docs"}
