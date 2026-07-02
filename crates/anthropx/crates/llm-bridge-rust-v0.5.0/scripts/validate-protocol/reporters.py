"""Report generator for protocol transform validation results.

Produces human-readable terminal output and machine-readable JSON reports.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from validators import FieldError, ValidationResult

logger = logging.getLogger(__name__)


@dataclass
class FixtureResult:
    """Aggregated validation result for a single fixture."""

    fixture_name: str
    direction: str
    transform_ok: bool
    transform_error: str | None = None
    structure_result: ValidationResult | None = None
    semantic_notes: list[str] | None = None
    skipped: bool = False
    skip_reason: str = ""


def generate_report(results: list[FixtureResult]) -> str:
    """Generate a terminal-friendly summary report.

    Args:
        results: List of ``FixtureResult`` instances from validation runs.

    Returns:
        A multi-line string suitable for terminal output.
    """
    lines: list[str] = []
    lines.append("=" * 60)
    lines.append("Protocol Transform Validation Report")
    lines.append("=" * 60)
    lines.append("")

    passed_count = 0
    failed_count = 0
    skipped_count = 0

    for r in results:
        if r.skipped:
            icon = "⌛ SKIP"
            skipped_count += 1
        elif r.structure_result is not None and r.structure_result.passed:
            icon = "✅ PASS"
            passed_count += 1
        else:
            icon = "❌ FAIL"
            failed_count += 1

        lines.append(f"[{icon}] {r.direction}/{r.fixture_name}")
        lines.append(
            f"  Transform:      {'OK' if r.transform_ok else 'ERROR: ' + (r.transform_error or 'unknown')}"
        )
        if r.structure_result:
            lines.append(
                f"  Structure:      {'PASS' if r.structure_result.passed else 'FAIL'}"
            )
            for err in r.structure_result.errors:
                lines.append(
                    f"    - {err.path}: {err.error_type} (expected={err.expected})"
                )
            for w in r.structure_result.warnings:
                lines.append(f"    WARNING: {w}")
        else:
            lines.append("  Structure:      SKIP (transform failed)")
        if r.semantic_notes:
            for note in r.semantic_notes:
                lines.append(f"  Semantic:       {note}")
        lines.append("")

    lines.append("-" * 60)
    lines.append(
        f"Summary: {passed_count} passed, {failed_count} failed, {skipped_count} skipped"
    )
    lines.append("=" * 60)

    return "\n".join(lines)


def write_json_report(results: list[FixtureResult], path: Path) -> None:
    """Write a machine-readable JSON report to disk.

    Args:
        results: List of ``FixtureResult`` instances.
        path: Output file path.
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    serializable: list[dict[str, Any]] = []
    for r in results:
        entry: dict[str, Any] = {
            "fixture_name": r.fixture_name,
            "direction": r.direction,
            "transform_ok": r.transform_ok,
            "skipped": r.skipped,
        }
        if r.transform_error:
            entry["transform_error"] = r.transform_error
        if r.structure_result:
            entry["structure_passed"] = r.structure_result.passed
            entry["structure_errors"] = [
                {"path": e.path, "error_type": e.error_type, "expected": e.expected}
                for e in r.structure_result.errors
            ]
            entry["structure_warnings"] = r.structure_result.warnings
        if r.semantic_notes:
            entry["semantic_notes"] = r.semantic_notes
        if r.skip_reason:
            entry["skip_reason"] = r.skip_reason
        serializable.append(entry)

    path.write_text(
        json.dumps(serializable, indent=2, ensure_ascii=False), encoding="utf-8"
    )
