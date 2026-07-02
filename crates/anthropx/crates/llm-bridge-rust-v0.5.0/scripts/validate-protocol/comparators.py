"""Semantic comparison with litellm (best-effort, informational only).

Uses litellm's transformation utilities to compare our output against
a reference implementation.  Because litellm primarily makes real API
calls rather than offline format conversions, comparison is
best-effort: unsupported directions are skipped gracefully.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class FieldDiff:
    """A single field-level difference between our output and litellm's."""

    path: str
    our_value: Any
    litellm_value: Any
    severity: str  # "info" | "warning" | "critical"


@dataclass
class ComparisonReport:
    """Aggregate result of a litellm comparison."""

    field_diffs: list[FieldDiff] = field(default_factory=list)
    missing_in_ours: list[str] = field(default_factory=list)
    extra_in_ours: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def compare_with_litellm(
    direction: str,
    input_request: dict[str, Any] | None,
    our_output: dict[str, Any] | None,
) -> ComparisonReport:
    """Compare our transform output against litellm's behavior.

    This is a **best-effort** comparison.  litellm does not expose a
    clean offline transform API; most directions will return a SKIP
    note.  The output is purely informational and does not affect the
    overall pass/fail verdict.

    Args:
        direction: Transform direction string.
        input_request: The original request body before transformation.
        our_output: The output our Rust core produced.

    Returns:
        ``ComparisonReport`` with any differences found, or notes
        explaining why comparison was skipped.
    """
    if input_request is None:
        return ComparisonReport(notes=["no input request — skip litellm comparison"])

    if our_output is None:
        return ComparisonReport(notes=["no output to compare"])

    # Try using litellm's parameter mapping utilities
    try:
        import litellm as _litellm  # noqa: F401
    except ImportError:
        return ComparisonReport(
            notes=["litellm not installed — skip semantic comparison"]
        )

    # litellm makes real API calls for most operations.
    # For offline use, we can only compare at the structural level.
    # Emit a SKIP note and let the report generator handle display.
    direction_notes: list[str] = []

    if direction.startswith("responses-") or direction.endswith("-responses"):
        direction_notes.append(
            "litellm does not support OpenAI Responses API format — "
            "semantic comparison skipped"
        )

    if not direction_notes:
        direction_notes.append(
            "litellm requires real API calls for semantic comparison — "
            "consider running with API keys for deeper validation"
        )

    return ComparisonReport(notes=direction_notes)
