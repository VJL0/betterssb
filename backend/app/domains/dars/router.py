from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.domains.dars.schemas import Audit
from app.domains.dars.service import DarsService

router = APIRouter(prefix="/dars", tags=["dars"])


def _dars_service() -> DarsService:
    return DarsService()


@router.post("/audits/parse", response_model=Audit)
def parse_audit(
    html: str = Body(..., media_type="text/html"),
    service: DarsService = Depends(_dars_service),
) -> Audit:
    """Parse a DARS audit page that was already fetched — by the browser extension or saved by the
    student (the printer-friendly `read.html`). No credential is involved; this only reads HTML.
    """
    audit = service.parse(html)
    if not audit.requirements and not audit.program_title:
        raise HTTPException(
            status_code=422,
            detail="That doesn't look like a DARS audit page. Upload the audit's printer-friendly HTML.",
        )
    return audit
