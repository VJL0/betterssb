from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, HTTPException

from app.modules.dars import parser
from app.modules.dars.schemas import Audit

router = APIRouter(prefix="/dars", tags=["dars"])


@router.post("/audits/parse", response_model=Audit)
def parse_audit(
    html: Annotated[str, Body(media_type="text/html")],
) -> Audit:
    """Parse a DARS audit page that was already fetched — by the browser extension or saved by the
    student (the printer-friendly `read.html`). No credential is involved; this only reads HTML.
    """
    audit = parser.parse_audit(html)
    if not audit.requirements and not audit.program_title:
        raise HTTPException(
            status_code=422,
            detail="That doesn't look like a DARS audit page. Upload the audit's printer-friendly HTML.",
        )
    return audit
