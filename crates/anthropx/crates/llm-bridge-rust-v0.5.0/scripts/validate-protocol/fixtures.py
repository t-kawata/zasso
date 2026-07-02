"""Fixture loader for protocol transform validation.

Reads fixture JSON files from the `fixtures/protocol-transform/` directory
and parses them into `FixtureCase` instances for validation.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FixtureCase:
    """A single protocol transform test case loaded from a fixture file."""

    name: str
    direction: str
    fixture_path: Path
    mode: str  # "non_stream" or "stream"
    input_request: Optional[dict] = None
    input_upstream_events: Optional[list[dict]] = None
    expected_output: Optional[dict] = None
    expected_error: Optional[dict] = None
    notes: str = ""


def load_all_fixtures(root: Path) -> list[FixtureCase]:
    """Load all fixture JSON files from the fixture directory tree.

    Each subdirectory under `root` is treated as a transform direction
    (e.g., `anthropic-to-openai`).  Files ending in `.json` are parsed;
    non-JSON files (README.md, etc.) are skipped silently.

    Args:
        root: Path to the `fixtures/protocol-transform/` directory.

    Returns:
        A list of parsed `FixtureCase` instances, sorted by direction and name.
    """
    if not root.is_dir():
        logger.warning("Fixture root directory not found: %s", root)
        return []

    cases: list[FixtureCase] = []
    for sub_dir in sorted(root.iterdir()):
        if not sub_dir.is_dir():
            continue
        direction = sub_dir.name
        for fixture_file in sorted(sub_dir.iterdir()):
            if fixture_file.suffix != ".json":
                continue
            try:
                data = json.loads(fixture_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                logger.warning("Skipping malformed fixture %s: %s", fixture_file, e)
                continue

            case = _parse_fixture(direction, fixture_file, data)
            if case is not None:
                cases.append(case)

    return cases


def _parse_fixture(
    direction: str, fixture_path: Path, data: dict
) -> Optional[FixtureCase]:
    """Parse a single fixture JSON dict into a FixtureCase.

    Returns None if the fixture is missing required top-level fields.
    """
    if "name" not in data:
        logger.warning(
            "Fixture %s missing required 'name' field — skipping", fixture_path
        )
        return None

    name = data["name"]
    mode = data.get("mode", "non_stream")
    notes = data.get("notes", "")
    expected_error = data.get("expected_error")

    input_data = data.get("input", {})
    input_request = None
    input_upstream_events = None

    if mode == "stream":
        input_upstream_events = input_data.get("events", [])
        if not input_upstream_events:
            logger.warning(
                "Stream fixture %s has no input.events — skipping", fixture_path
            )
            return None
    else:
        input_request = {
            "headers": input_data.get("headers", {}),
            "path": input_data.get("path", ""),
            "body": input_data.get("body", {}),
        }

    expected_output = data.get("expected")

    return FixtureCase(
        name=name,
        direction=direction,
        fixture_path=fixture_path,
        mode=mode,
        input_request=input_request,
        input_upstream_events=input_upstream_events,
        expected_output=expected_output,
        expected_error=expected_error,
        notes=notes,
    )
