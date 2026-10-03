from __future__ import annotations

from app.domains.dars.parser import parse_audit
from app.domains.dars.schemas import Audit
from app.integrations.dars.client import DarsClient


class DarsService:
    """Runs degree audits in DARS on behalf of a student, using their own DARS session."""

    async def run_audit(self, session_id: str) -> Audit:
        html = await DarsClient(session_id).run_audit()
        return parse_audit(html)

    def parse(self, html: str) -> Audit:
        """Parse an already-fetched DARS audit page (from the extension or an uploaded file)."""
        return parse_audit(html)
