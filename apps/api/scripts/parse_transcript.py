"""Local usage: uv run python -m scripts.parse_transcript INPUT.pdf --output result.json."""

from __future__ import annotations

import argparse
from pathlib import Path

from app.modules.transcript.pdf_parser import parse_pdf


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract a Banner transcript with source provenance."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path)
    arguments = parser.parse_args()
    try:
        result = parse_pdf(arguments.input.read_bytes())
    except (ValueError, OSError) as error:
        parser.exit(1, f"{error}\n")
    document = result.model_dump_json(indent=2) + "\n"
    if arguments.output:
        arguments.output.write_text(document)
    else:
        print(document, end="")


if __name__ == "__main__":
    main()
