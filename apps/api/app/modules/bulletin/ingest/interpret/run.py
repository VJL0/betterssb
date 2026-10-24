"""Interpret one edition's extracts into loadable records, offline.

Reads `extracted/<edition>/` (what `extract` wrote) and writes
`interpreted/<edition>/` (see `output.py`). Every step is a pure function of
the extracts, records are written sorted, and `summary.json` fingerprints the
result, so unchanged inputs give byte-identical files and `import` recognizes
a batch it already holds.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

from pydantic import BaseModel

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.extract.classify import PageKind, edition_path
from app.modules.bulletin.ingest.extract.program_index import ProgramIndex
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.run import (
    EXTRACTOR_VERSION,
    CourseEntry,
    ExtractedPage,
    ExtractionIssue,
)
from app.modules.bulletin.ingest.interpret import catalog
from app.modules.bulletin.ingest.interpret.output import (
    COURSES_FILE,
    DESIGNATIONS_FILE,
    INTERPRETER_VERSION,
    ISSUES_FILE,
    POLICIES_FILE,
    PROGRAMS_FILE,
    RECORD_FILES,
    SUMMARY_FILE,
    UNITS_FILE,
    CourseOut,
    CoursePartOut,
    DesignationOut,
    InterpretedSummary,
    IssueOut,
    PlanOut,
    PolicyOut,
    ProgramOut,
    UnitOut,
)
from app.modules.bulletin.ingest.interpret.requirements import interpret_program
from app.modules.bulletin.ingest.interpret.requisites import interpret_requisites
from app.modules.bulletin.ingest.records import Evidence
from app.modules.bulletin.rules import (
    RULES_VERSION,
    Interpretation,
    RequirementNode,
    SourceRef,
    Validation,
)

LEVEL_LISTING_PREFIXES = {
    "/undergraduate/courses/": "undergraduate",
    "/graduate/courses/": "graduate",
}
POLICY_PAGE_KINDS = frozenset(
    {
        PageKind.POLICY,
        PageKind.GENERAL_EDUCATION,
        PageKind.INFORMATION,
        PageKind.ACADEMIC_UNIT,
        PageKind.PROGRAM_LIST,
    }
)


def source_ref(evidence: Evidence) -> SourceRef:
    locator = evidence.locator
    return SourceRef(
        url=evidence.url,
        sha256=evidence.sha256,
        xpath=locator.xpath,
        line=locator.line,
        tab=locator.tab,
        page=locator.page,
        text=evidence.text,
    )


def listing_level(url: str) -> str | None:
    path = edition_path(url)
    return next(
        (
            level
            for prefix, level in LEVEL_LISTING_PREFIXES.items()
            if path.startswith(prefix)
        ),
        None,
    )


def course_out(entry: CourseEntry) -> CourseOut:
    course = entry.course
    listings = [course.evidence, *entry.also_listed_on]
    levels = sorted({level for e in listings if (level := listing_level(e.url))})
    requisites = interpret_requisites(course)
    requisite_codes = {code for r in requisites for code in r.courses}
    return CourseOut(
        subject=course.subject,
        number=course.number,
        title=course.title,
        description=course.description,
        credits=course.credits,
        levels=levels,
        parts=[
            CoursePartOut(
                label=part.label, text=part.text, source=source_ref(part.evidence)
            )
            for part in course.parts
        ],
        attributes=course.attributes,
        requisites=requisites,
        mentioned=[c for c in course.referenced_courses if c not in requisite_codes],
        source=source_ref(course.evidence),
    )


def _nodes(nodes: list[RequirementNode]):
    for node in nodes:
        yield node
        yield from _nodes(node.children)


def program_out(
    program: ProgramPage,
    index: ProgramIndex | None,
    edition: str,
    units: list[catalog.AcademicUnit],
) -> ProgramOut:
    facts = catalog.describe_program(program, index, edition, units)
    requirements = interpret_program(program)
    return ProgramOut(
        path=edition_path(program.url),
        url=program.url,
        sha256=program.sha256,
        source_url=program.source_url,
        name=program.name,
        level=facts.level,
        credential=facts.credential_type,
        award=facts.award or "",
        program_code=facts.program_codes[0] if facts.program_codes else None,
        unit_slug=facts.unit_key,
        campuses=facts.campuses,
        facts=facts.model_dump(
            mode="json", exclude={"edition", "url", "name", "listing_evidence"}
        )
        | {"labeled": {fact.label: fact.value for fact in program.facts}},
        requirements=requirements,
        plans=[
            PlanOut(
                position=plan.index,
                label=" › ".join(plan.section) or "Suggested plan",
                total_hours=plan.total_hours,
                terms=[term.model_dump(mode="json") for term in plan.terms],
                footnotes=[
                    {"marker": f.marker, "text": f.text, "courses": f.courses}
                    for f in plan.footnotes
                ],
                source=source_ref(plan.evidence),
            )
            for plan in program.plans
        ],
    )


def policy_out(section: catalog.PolicySection, position: int) -> PolicyOut:
    return PolicyOut(
        url=section.url,
        sha256=section.sha256,
        source_url=section.source_url,
        position=position,
        page_kind=section.page_kind,
        page_title=section.page_heading,
        headings=section.heading_path,
        tab=section.tab_label or section.tab,
        topic=section.topic,
        body="\n\n".join(block.text for block in section.blocks),
        sources=[source_ref(block.evidence) for block in section.blocks],
    )


def unit_out(unit: catalog.AcademicUnit) -> UnitOut:
    return UnitOut(
        slug=unit.key,
        name=unit.name,
        parent_slug=unit.parent_key,
        kind=unit.kind,
        level=unit.level,
        url=unit.url,
        sha256=unit.evidence.sha256,
        source_url=unit.evidence.url if unit.evidence.url != unit.url else None,
    )


def _read_models[T: BaseModel](path: Path, model: type[T]) -> list[T]:
    with path.open() as handle:
        return [model.model_validate_json(line) for line in handle if line.strip()]


def _write(path: Path, records: list[BaseModel]) -> None:
    with path.open("w") as handle:
        for record in records:
            handle.write(record.model_dump_json(exclude_defaults=True) + "\n")


def requirement_issues(program: ProgramOut) -> list[IssueOut]:
    issues = []
    tree = program.requirements
    for node in _nodes([*tree.roots, *tree.prose]):
        if node.validation is Validation.FAILED:
            issues.append(
                IssueOut(
                    stage="interpret",
                    code="requirement_check_failed",
                    severity="warning",
                    url=program.url,
                    detail=f"{node.id}: {'; '.join(node.notes)}",
                )
            )
        if not node.sources:
            issues.append(
                IssueOut(
                    stage="interpret",
                    code="requirement_without_source",
                    severity="error",
                    url=program.url,
                    detail=node.id,
                )
            )
    return issues


def interpret_edition(
    state: CrawlState, extracted: Path, output: Path
) -> InterpretedSummary:
    del state  # Interpretation reads only the extracts; kept for symmetry.
    edition = extracted.name
    pages = _read_models(extracted / "pages.jsonl", ExtractedPage)
    entries = _read_models(extracted / "courses.jsonl", CourseEntry)
    program_pages = _read_models(extracted / "programs.jsonl", ProgramPage)
    index_path = extracted / "program_index.json"
    index = (
        ProgramIndex.model_validate_json(index_path.read_text())
        if index_path.exists()
        else None
    )
    extraction_issues = _read_models(extracted / "issues.jsonl", ExtractionIssue)

    units = catalog.academic_units(pages, edition, index)
    courses = sorted(
        (course_out(e) for e in entries), key=lambda c: (c.subject, c.number)
    )
    programs = sorted(
        (program_out(p, index, edition, units) for p in program_pages),
        key=lambda p: p.path,
    )
    policies: list[PolicyOut] = []
    designations: list[DesignationOut] = []
    for page in sorted(pages, key=lambda p: p.document.url):
        if page.kind in POLICY_PAGE_KINDS:
            for position, section in enumerate(catalog.policy_sections(page, edition)):
                if section.blocks:
                    policies.append(policy_out(section, position))
        if page.kind is PageKind.GENERAL_EDUCATION:
            designations.extend(
                DesignationOut(
                    designation=d.designation,
                    role=d.role,
                    item=d.item_index,
                    course=d.course,
                    source=source_ref(d.evidence),
                )
                for d in catalog.course_designations(page, edition)
            )

    issues = [
        IssueOut(
            stage="extract",
            code=i.code,
            severity=i.severity,
            url=i.url,
            detail=i.detail,
        )
        for i in extraction_issues
    ]
    path_counts = Counter(p.path for p in programs)
    issues += [
        IssueOut(
            stage="interpret", code="duplicate_program_path", severity="error", url=path
        )
        for path, n in path_counts.items()
        if n > 1
    ]
    for program in programs:
        issues += requirement_issues(program)
    issues.sort(key=lambda i: (i.stage, i.code, i.url, i.detail))

    output.mkdir(parents=True, exist_ok=True)
    _write(output / COURSES_FILE, courses)
    _write(output / PROGRAMS_FILE, programs)
    _write(output / UNITS_FILE, sorted(map(unit_out, units), key=lambda u: u.slug))
    _write(output / POLICIES_FILE, policies)
    _write(output / DESIGNATIONS_FILE, designations)
    _write(output / ISSUES_FILE, issues)

    digest = hashlib.sha256()
    for name in (EXTRACTOR_VERSION, INTERPRETER_VERSION, RULES_VERSION):
        digest.update(name.encode() + b"\0")
    for name in RECORD_FILES:
        digest.update(name.encode() + b"\0" + (output / name).read_bytes())
    requisites = [r for c in courses for r in c.requisites]
    nodes = [n for p in programs for n in _nodes([*p.requirements.roots])]
    counts = {
        "courses": len(courses),
        "programs": len(programs),
        "plans": sum(len(p.plans) for p in programs),
        "units": len(units),
        "policy_sections": len(policies),
        "designations": len(designations),
        "issues": len(issues),
        "requisites": len(requisites),
        "requirement_nodes": len(nodes),
        **{
            f"requisites.{i.value}": sum(r.interpretation is i for r in requisites)
            for i in Interpretation
        },
        **{
            f"requirement_nodes.{i.value}": sum(n.interpretation is i for n in nodes)
            for i in Interpretation
        },
        **{
            f"requirement_nodes.{v.value}": sum(n.validation is v for n in nodes)
            for v in Validation
        },
    }
    summary = InterpretedSummary(
        edition=edition,
        extractor_version=EXTRACTOR_VERSION,
        rules_version=RULES_VERSION,
        fingerprint=digest.hexdigest(),
        counts=counts,
    )
    (output / SUMMARY_FILE).write_text(
        json.dumps(summary.model_dump(mode="json"), indent=2, sort_keys=True) + "\n"
    )
    return summary
