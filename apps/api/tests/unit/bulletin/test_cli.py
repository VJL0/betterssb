import pytest

from app.modules.bulletin.ingest.__main__ import main


@pytest.mark.parametrize("environment", [None, "production", "preview"])
def test_ingestion_requires_explicit_development(monkeypatch, tmp_path, environment):
    monkeypatch.setattr("sys.argv", ["ingest", "status"])
    monkeypatch.setenv("BULLETIN_DATA_DIR", str(tmp_path / "untouched"))
    if environment is None:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("ENVIRONMENT", environment)
    with pytest.raises(SystemExit, match="requires ENVIRONMENT=development"):
        main()
    assert not (tmp_path / "untouched").exists()
