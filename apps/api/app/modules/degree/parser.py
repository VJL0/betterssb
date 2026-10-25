"""Parse a Temple University Bulletin program page into a DegreeProgram.

A program page is a set of tabs (Overview, Requirements, Academic Plan,
Admission, Program Requirements, Optional Concentration, Accelerated
Programs, Contacts). Each tab is a flat run of headings and blocks:
paragraphs (often "Label: value"), nested lists, CourseLeaf course lists,
plan grids, footnote lists and plain tables. Every block is kept as a page
section; course lists, plan grids, contacts and linked programs are also
parsed into their own structures.
"""

from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from app.modules.degree.bulletin_html import (
    clean,
    course_codes,
    footnote_map,
    full_url,
    lines,
    text,
)
from app.modules.degree.course_tables import (
    is_lab_sequence_table,
    parse_course_list,
    parse_lab_sequences,
    parse_plan_grid,
)
from app.modules.degree.program_index import bulletin_edition
from app.modules.degree.schemas import (
    Contact,
    DegreeProgram,
    Fact,
    Link,
    LinkedProgram,
    ListItem,
    PageBlock,
    PageSection,
    RequirementCategory,
)

# Page titles end in the site name: "Computer Science BS < Temple University".
TITLE_SUFFIX_RE = re.compile(r"\s+[<|]\s+")
PROGRAM_CODE_RE = re.compile(r"Program Code:\s*([\w\-]+)")
CREDITS_IN_NAME_RE = re.compile(r"\((\d+(?:\s*-\s*\d+)?)\s*s\.h\.\)")
PHONE_RE = re.compile(r"\b\d{3}[-.]\d{3}[-.]\d{4}\b")
MAILTO = "mailto:"
BREADCRUMB_SEPARATOR = "›"
HEADING_TAGS = ("h2", "h3", "h4", "h5")
# Lists and tables nested in a block belong to it, not to its own text.
NESTED_BLOCKS = frozenset({"ul", "ol", "table", "dl"})
COURSE_LIST = "sc_courselist"
PLAN_GRID = "sc_plangrid"
FOOTNOTES = "sc_footnotes"
MINOR = "Minor"
CERTIFICATE = "Certificate"
APPLIES_TO_PREFIX = "These requirements are for students who"
LEARN_MORE_PREFIX = "Learn more about"
CONTACT_HEADING = "contact"
ACCELERATED_HEADING = "accelerated"
DISTINCTION_HEADING = "distinction"
INDIVIDUAL_CONTACT = "indivcontact"
ADDRESS_CONTACT = "addrcontact"
# Requirement tabs, whose course lists give the program's own footnotes.
REQUIREMENT_TABS = ("Requirements", "Program Requirements")
# A course list whose name has one of these words holds the program's own credits.
PROGRAM_LIST_RE = re.compile(r"\b(major|minor|program|certificate)\b", re.IGNORECASE)
CAMPUS_LABEL = "campus location"
# A short bold line with no sentence end names the college whose programs follow.
GROUP_LINE_MAX_LENGTH = 100


class BulletinParser:
    """Parses a saved Temple University Bulletin HTML page into a DegreeProgram."""

    def parse(self, html: str, url: str = "") -> DegreeProgram:
        soup = BeautifulSoup(html, "lxml")
        content = soup.select_one("#contentarea") or soup
        breadcrumb = _breadcrumb(soup)
        title_tag = soup.find("title")
        name = (
            TITLE_SUFFIX_RE.split(clean(title_tag.get_text()))[0] if title_tag else ""
        )
        program = DegreeProgram(
            name=name,
            degree_type=_degree_type(name, soup),
            college=breadcrumb[-2] if len(breadcrumb) > 2 else _active_college(soup),
            level=breadcrumb[1] if len(breadcrumb) > 1 else "",
            breadcrumb=breadcrumb,
            bulletin_url=url,
            bulletin_year=bulletin_edition(soup.get_text()),
            pdf_url=_pdf_url(soup),
            archive_notice=text(soup.select_one(".archive-message")),
        )

        for container in _tab_containers(content):
            tab = _tab_label(soup, container)
            program.tabs.append(tab)
            _read_tables(program, container, tab)
            block_contacts = _block_contacts(container)
            for section in _sections(container, tab):
                program.sections.append(section)
                # Graduate contact blocks are read whole, not paragraph by paragraph.
                _read_section(program, section, read_contacts=not block_contacts)
            program.contacts.extend(block_contacts)

        program.facts = [
            Fact(tab=s.tab, label=b.label, value=" ".join(b.lines))
            for s in program.sections
            for b in s.blocks
            if b.label
        ]
        facts = {f.label.lower(): f.value for f in program.facts}
        program.program_code = facts.get("program code") or _regex(
            PROGRAM_CODE_RE, soup.get_text()
        )
        program.campus = next(
            (
                f.value
                for f in program.facts
                if f.label.lower().startswith(CAMPUS_LABEL)
            ),
            "",
        )
        program.suggested_plan = (
            program.suggested_plans[0] if program.suggested_plans else None
        )
        program.total_credits = _program_credits(program.categories)
        program.footnotes = list(
            dict.fromkeys(
                [
                    note
                    for category in program.categories
                    if category.tab in REQUIREMENT_TABS
                    for note in category.notes
                ]
                + [
                    note
                    for seq in program.lab_science_sequences
                    for note in seq.footnotes
                ]
            )
        )
        return program


# ---------------------------------------------------------------------------
# Page metadata
# ---------------------------------------------------------------------------


def _breadcrumb(soup: BeautifulSoup) -> list[str]:
    crumbs = soup.select_one("#breadcrumb")
    if crumbs is None:
        return []
    parts = (clean(p) for p in crumbs.get_text().split(BREADCRUMB_SEPARATOR))
    return [part for part in parts if part]


def _degree_type(name: str, soup: BeautifulSoup) -> str:
    """The degree abbreviation in the page name ("BS", "BSArch", "PhD"), or "Minor"/"Certificate"."""
    for token in name.replace(":", " ").split():
        capitals = sum(c.isupper() for c in token)
        if 2 <= len(token) <= 8 and token[0].isupper() and capitals >= 2:
            return token
    if MINOR in name.split():
        return MINOR
    if CERTIFICATE in name:
        return CERTIFICATE
    page = soup.get_text()
    if "Bachelor of Science" in page:
        return "BS"
    if "Bachelor of Arts" in page:
        return "BA"
    return ""


def _active_college(soup: BeautifulSoup) -> str:
    for li in soup.find_all("li", class_="isparent"):
        if "active" not in (li.get("class") or []):
            continue
        a = li.find("a", recursive=False)
        if a and clean(a.get_text()).startswith(("College of", "School of")):
            return clean(a.get_text())
    return ""


def _pdf_url(soup: BeautifulSoup) -> str:
    """The "Download Page (PDF)" link, not the whole-Bulletin PDFs beside it."""
    for a in soup.find_all("a", href=True):
        if a["href"].endswith(".pdf") and "page" in clean(a.get_text()).lower():
            return full_url(a["href"])
    return ""


def _regex(pattern: re.Pattern[str], value: str) -> str:
    match = pattern.search(value)
    return match.group(1).strip() if match else ""


def _program_credits(categories: list[RequirementCategory]) -> str:
    """Credits for the program itself: its major (or minor, certificate…) list, else the first total."""
    for category in categories:
        if category.total_credits and PROGRAM_LIST_RE.search(category.name):
            return category.total_credits
    return next((c.total_credits for c in categories if c.total_credits), "")


# ---------------------------------------------------------------------------
# Tabs and sections
# ---------------------------------------------------------------------------


def _tab_containers(content: Tag) -> list[Tag]:
    containers = content.select("div.tab_content")
    if containers:
        return containers
    # Pages saved without their tab markup still keep these containers.
    return content.find_all("div", id=re.compile(r"textcontainer$"))


def _tab_label(soup: BeautifulSoup, container: Tag) -> str:
    tab = soup.find(id=container.get("aria-labelledby") or "")
    label = clean(tab.get_text()) if tab is not None else ""
    return label or (container.get("id") or "").removesuffix("container").removesuffix(
        "text"
    )


def _sections(container: Tag, tab: str) -> list[PageSection]:
    sections: list[PageSection] = []
    stack: list[tuple[int, str]] = []
    current: PageSection | None = None

    def section() -> PageSection:
        nonlocal current
        if current is None:
            current = PageSection(tab=tab, headings=[h for _, h in stack])
            sections.append(current)
        return current

    def walk(el: Tag) -> None:
        nonlocal current
        for child in el.find_all(True, recursive=False):
            classes = child.get("class") or []
            if child.name in HEADING_TAGS:
                level = int(child.name[1])
                while stack and stack[-1][0] >= level:
                    stack.pop()
                if heading := text(child):
                    stack.append((level, heading))
                current = None
            elif child.name == "p":
                if block := _paragraph(child):
                    section().blocks.append(block)
            elif child.name in ("ul", "ol"):
                section().blocks.append(_list_block(child))
            elif child.name == "table" and not {COURSE_LIST, PLAN_GRID} & set(classes):
                rows = [
                    [text(cell) for cell in tr.find_all(["td", "th"])]
                    for tr in child.find_all("tr")
                ]
                section().blocks.append(
                    PageBlock(kind="table", rows=[r for r in rows if any(r)])
                )
            elif child.name == "div":
                walk(child)

    walk(container)
    return [s for s in sections if s.blocks]


def _paragraph(p: Tag) -> PageBlock | None:
    found = lines(p)
    if not found:
        return None
    label = ""
    first = p.find(True, recursive=False)
    lead = (
        clean(first.get_text()) if first is not None and first.name == "strong" else ""
    )
    if lead.endswith(":") and found[0].startswith(lead):
        label = lead.rstrip(":").strip()
        found[0] = found[0][len(lead) :].strip()
        found = [line for line in found if line]
    return PageBlock(
        kind="paragraph",
        label=label,
        lines=found,
        links=_links(p),
        courses=course_codes(p),
    )


def _list_block(list_el: Tag) -> PageBlock:
    items: list[ListItem] = []

    def walk(el: Tag, level: int) -> None:
        for li in el.find_all("li", recursive=False):
            if item_text := text(li, skip=NESTED_BLOCKS):
                items.append(ListItem(text=item_text, level=level))
            for nested in li.find_all(["ul", "ol"], recursive=False):
                walk(nested, level + 1)

    walk(list_el, 0)
    return PageBlock(
        kind="list", items=items, links=_links(list_el), courses=course_codes(list_el)
    )


def _links(el: Tag) -> list[Link]:
    return [
        Link(text=clean(a.get_text()), url=full_url(a["href"].strip()))
        for a in el.find_all("a", href=True)
        if "bubblelink" not in (a.get("class") or []) and clean(a.get_text())
    ]


# ---------------------------------------------------------------------------
# Course lists and plan grids
# ---------------------------------------------------------------------------


def _read_tables(program: DegreeProgram, container: Tag, tab: str) -> None:
    for table in container.find_all("table"):
        classes = table.get("class") or []
        after = table.find_next_sibling(True)
        notes = footnote_map(
            after
            if after is not None and FOOTNOTES in (after.get("class") or [])
            else None
        )
        if PLAN_GRID in classes:
            plan_name, subtitle = _plan_headings(table, container)
            program.suggested_plans.append(
                parse_plan_grid(table, notes, name=plan_name, subtitle=subtitle)
            )
        elif COURSE_LIST in classes and is_lab_sequence_table(table):
            program.lab_science_title = (
                program.lab_science_title or _table_context(table, container)[0]
            )
            program.lab_science_sequences.extend(parse_lab_sequences(table, notes))
        elif COURSE_LIST in classes:
            name, description = _table_context(table, container)
            groups, total = parse_course_list(table, notes)
            if not groups and not total:
                continue
            program.categories.append(
                RequirementCategory(
                    name=name,
                    tab=tab,
                    total_credits=total or _regex(CREDITS_IN_NAME_RE, name),
                    description=description,
                    groups=groups,
                    notes=list(notes.values()),
                )
            )


def _table_context(table: Tag, container: Tag) -> tuple[str, str]:
    """A course list's name and introduction, from the list items or headings around it."""
    items = [li for li in table.parents if li.name == "li" and container in li.parents]
    if items:
        outer = lines(items[-1], skip=NESTED_BLOCKS)
        name = outer[0] if outer else ""
        if len(items) > 1:
            return name, text(items[0], skip=NESTED_BLOCKS)
        return name, " ".join(outer[1:])
    previous = table.find_previous_sibling(True)
    description = (
        text(previous) if previous is not None and previous.name == "p" else ""
    )
    return _previous_heading(table, container), description


def _previous_heading(el: Tag, container: Tag) -> str:
    for heading in el.find_all_previous(HEADING_TAGS):
        if container in heading.parents:
            return text(heading)
    return ""


def _plan_headings(table: Tag, container: Tag) -> tuple[str, str]:
    """A plan grid's name (the h2 or h3 above it) and subtitle (an h4 or h5 between)."""
    subtitle = ""
    for heading in table.find_all_previous(HEADING_TAGS):
        if container not in heading.parents:
            break
        if heading.name in ("h4", "h5") and not subtitle:
            subtitle = text(heading)
        elif heading.name in ("h2", "h3"):
            return text(heading), subtitle
    return "", subtitle


# ---------------------------------------------------------------------------
# Sections into program fields
# ---------------------------------------------------------------------------


def _read_section(
    program: DegreeProgram, section: PageSection, *, read_contacts: bool = True
) -> None:
    headings = [h.lower() for h in section.headings]
    in_contacts = any(CONTACT_HEADING in h for h in headings)
    in_accelerated = section.tab.lower().startswith(ACCELERATED_HEADING) or any(
        ACCELERATED_HEADING in h for h in headings
    )
    group = ""
    for block in section.blocks:
        if block.kind == "paragraph":
            joined = " ".join(block.lines)
            if joined.startswith(APPLIES_TO_PREFIX) and not program.applies_to:
                program.applies_to = joined
            if learn_more := next(
                (
                    link
                    for link in block.links
                    if link.text.startswith(LEARN_MORE_PREFIX)
                ),
                None,
            ):
                program.program_page_url = program.program_page_url or learn_more.url
                continue
        if in_contacts and read_contacts and block.kind == "paragraph":
            sub_group = (
                section.headings[-1] if CONTACT_HEADING not in headings[-1] else ""
            )
            if contact := _contact(block.lines, block.links, sub_group):
                program.contacts.append(contact)
        elif in_accelerated and block.kind == "paragraph" and _is_group_line(block):
            # A bold college name ("College of Science and Technology") heads the list after it.
            group = " ".join(block.lines)
        elif in_accelerated and block.kind == "list":
            _add_linked_programs(program, block.links, group)
        elif headings and DISTINCTION_HEADING in headings[-1] and block.kind == "list":
            program.distinction_criteria.extend(item.text for item in block.items)
    if section.tab == program.tabs[0] and len(section.headings) <= 1:
        program.overview.extend(
            " ".join(b.lines)
            for b in section.blocks
            if b.kind == "paragraph" and not b.label and not b.links
        )


def _is_group_line(block: PageBlock) -> bool:
    joined = " ".join(block.lines)
    return (
        not block.links
        and len(joined) <= GROUP_LINE_MAX_LENGTH
        and not joined.endswith((".", ":"))
    )


def _add_linked_programs(program: DegreeProgram, links: list[Link], group: str) -> None:
    seen = {p.url for p in program.accelerated_programs}
    for link in links:
        if link.url not in seen and not link.url.startswith(MAILTO):
            seen.add(link.url)
            program.accelerated_programs.append(
                LinkedProgram(name=link.text, url=link.url, group=group)
            )


def _contact(found: list[str], links: list[Link], group: str) -> Contact | None:
    """A contact from its lines: "Name, Title", then rooms, phone and email in any order."""
    if not found:
        return None
    email = next(
        (l.url.removeprefix(MAILTO).strip() for l in links if l.url.startswith(MAILTO)),
        "",
    )
    phone = next((m.group() for line in found if (m := PHONE_RE.search(line))), "")
    first, *rest = found
    name, _, title = first.partition(",")
    return Contact(
        name=name.strip(),
        title=title.strip(),
        group=group,
        details=[line for line in rest if line not in (email, phone)],
        email=email,
        phone=phone,
        url=next((l.url for l in links if not l.url.startswith(MAILTO)), ""),
    )


def _block_contacts(container: Tag) -> list[Contact]:
    """Graduate pages' contact blocks: a role then a person, or a heading then an address."""
    contacts: list[Contact] = []
    for block in container.select(f"div.{INDIVIDUAL_CONTACT}"):
        found = lines(block)
        if len(found) > 1 and (
            contact := _contact(found[1:], _links(block), found[0].rstrip(":"))
        ):
            contacts.append(contact)
    for block in container.select(f"div.{ADDRESS_CONTACT}"):
        label, found, links = "", [], []
        for child in [*block.find_all(True, recursive=False), None]:
            if child is None or child.name in HEADING_TAGS:
                if found and (contact := _contact(found, links, label)):
                    contacts.append(contact)
                label = text(child).rstrip(":").strip() if child is not None else ""
                found, links = [], []
            elif child.name == "p":
                found.extend(lines(child))
                links.extend(_links(child))
    return contacts
