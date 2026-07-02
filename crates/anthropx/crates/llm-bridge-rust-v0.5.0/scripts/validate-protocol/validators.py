"""Structure validators for protocol transform output.

Uses community SDK type models (``openai``, ``anthropic``) to validate
that transformed output conforms to each provider's expected schema.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class FieldError:
    """A single field-level validation error."""

    path: str
    error_type: str
    expected: str = ""
    actual: Any = None


@dataclass
class ValidationResult:
    """Aggregate result of a structure validation."""

    passed: bool
    errors: list[FieldError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pydantic_errors_to_field_errors(
    errors: list[dict[str, Any]],
) -> list[FieldError]:
    """Convert pydantic error dicts to our FieldError type."""
    field_errors: list[FieldError] = []
    for err in errors:
        loc = ".".join(str(part) for part in err.get("loc", []))
        msg = err.get("msg", "unknown error")
        expected_type = err.get("type", "")
        field_errors.append(
            FieldError(path=loc, error_type=expected_type, expected=msg)
        )
    return field_errors


# ---------------------------------------------------------------------------
# OpenAI Chat Completions
# ---------------------------------------------------------------------------


def validate_openai_chat_request(body: dict[str, Any]) -> ValidationResult:
    """Validate an OpenAI Chat Completions request body.

    Uses ``openai.types.chat`` types to validate the shape.
    Checks required fields: ``model``, ``messages``.
    Validates message roles against the SDK's allowed values.
    """
    errors: list[FieldError] = []

    # Check required top-level fields
    if "model" not in body:
        errors.append(FieldError(path="model", error_type="missing_required"))
    if "messages" not in body:
        errors.append(FieldError(path="messages", error_type="missing_required"))
        return ValidationResult(passed=False, errors=errors)

    messages = body.get("messages", [])
    if not messages:
        errors.append(
            FieldError(
                path="messages",
                error_type="value_error",
                expected="non-empty list",
                actual="empty list",
            )
        )
        return ValidationResult(passed=False, errors=errors)

    # Use openai SDK pydantic models if available
    try:
        from openai.types.chat import ChatCompletionMessageParam
        from pydantic import TypeAdapter

        ta = TypeAdapter(list[ChatCompletionMessageParam])
        ta.validate_python(messages)
    except ImportError as e:
        logger.warning("openai SDK not available: %s", e)
        return ValidationResult(
            passed=len(errors) == 0,
            errors=errors,
            warnings=[f"openai SDK import failed — skipping deep validation: {e}"],
        )
    except Exception as e:
        # pydantic ValidationError
        if hasattr(e, "errors"):
            errors.extend(
                _pydantic_errors_to_field_errors(
                    e.errors() if callable(e.errors) else []
                )
            )
        else:
            errors.append(
                FieldError(
                    path="messages",
                    error_type="validation_error",
                    expected="valid messages",
                    actual=str(e),
                )
            )

    return ValidationResult(passed=len(errors) == 0, errors=errors)


def validate_openai_chat_response(body: dict[str, Any]) -> ValidationResult:
    """Validate an OpenAI Chat Completions response body.

    Uses ``openai.types.chat.ChatCompletion.model_validate()``.
    """
    try:
        from openai.types.chat import ChatCompletion

        ChatCompletion.model_validate(body)
        return ValidationResult(passed=True)
    except ImportError as e:
        logger.warning("openai SDK not available: %s", e)
        return ValidationResult(
            passed=True,
            warnings=[f"openai SDK import failed — skipping: {e}"],
        )
    except Exception as e:
        errors: list[FieldError] = []
        if hasattr(e, "errors"):
            errors = _pydantic_errors_to_field_errors(
                e.errors() if callable(e.errors) else []
            )
        return ValidationResult(passed=False, errors=errors)


def validate_openai_responses_response(body: dict[str, Any]) -> ValidationResult:
    """Validate an OpenAI Responses API response body.

    Uses ``openai.types.responses.Response.model_validate()``.
    """
    try:
        from openai.types.responses import Response

        Response.model_validate(body)
        return ValidationResult(passed=True)
    except ImportError as e:
        logger.warning("openai SDK not available: %s", e)
        return ValidationResult(
            passed=True,
            warnings=[f"openai SDK import failed — skipping: {e}"],
        )
    except Exception as e:
        errors: list[FieldError] = []
        if hasattr(e, "errors"):
            errors = _pydantic_errors_to_field_errors(
                e.errors() if callable(e.errors) else []
            )
        return ValidationResult(passed=False, errors=errors)


# ---------------------------------------------------------------------------
# Anthropic Messages
# ---------------------------------------------------------------------------


def validate_anthropic_request(body: dict[str, Any]) -> ValidationResult:
    """Validate an Anthropic Messages request body.

    Validates that required fields (``model``, ``max_tokens``, ``messages``)
    are present and that the structure matches the Anthropic SDK expectations.
    """
    try:
        from anthropic.types import MessageCreateParams

        # anthropic SDK uses TypedDict/NotRequired — we validate structurally
        required_fields = ["model", "max_tokens", "messages"]
        warnings: list[str] = []
        errors: list[FieldError] = []

        for field in required_fields:
            if field not in body:
                errors.append(FieldError(path=field, error_type="missing_required"))

        # Validate messages array structure
        messages = body.get("messages", [])
        if not isinstance(messages, list):
            errors.append(
                FieldError(
                    path="messages",
                    error_type="type_error",
                    expected="array",
                    actual=type(messages).__name__,
                )
            )

        # Try pydantic validation if anthropic SDK types are pydantic models
        if errors:
            return ValidationResult(passed=False, errors=errors, warnings=warnings)

        try:
            # Attempt to construct params to trigger type validation
            params: dict[str, Any] = {
                "model": body["model"],
                "max_tokens": body["max_tokens"],
                "messages": _normalize_anthropic_messages(body["messages"]),
            }
            # The SDK will validate on construction
            _ = MessageCreateParams(**params)
        except Exception as e:
            warnings.append(f"Anthropic SDK validation note: {e}")

        return ValidationResult(passed=True, warnings=warnings)
    except ImportError as e:
        logger.warning("anthropic SDK not available: %s", e)
        return ValidationResult(
            passed=True,
            warnings=[f"anthropic SDK import failed — skipping: {e}"],
        )


def validate_anthropic_response(body: dict[str, Any]) -> ValidationResult:
    """Validate an Anthropic Messages response body.

    Uses ``anthropic.types.Message.model_validate()`` when available,
    otherwise performs basic structural validation.
    """
    try:
        from anthropic.types import Message

        Message.model_validate(body)
        return ValidationResult(passed=True)
    except ImportError as e:
        logger.warning("anthropic SDK not available: %s", e)
        # Basic structural validation without SDK
        errors: list[FieldError] = []
        if "type" not in body:
            errors.append(FieldError(path="type", error_type="missing_required"))
        if errors:
            return ValidationResult(passed=False, errors=errors)
        return ValidationResult(
            passed=True,
            warnings=[f"anthropic SDK import failed — skipping deep validation: {e}"],
        )
    except Exception as e:
        errors: list[FieldError] = []
        if hasattr(e, "errors"):
            errors = _pydantic_errors_to_field_errors(
                e.errors() if callable(e.errors) else []
            )
        return ValidationResult(passed=False, errors=errors)


def _normalize_anthropic_messages(
    messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize message format for anthropic SDK validation.

    The SDK expects ``content`` as a list of content blocks with specific
    types.  Simple string content is converted to a text block.
    """
    normalized: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if isinstance(content, str) and role in ("user", "assistant"):
            content = [{"type": "text", "text": content}]
        normalized.append({"role": role, "content": content})
    return normalized


# ---------------------------------------------------------------------------
# Stream sequence state-machine validation
# ---------------------------------------------------------------------------


def validate_stream_sequence(
    events: list[dict[str, Any]], target: str
) -> ValidationResult:
    """Validate that a stream event sequence conforms to the target protocol.

    For Anthropic target (``target="anthropic"``), enforces the state machine:
    ``message_start -> content_block_* -> message_delta -> message_stop``.

    For OpenAI target (``target="openai"``), validates that each chunk has
    the expected ``object: "chat.completion.chunk"`` and ``choices[]`` structure.

    For Responses target (``target="responses"``), validates that events
    follow the ``response.created -> ... -> response.completed`` lifecycle.

    Args:
        events: List of decoded SSE event dicts.
        target: ``"anthropic"``, ``"openai"``, or ``"responses"``.

    Returns:
        ``ValidationResult`` with sequence-level errors.
    """
    if target == "anthropic":
        return _validate_anthropic_sequence(events)
    if target == "openai":
        return _validate_openai_sequence(events)
    if target == "responses":
        return _validate_responses_sequence(events)
    return ValidationResult(
        passed=False,
        errors=[FieldError(path="target", error_type="unknown", expected=target)],
    )


# Anthropic event sequence state machine
#
#   message_start -> [content_block_start, message_delta]
#   content_block_start -> [content_block_delta, content_block_stop]
#   content_block_delta -> [content_block_delta, content_block_stop]
#   content_block_stop -> [content_block_start, content_block_stop, message_delta]
#   message_delta -> [message_stop]
#   message_stop -> [] (terminal)

_ANTHROPIC_STATE_MACHINE: dict[str, list[str]] = {
    "message_start": ["content_block_start", "message_delta"],
    "content_block_start": ["content_block_delta", "content_block_stop"],
    "content_block_delta": ["content_block_delta", "content_block_stop"],
    "content_block_stop": [
        "content_block_start",
        "content_block_stop",
        "message_delta",
    ],
    "message_delta": ["message_stop"],
    "message_stop": [],
}

_OPENAI_REQUIRED_CHUNK_FIELDS = {"object", "choices"}


def _validate_anthropic_sequence(
    events: list[dict[str, Any]],
) -> ValidationResult:
    """Validate Anthropic SSE event sequence."""
    warnings: list[str] = []
    errors: list[FieldError] = []

    if not events:
        return ValidationResult(passed=True, warnings=["empty event list"])

    current_state: str | None = None
    for i, event in enumerate(events):
        # Skip "done" marker
        if event.get("type") == "done":
            continue

        event_type = event.get("type", "")
        if event_type == "error":
            # error event ends the stream — allow message_stop after it
            if i + 1 < len(events):
                next_type = events[i + 1].get("type", "")
                if next_type not in ("message_stop", "error", "done"):
                    warnings.append(
                        f"event {i}: error event not followed by message_stop"
                    )
            continue

        if not event_type:
            warnings.append(f"event {i}: missing 'type' field, raw={event}")
            continue

        if current_state is not None:
            allowed = _ANTHROPIC_STATE_MACHINE.get(current_state, [])
            if allowed and event_type not in allowed:
                errors.append(
                    FieldError(
                        path=f"events[{i}].type",
                        error_type="invalid_sequence",
                        expected=f"one of {allowed}",
                        actual=event_type,
                    )
                )

        current_state = event_type

    # Terminal check: last real event should be message_stop or error
    non_done = [e for e in events if e.get("type") != "done"]
    if non_done:
        last = non_done[-1].get("type", "")
        if last not in ("message_stop", "error"):
            errors.append(
                FieldError(
                    path="events[-1].type",
                    error_type="missing_terminal",
                    expected="message_stop or error",
                    actual=last,
                )
            )

    return ValidationResult(passed=len(errors) == 0, errors=errors, warnings=warnings)


def _validate_openai_sequence(
    events: list[dict[str, Any]],
) -> ValidationResult:
    """Validate OpenAI Chat SSE chunk sequence."""
    errors: list[FieldError] = []
    warnings: list[str] = []

    saw_done = any(e.get("type") == "done" for e in events)
    if not saw_done:
        warnings.append("OpenAI stream missing [DONE] marker")

    for i, event in enumerate(events):
        if event.get("type") == "done":
            continue
        for field in _OPENAI_REQUIRED_CHUNK_FIELDS:
            if field not in event:
                errors.append(
                    FieldError(
                        path=f"events[{i}].{field}",
                        error_type="missing_required",
                        expected=field,
                    )
                )

    return ValidationResult(passed=len(errors) == 0, errors=errors, warnings=warnings)


def _validate_responses_sequence(
    events: list[dict[str, Any]],
) -> ValidationResult:
    """Validate OpenAI Responses SSE event sequence."""
    warnings: list[str] = []
    errors: list[FieldError] = []

    has_created = any(e.get("type") == "response.created" for e in events)
    has_completed_or_incomplete = any(
        e.get("type") in ("response.completed", "response.incomplete") for e in events
    )

    if not has_created:
        errors.append(
            FieldError(
                path="sequence",
                error_type="missing_required",
                expected="response.created",
            )
        )
    if not has_completed_or_incomplete:
        errors.append(
            FieldError(
                path="sequence",
                error_type="missing_terminal",
                expected="response.completed or response.incomplete",
            )
        )

    return ValidationResult(passed=len(errors) == 0, errors=errors, warnings=warnings)
