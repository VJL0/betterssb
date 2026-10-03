from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.domains.dars.router import _dars_service
from app.domains.dars.schemas import Audit
from app.integrations.dars.client import DarsSessionError
from app.main import app


class TestHealthCheck:
    async def test_health(self, client: AsyncClient):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestScheduleRoutes:
    async def test_generate_schedules(self, client: AsyncClient, sample_sections):
        body = {
            "sections": [s.model_dump() for s in sample_sections],
            "preferences": {},
            "max_results": 3,
        }
        resp = await client.post("/api/v1/schedule/generate", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) <= 3
        for sched in data:
            assert "sections" in sched
            assert "score" in sched

    async def test_generate_empty_input(self, client: AsyncClient):
        body = {"sections": [], "preferences": {}}
        resp = await client.post("/api/v1/schedule/generate", json=body)
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_generate_invalid_body(self, client: AsyncClient):
        resp = await client.post("/api/v1/schedule/generate", json={"bad": "data"})
        assert resp.status_code == 422


class TestTranscriptRoutes:
    async def test_parse_transcript(self, client: AsyncClient, transcript_text):
        resp = await client.post(
            "/api/v1/transcript/parse",
            content=transcript_text,
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["courses"]) == 4
        assert data["gpa"] == 3.45

    async def test_parse_empty_transcript(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/transcript/parse",
            content="nothing here",
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 200
        assert resp.json()["courses"] == []

    async def test_check_prereqs(self, client: AsyncClient):
        body = {
            "completed": [
                {
                    "subject": "CIS",
                    "course_number": "1068",
                    "title": "Program Design",
                    "grade": "A",
                    "credits": 4.0,
                    "term": "Fall 2024",
                }
            ],
            "required": ["CIS 1068", "CIS 2168"],
        }
        resp = await client.post("/api/v1/transcript/check-prereqs", json=body)
        assert resp.status_code == 200
        result = resp.json()
        assert result["CIS 1068"] is True
        assert result["CIS 2168"] is False


class TestDegreeRoutes:
    async def test_parse_cs_bulletin(self, client: AsyncClient, bulletin_html):
        resp = await client.post(
            "/api/v1/degree/parse-bulletin",
            content=bulletin_html,
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Computer Science" in data["name"]
        assert data["degreeType"] == "BS"
        assert len(data["categories"]) >= 1

    async def test_parse_cybr_bulletin(self, client: AsyncClient, bulletin_cybr_html):
        resp = await client.post(
            "/api/v1/degree/parse-bulletin",
            content=bulletin_cybr_html,
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "Cybersecurity" in data["name"]
        assert data["degreeType"] == "BS"
        assert len(data["categories"]) >= 1
        assert len(data["labScienceSequences"]) >= 1

    async def test_parse_bulletin_empty(self, client: AsyncClient):
        html = "<html><head><title>Empty</title></head><body></body></html>"
        resp = await client.post(
            "/api/v1/degree/parse-bulletin",
            content=html,
            headers={"Content-Type": "text/plain"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["categories"] == []


class TestDarsRoutes:
    @pytest.fixture()
    def stub_service(self):
        class StubService:
            def __init__(self) -> None:
                self.session_ids: list[str] = []
                self.error: Exception | None = None

            async def run_audit(self, session_id: str) -> Audit:
                self.session_ids.append(session_id)
                if self.error:
                    raise self.error
                return Audit(program_title="COMPUTER SCIENCE - B.S.")

        stub = StubService()
        app.dependency_overrides[_dars_service] = lambda: stub
        yield stub
        app.dependency_overrides.pop(_dars_service, None)

    async def test_run_audit(self, client: AsyncClient, stub_service):
        resp = await client.post("/api/v1/dars/audits", json={"sessionId": "ABCDEF0123456789"})
        assert resp.status_code == 200
        assert resp.json()["programTitle"] == "COMPUTER SCIENCE - B.S."

    async def test_accepts_pasted_cookie_pair(self, client: AsyncClient, stub_service):
        resp = await client.post("/api/v1/dars/audits", json={"sessionId": " JSESSIONID=ABCDEF0123456789; "})
        assert resp.status_code == 200
        assert stub_service.session_ids == ["ABCDEF0123456789"]

    async def test_rejects_malformed_session_id(self, client: AsyncClient, stub_service):
        resp = await client.post("/api/v1/dars/audits", json={"sessionId": "abc\r\nX-Injected: 1"})
        assert resp.status_code == 422
        assert stub_service.session_ids == []

    async def test_expired_session_is_401(self, client: AsyncClient, stub_service):
        stub_service.error = DarsSessionError("expired")
        resp = await client.post("/api/v1/dars/audits", json={"sessionId": "ABCDEF0123456789"})
        assert resp.status_code == 401
        assert "JSESSIONID" in resp.json()["detail"]

    async def test_parse_uploaded_audit(self, client: AsyncClient, dars_audit_html):
        resp = await client.post(
            "/api/v1/dars/audits/parse",
            content=dars_audit_html,
            headers={"Content-Type": "text/html"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["programCode"] == "ST-CSCI-BS"
        assert [r["code"] for r in data["requirements"]] == ["WARNING", "GENED-GW", "CISS.TBS", "CAS-ULS"]

    async def test_parse_rejects_non_audit_html(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/dars/audits/parse",
            content="<html><body>not an audit</body></html>",
            headers={"Content-Type": "text/html"},
        )
        assert resp.status_code == 422
