"""Rust Core CLI invoker for protocol transform validation.

Spawns the ``validate-cli`` Rust example via subprocess and captures
the transformed output.
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Duration in seconds before the subprocess is killed.
RUST_CLI_TIMEOUT: int = 30

# Map from our direction name to the Rust CLI direction name (for streaming).
STREAM_DIRECTION_MAP: dict[str, str] = {
    "anthropic-to-openai": "anthropic-to-openai",
    "openai-to-anthropic": "openai-to-anthropic",
    "anthropic-to-responses": "anthropic-to-responses",
    "responses-to-anthropic": "responses-to-anthropic",
    "openai-chat-to-responses": "openai-chat-to-responses",
}


@dataclass
class TransformResult:
    """Result of a single transform invocation."""

    success: bool
    output: dict[str, Any] | None = None
    output_sse: list[dict[str, Any]] | None = None
    error: str | None = None


def _cargo_root() -> Path:
    """Find the workspace root (where ``Cargo.toml`` lives)."""
    path = Path(__file__).resolve().parent
    while not (path / "Cargo.toml").exists():
        parent = path.parent
        if parent == path:
            return Path.cwd()
        path = parent
    return path


def run_request_transform(
    direction: str, input_request: dict[str, Any]
) -> TransformResult:
    """Run a non-streaming request transform through the Rust CLI.

    Args:
        direction: e.g. ``"anthropic-to-openai"``.
        input_request: Dict with ``headers``, ``path``, ``body`` keys.

    Returns:
        ``TransformResult`` with ``output`` populated on success.
    """
    rust_root = _cargo_root()

    payload = json.dumps(input_request, ensure_ascii=False)
    cmd = [
        "cargo",
        "run",
        "--example",
        "validate-cli",
        "--",
        "transform-request",
        "--direction",
        direction,
    ]

    try:
        proc = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            timeout=RUST_CLI_TIMEOUT,
            cwd=str(rust_root),
        )
    except subprocess.TimeoutExpired:
        return TransformResult(success=False, error="Rust CLI timed out")
    except FileNotFoundError:
        return TransformResult(
            success=False,
            error="cargo not found -- is Rust toolchain installed?",
        )

    if proc.returncode != 0:
        error_msg = proc.stderr.strip() or f"exit code {proc.returncode}"
        logger.debug("Rust CLI error (direction=%s): %s", direction, error_msg)
        return TransformResult(success=False, error=error_msg)

    try:
        output = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return TransformResult(
            success=False, error=f"failed to parse CLI output as JSON: {e}"
        )

    return TransformResult(success=True, output=output)


def run_stream_transform(
    direction: str, upstream_events: list[dict[str, Any]]
) -> TransformResult:
    """Run a streaming transform through the Rust CLI.

    Each element in ``upstream_events`` should have a ``raw_sse`` key
    containing the raw SSE text (including ``event:`` and ``data:`` lines).

    Args:
        direction: e.g. ``"anthropic-to-openai"``.
        upstream_events: List of dicts with ``raw_sse`` keys.

    Returns:
        ``TransformResult`` with ``output_sse`` populated on success.
    """
    rust_root = _cargo_root()

    rust_direction = STREAM_DIRECTION_MAP.get(direction, direction)
    cmd = [
        "cargo",
        "run",
        "--example",
        "validate-cli",
        "--",
        "transform-stream",
        "--direction",
        rust_direction,
    ]

    # Convert raw_sse events to SSE line format for stdin
    stdin_lines: list[str] = []
    for ev in upstream_events:
        raw = ev.get("raw_sse", "")
        for line in raw.split("\n"):
            stripped = line.strip()
            if stripped:
                stdin_lines.append(stripped)
    stdin_data = "\n".join(stdin_lines) + "\n"

    try:
        proc = subprocess.run(
            cmd,
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=RUST_CLI_TIMEOUT,
            cwd=str(rust_root),
        )
    except subprocess.TimeoutExpired:
        return TransformResult(success=False, error="Rust CLI timed out")
    except FileNotFoundError:
        return TransformResult(
            success=False,
            error="cargo not found -- is Rust toolchain installed?",
        )

    if proc.returncode != 0:
        error_msg = proc.stderr.strip() or f"exit code {proc.returncode}"
        logger.debug("Rust CLI stream error (direction=%s): %s", direction, error_msg)
        return TransformResult(success=False, error=error_msg)

    # Parse SSE output lines into a list of dicts
    sse_events: list[dict[str, Any]] = []
    for line in proc.stdout.split("\n"):
        stripped = line.strip()
        if stripped.startswith("data: "):
            data_str = stripped[len("data: ") :]
            if data_str == "[DONE]":
                sse_events.append({"data": "[DONE]"})
                continue
            try:
                sse_events.append(json.loads(data_str))
            except json.JSONDecodeError:
                sse_events.append({"raw": data_str})
        elif stripped.startswith("event: "):
            sse_events.append({"event": stripped[len("event: ") :]})

    return TransformResult(success=True, output_sse=sse_events)
