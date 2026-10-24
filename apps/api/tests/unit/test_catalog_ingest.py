"""Catalog extraction must preserve evidence without inventing eligibility."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).parents[2] / "scripts/catalog_ingest/import_catalog.py"
spec = importlib.util.spec_from_file_location("import_catalog", SCRIPT)
catalog = importlib.util.module_from_spec(spec)


def setup_module():
    spec.loader.exec_module(catalog)


def test_course_references_keep_leading_zeroes_and_offsets():
    text = "Choose CIS 0801 or MATH 1041, not CIS 08010."
    references = list(catalog.course_references(text))
    assert [r["code"] for r in references] == ["CIS 0801", "MATH 1041"]
    for reference in references:
        assert text[reference["start"] : reference["end"]] == reference["code"]


def test_course_header_and_variable_credit_range():
    header = catalog.COURSE_HEADER.fullmatch(
        "CIS 4289. Field Experience. 1 to 4 Credit Hour."
    )
    assert header and header["number"] == "4289"
    assert header["minimum"] == "1" and header["maximum"] == "4"


def test_complex_prerequisite_remains_uninterpreted():
    text = (
        "Pre-requisites: Minimum grade of C- in (CIS 1068 or CIS 1051) and 'Y' in MC6."
    )
    result = catalog.rule_fields(text)
    assert result[0]["text"] == text
    assert result[0]["kind"] == "prerequisite"
    assert result[0]["executable"] is False


def test_rule_fields_do_not_consume_next_field():
    result = catalog.rule_fields(
        "Course Attributes: WI\nRepeatability: May repeat.\nPre-requisites: CIS 1068"
    )
    assert [r["kind"] for r in result] == [
        "attributes",
        "repeatability",
        "prerequisite",
    ]
    assert result[0]["text"] == "Course Attributes: WI"


def test_json_pointer_escaping_and_scalar_preservation():
    nodes = list(catalog.json_nodes({"a/b~c": [None, False, 0, ""]}))
    by_pointer = {n["pointer"]: n for n in nodes}
    assert by_pointer["/a~1b~0c/0"]["value"] is None
    assert by_pointer["/a~1b~0c/1"]["value"] is False
    assert by_pointer["/a~1b~0c/2"]["value"] == 0
    assert by_pointer["/a~1b~0c/3"]["value"] == ""


def test_catalog_version_mismatch_is_reported():
    assert catalog.context_warnings(
        {"source": {"catalog_year": "Fall 2024"}}, "2026-2027"
    )
    assert not catalog.context_warnings(
        {"source": {"catalog_year": "Fall 2026"}}, "2026-2027"
    )


def test_wrapped_course_title_is_joined():
    lines = [
        "CIS 4289. A long course title that",
        "wraps here. 1 to 4 Credit Hour.",
        "Description.",
    ]
    result = list(catalog.joined_course_lines(lines))
    assert catalog.COURSE_HEADER.fullmatch(result[0])
    assert result[1] == "Description."


def test_audit_edges_preserve_membership_and_mismatch(tmp_path):
    import json

    context = {
        "source": {"catalog_year": "Fall 2024"},
        "courses": [{"id": 7, "code": "CIS 2168", "grade": "RG"}],
        "requirements": [
            {"course_ids": [7], "or_edges": [[0, 1]], "eligible": ["CIS 1000 to 4999"]}
        ],
    }
    source = tmp_path / "audit.json"
    source.write_text(json.dumps(context))
    archive = catalog.Archive(tmp_path)
    warnings = catalog.extract_context(source, archive, "2026-2027")
    archive.close()
    edges = [
        json.loads(line) for line in (tmp_path / "edges.jsonl").read_text().splitlines()
    ]
    membership = [
        edge for edge in edges if edge["relation"] == "source_displayed_membership"
    ]
    assert membership[0]["target"] == "audit:/courses/0"
    assert membership[0]["evidence"]["does_not_prove_double_counting"]
    assert warnings
    records = [
        json.loads(line)
        for line in (tmp_path / "records.jsonl").read_text().splitlines()
    ]
    assert (
        next(row for row in records if row["key"] == "audit")["attributes"]["raw"]
        == context
    )


def test_verifier_detects_missing_pages_and_checksum_changes(tmp_path, capsys):
    import argparse
    import json

    import pytest

    source = tmp_path / "source.pdf"
    source.write_bytes(b"preserved source bytes")
    archive = catalog.Archive(tmp_path)
    archive.record("document", "document")
    archive.record(
        "page:1", "page", "Some text", 1, {"height": 792, "layout": {"blocks": []}}
    )
    archive.edge("document", "page:1", "contains_page")
    archive.close()
    manifest = {
        "sha256": catalog.digest(source),
        "page_count": 1,
        "counts": dict(archive.counts),
        "warnings": [],
        "limitations": [],
        "files": {
            name: catalog.digest(tmp_path / name)
            for name in ["source.pdf", "records.jsonl", "edges.jsonl"]
        },
    }
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest))
    args = argparse.Namespace(input=tmp_path)
    assert catalog.verify(args)["all_pages_present"]
    manifest["page_count"] = 2
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="source pages"):
        catalog.verify(args)
    source.write_bytes(b"changed source bytes")
    with pytest.raises(ValueError, match="checksum"):
        catalog.verify(args)


def test_cohort_and_registration_restrictions_are_separate_fields():
    fields = catalog.rule_fields(
        "Cohort Restrictions: Honors only.\nDegree Restrictions: BS.\nLevel Registration Restrictions: Undergraduate."
    )
    assert [field["kind"] for field in fields] == [
        "cohort_restriction",
        "degree_restriction",
        "level_registration_restriction",
    ]
    assert fields[0]["text"] == "Cohort Restrictions: Honors only."


def test_discrete_credit_options_are_not_a_continuous_range():
    header = catalog.COURSE_HEADER.fullmatch(
        "PHYS 1021. Introduction to General Physics I. 0 or 4 Credit Hours."
    )
    assert header and header["credit_operator"] == "or"
    assert header["minimum"] == "0" and header["maximum"] == "4"


def test_course_sentence_does_not_absorb_the_next_definition():
    lines = [
        "CHEM 3891. Students must get approval.",
        "CIS 1001. Introduction. 1 Credit Hour.",
    ]
    assert list(catalog.joined_course_lines(lines)) == lines


def test_font_evidence_prevents_prose_from_becoming_a_definition(tmp_path):
    archive = catalog.Archive(tmp_path)
    first = "CJ 4085. Criminal Justice Internship. 1 to 9 Credit Hour."
    second = "CJ 4097. Capstone. 3 Credit Hours."
    lines = [first, "CJ 4085. Must be taken with CJ 4075.", second, "Description."]
    pending = catalog.advance_courses(archive, None, lines, 1, set(), {first, second})
    catalog.save_course(archive, pending)
    archive.close()
    import json

    definitions = [
        json.loads(raw)
        for raw in (tmp_path / "records.jsonl").read_text().splitlines()
        if json.loads(raw)["kind"] == "course_definition"
    ]
    assert [row["attributes"]["code"] for row in definitions] == ["CJ 4085", "CJ 4097"]
    assert "Must be taken" in definitions[0]["text"]
    assert "Capstone" not in definitions[0]["text"]
    assert definitions[0]["attributes"]["credit_model"] == "range"
