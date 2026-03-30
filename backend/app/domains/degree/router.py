from __future__ import annotations

from fastapi import APIRouter, Body

from app.domains.degree.schemas import DegreeProgram
from app.domains.degree.service import BulletinParser

router = APIRouter(prefix="/degree", tags=["degree"])

_parser = BulletinParser()


@router.post("/parse-bulletin", response_model=DegreeProgram)
def parse_bulletin(
    html: str = Body(..., media_type="text/plain"),
    url: str = "",
) -> DegreeProgram:
    """Parse a Temple University Bulletin HTML page into structured degree requirements."""
    return _parser.parse(html, url=url)
