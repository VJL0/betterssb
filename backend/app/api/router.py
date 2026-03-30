from __future__ import annotations

from fastapi import APIRouter

from app.domains.auth.router import router as auth_router
from app.domains.chatbot.router import router as chatbot_router
from app.domains.degree.router import router as degree_router
from app.domains.rmp.router import router as rmp_router
from app.domains.schedule.router import router as schedule_router
from app.domains.transcript.router import router as transcript_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(chatbot_router)
api_router.include_router(degree_router)
api_router.include_router(rmp_router)
api_router.include_router(schedule_router)
api_router.include_router(transcript_router)
