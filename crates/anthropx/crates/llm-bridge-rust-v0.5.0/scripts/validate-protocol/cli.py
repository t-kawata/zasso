"""Main entry point for protocol transform validation.

Wires together fixture loading, Rust core invocation, structure validation,
semantic comparison, and report generation in one pipeline.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from fixtures import FixtureCase, load_all_fixtures
from runners import run_request_transform, run_stream_transform
from validators import (
    validate_anthropic_response,
    validate_openai_chat_request,
    validate_openai_chat_response,
    validate_openai_responses_response,
    validate_stream_sequence,
)
from comparators import compare_with_litellm
from reporters import FixtureResult, generate_report, write_json_report

logger = logging.getLogger(__name__)


def main() -> int:
    """Run the full validation pipeline. Returns 0 on success, 1 on failures."""
    parser = argparse.ArgumentParser(
        description="Validate protocol transform output against community SDKs"
    )
    parser.add_argument(
        "--fixture-root",
        type=Path,
        help="Path to fixtures/protocol-transform/ directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("logs/validate-protocol"),
        help="Directory for JSON report output",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable debug logging"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s: %(message)s",
    )

    # Locate fixture root relative to workspace
    if args.fixture_root:
        fixture_root = args.fixture_root
    else:
        fixture_root = _find_workspace_root() / "fixtures" / "protocol-transform"

    logger.info("Loading fixtures from %s", fixture_root)
    cases = load_all_fixtures(fixture_root)

    if not cases:
        logger.warning("No fixtures found — nothing to validate")
        return 0

    results: list[FixtureResult] = []
    for case in cases:
        logger.info("Processing: %s/%s", case.direction, case.name)

        if case.mode == "stream":
            result = _validate_stream_case(case)
        else:
            result = _validate_non_stream_case(case)

        results.append(result)

    # Generate reports
    report = generate_report(results)
    print(report)

    json_path = args.output_dir / "report.json"
    write_json_report(results, json_path)
    logger.info("JSON report written to %s", json_path)

    # Exit code: non-zero if any structure validation failed
    any_failed = any(
        r.structure_result is not None and not r.structure_result.passed
        for r in results
    )
    return 1 if any_failed else 0


def _validate_non_stream_case(case: FixtureCase) -> FixtureResult:
    """Validate a non-streaming fixture case."""
    if case.input_request is None:
        return FixtureResult(
            fixture_name=case.name,
            direction=case.direction,
            transform_ok=False,
            transform_error="missing input_request",
            skipped=True,
            skip_reason="missing input_request",
        )

    # Run transform
    transform_result = run_request_transform(case.direction, case.input_request)

    if not transform_result.success:
        return FixtureResult(
            fixture_name=case.name,
            direction=case.direction,
            transform_ok=False,
            transform_error=transform_result.error or "unknown error",
            skipped=False,
        )

    # Structure validation — pick the right validator based on direction
    target_format = _target_format(case.direction)
    structure_result = _validate_output_structure(
        target_format, transform_result.output, mode=case.mode
    )

    # Semantic comparison
    comparison = compare_with_litellm(
        case.direction, case.input_request.get("body"), transform_result.output
    )

    return FixtureResult(
        fixture_name=case.name,
        direction=case.direction,
        transform_ok=True,
        structure_result=structure_result,
        semantic_notes=comparison.notes if comparison else None,
    )


def _validate_stream_case(case: FixtureCase) -> FixtureResult:
    """Validate a streaming fixture case."""
    if case.input_upstream_events is None:
        return FixtureResult(
            fixture_name=case.name,
            direction=case.direction,
            transform_ok=False,
            transform_error="missing input_upstream_events",
            skipped=True,
            skip_reason="missing input_upstream_events",
        )

    transform_result = run_stream_transform(case.direction, case.input_upstream_events)

    if not transform_result.success:
        return FixtureResult(
            fixture_name=case.name,
            direction=case.direction,
            transform_ok=False,
            transform_error=transform_result.error or "unknown error",
            skipped=False,
        )

    # Validate stream sequence
    target_format = _target_format(case.direction)
    structure_result = validate_stream_sequence(
        transform_result.output_sse or [], target_format
    )

    return FixtureResult(
        fixture_name=case.name,
        direction=case.direction,
        transform_ok=True,
        structure_result=structure_result,
        semantic_notes=None,
    )


def _target_format(direction: str) -> str:
    """Map direction string to target format for validation."""
    mapping: dict[str, str] = {
        "anthropic-to-openai": "openai",
        "openai-to-anthropic": "anthropic",
        "anthropic-to-responses": "responses",
        "responses-to-anthropic": "anthropic",
        "responses-to-openai": "openai",
        "openai-chat-to-responses": "responses",
    }
    return mapping.get(direction, "openai")


def _validate_output_structure(
    target: str, output: dict | None, mode: str = "non_stream"
) -> "ValidationResult | None":
    """Pick the right validator for the target format.

    For non-stream (request) transforms, validates the output as a request body.
    For stream (response) transforms, validates the output as a response body.
    """
    from validators import ValidationResult

    if output is None:
        return None

    body = output.get("body", output)

    # Use request validators for non-stream transforms (request bodies),
    # response validators for stream transforms (response bodies).
    if mode == "non_stream":
        validators = {
            "openai": validate_openai_chat_request,
            "anthropic": validate_anthropic_response,
            "responses": validate_openai_chat_request,  # Responses API request
        }
    else:
        validators = {
            "openai": validate_openai_chat_response,
            "anthropic": validate_anthropic_response,
            "responses": validate_openai_responses_response,
        }

    validator = validators.get(target)
    if validator is None:
        return ValidationResult(
            passed=True,
            warnings=[f"no structure validator for target: {target}"],
        )

    return validator(body)


def _find_workspace_root() -> Path:
    """Find the Cargo workspace root."""
    path = Path(__file__).resolve().parent
    while not (path / "Cargo.toml").exists():
        parent = path.parent
        if parent == path:
            return Path.cwd()
        path = parent
    return path


if __name__ == "__main__":
    sys.exit(main())
