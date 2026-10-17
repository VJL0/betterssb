from __future__ import annotations

from fastapi import APIRouter

from app.core.openapi import PROBLEM_RESPONSES
from app.modules.auth.router import router as auth_router
from app.modules.chatbot.router import router as chatbot_router
from app.modules.classes.router import router as classes_router
from app.modules.dars.router import router as dars_router
from app.modules.degree.router import router as degree_router
from app.modules.rmp.router import router as rmp_router
from app.modules.schedule.router import router as schedule_router
from app.modules.transcript.router import router as transcript_router

# Every endpoint can fail with problem details; documented once here.
api_router = APIRouter(prefix="/api", responses=PROBLEM_RESPONSES)

api_router.include_router(auth_router)
api_router.include_router(chatbot_router)
api_router.include_router(classes_router)
api_router.include_router(dars_router)
api_router.include_router(degree_router)
api_router.include_router(rmp_router)
api_router.include_router(schedule_router)
api_router.include_router(transcript_router)
