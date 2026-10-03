from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException

from app.domains.dars.schemas import Audit, RunAuditRequest
from app.domains.dars.service import DarsService
from app.integrations.dars.client import DarsError, DarsSessionError, DarsTimeoutError

router = APIRouter(prefix="/dars", tags=["dars"])


def _dars_service() -> DarsService:
    return DarsService()


def _require_audit(audit: Audit) -> Audit:
    if not audit.requirements and not audit.program_title:
        raise HTTPException(
            status_code=422,
            detail="That doesn't look like a DARS audit page. Upload the audit's printer-friendly HTML.",
        )
    return audit


@router.post("/audits/parse", response_model=Audit)
def parse_audit(
    html: str = Body(..., media_type="text/html"),
    service: DarsService = Depends(_dars_service),
) -> Audit:
    """Parse a DARS audit page that was already fetched — by the browser extension or saved by the
    student (the printer-friendly `read.html`). No credential is involved; this only reads HTML.
    """
    return _require_audit(service.parse(html))


@router.post("/audits", response_model=Audit)
async def run_audit(
    body: RunAuditRequest,
    service: DarsService = Depends(_dars_service),
) -> Audit:
    """Run a fresh declared-program degree audit in DARS and return it parsed.

    The session id travels in the body (not the URL) so it never lands in access logs.
    """
    try:
        return await service.run_audit(body.session_id)
    except DarsSessionError as exc:
        raise HTTPException(
            status_code=401,
            detail="Your DARS session is invalid or expired. Log in to DARS again and paste a fresh JSESSIONID.",
        ) from exc
    except DarsTimeoutError as exc:
        raise HTTPException(status_code=504, detail="DARS took too long to finish the audit. Try again.") from exc
    except DarsError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
