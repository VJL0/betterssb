from __future__ import annotations

from app.domains.dars.parser import parse_audit
from app.domains.dars.schemas import Audit


class DarsService:
    """Turns a fetched DARS audit page into structured data."""

    def parse(self, html: str) -> Audit:
        """Parse an already-fetched DARS audit page (from the extension or an uploaded file)."""
        return parse_audit(html)
