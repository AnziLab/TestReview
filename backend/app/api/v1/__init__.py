from fastapi import APIRouter

from app.api.v1 import admin, auth, classes, exams, grading, me, questions, refinement, students, setup

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(me.router)
router.include_router(admin.router)
router.include_router(exams.router)
router.include_router(questions.router)
router.include_router(classes.router)
router.include_router(students.router)
router.include_router(refinement.router)
router.include_router(grading.router)
router.include_router(setup.router)
