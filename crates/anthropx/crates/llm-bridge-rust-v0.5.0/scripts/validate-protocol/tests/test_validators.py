"""Tests for OpenAI structure validators."""

from validators import (
    FieldError,
    ValidationResult,
    validate_openai_chat_request,
    validate_openai_chat_response,
    validate_openai_responses_response,
)


def test_validate_openai_chat_request_valid():
    """合法的 OpenAI Chat 请求通过验证"""
    body = {
        "model": "gpt-4",
        "messages": [{"role": "user", "content": "hello"}],
    }
    result = validate_openai_chat_request(body)
    assert result.passed
    assert len(result.errors) == 0


def test_validate_openai_chat_request_missing_model():
    """缺少必填字段 model 应报错"""
    body = {"messages": [{"role": "user", "content": "hello"}]}
    result = validate_openai_chat_request(body)
    assert not result.passed
    assert any("model" in err.path for err in result.errors)


def test_validate_openai_chat_request_missing_messages():
    """缺少必填字段 messages 应报错"""
    body = {"model": "gpt-4"}
    result = validate_openai_chat_request(body)
    assert not result.passed
    assert any("messages" in err.path for err in result.errors)


def test_validate_openai_chat_request_invalid_message_role():
    """无效的 message role 应报错"""
    body = {
        "model": "gpt-4",
        "messages": [{"role": "invalid_role", "content": "hello"}],
    }
    result = validate_openai_chat_request(body)
    assert not result.passed
    assert len(result.errors) > 0


def test_validate_openai_chat_request_empty_messages():
    """空 messages 列表应报错"""
    body = {
        "model": "gpt-4",
        "messages": [],
    }
    result = validate_openai_chat_request(body)
    assert not result.passed
    assert len(result.errors) > 0


def test_validate_openai_chat_request_with_optional_fields():
    """包含可选字段的合法请求应通过验证"""
    body = {
        "model": "gpt-4",
        "messages": [{"role": "user", "content": "hello"}],
        "temperature": 0.7,
        "max_tokens": 100,
        "stream": False,
    }
    result = validate_openai_chat_request(body)
    assert result.passed
    assert len(result.errors) == 0


def test_validate_openai_chat_response_valid():
    """合法的 OpenAI Chat 响应通过验证"""
    body = {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1234567890,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }
    result = validate_openai_chat_response(body)
    assert result.passed
    assert len(result.errors) == 0


def test_validate_openai_chat_response_missing_choices():
    """缺少 choices 字段应报错"""
    body = {"id": "chatcmpl-123", "object": "chat.completion", "model": "gpt-4"}
    result = validate_openai_chat_response(body)
    assert not result.passed
    assert any("choices" in err.path for err in result.errors)


def test_validate_openai_chat_response_missing_id():
    """缺少 id 字段应报错"""
    body = {
        "object": "chat.completion",
        "created": 1234567890,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop",
            }
        ],
    }
    result = validate_openai_chat_response(body)
    assert not result.passed
    assert any("id" in err.path for err in result.errors)


def test_validate_openai_chat_response_invalid_object_type():
    """无效的 object 类型应报错"""
    body = {
        "id": "chatcmpl-123",
        "object": "invalid.object",
        "created": 1234567890,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop",
            }
        ],
    }
    result = validate_openai_chat_response(body)
    assert not result.passed
    assert len(result.errors) > 0


def test_validate_openai_chat_response_invalid_finish_reason():
    """无效的 finish_reason 应报错"""
    body = {
        "id": "chatcmpl-123",
        "object": "chat.completion",
        "created": 1234567890,
        "model": "gpt-4",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "invalid_reason",
            }
        ],
    }
    result = validate_openai_chat_response(body)
    assert not result.passed
    assert len(result.errors) > 0


def test_validate_openai_responses_response_valid():
    """合法的 OpenAI Responses API 响应通过验证"""
    body = {
        "id": "resp-123",
        "object": "response",
        "created_at": 1234567890,
        "model": "gpt-4",
        "output": [
            {
                "type": "message",
                "id": "msg-123",
                "role": "assistant",
                "status": "completed",
                "content": [
                    {"type": "output_text", "text": "Hello!", "annotations": []}
                ],
            }
        ],
        "parallel_tool_calls": False,
        "tool_choice": "auto",
        "tools": [],
        "usage": {
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }
    result = validate_openai_responses_response(body)
    assert result.passed
    assert len(result.errors) == 0


def test_validate_openai_responses_response_missing_output():
    """缺少 output 字段应报错"""
    body = {"id": "resp-123", "object": "response", "model": "gpt-4"}
    result = validate_openai_responses_response(body)
    assert not result.passed
    assert any("output" in err.path for err in result.errors)


def test_validation_result_defaults():
    """ValidationResult 默认值正确"""
    result = ValidationResult(passed=True)
    assert result.passed
    assert result.errors == []
    assert result.warnings == []


def test_field_error_attributes():
    """FieldError 属性正确"""
    err = FieldError(
        path="model", error_type="missing_required", expected="str", actual=None
    )
    assert err.path == "model"
    assert err.error_type == "missing_required"
    assert err.expected == "str"
    assert err.actual is None


# ---------------------------------------------------------------------------
# Anthropic validators
# ---------------------------------------------------------------------------

from validators import validate_anthropic_response


def test_validate_anthropic_response_with_thinking():
    """包含 thinking block 的 Anthropic 响应通过验证"""
    body = {
        "id": "msg_123",
        "type": "message",
        "role": "assistant",
        "model": "claude-3",
        "content": [
            {"type": "thinking", "thinking": "Let me think...", "signature": "abc123"},
            {"type": "text", "text": "The answer is 42"},
        ],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 20},
    }
    result = validate_anthropic_response(body)
    assert result.passed
    assert len(result.errors) == 0


def test_validate_anthropic_response_missing_type():
    """缺少 type 字段的 Anthropic 响应应验证失败"""
    body = {
        "id": "msg_123",
        "role": "assistant",
        "model": "claude-3",
        "content": [{"type": "text", "text": "hi"}],
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 5, "output_tokens": 3},
    }
    result = validate_anthropic_response(body)
    assert not result.passed


# ---------------------------------------------------------------------------
# Stream sequence state-machine validators
# ---------------------------------------------------------------------------

from validators import validate_stream_sequence


def test_validate_stream_sequence_anthropic_valid():
    """合法的 Anthropic 流式序列通过状态机验证"""
    events = [
        {
            "type": "message_start",
            "message": {"id": "m1", "model": "test", "role": "assistant"},
        },
        {
            "type": "content_block_start",
            "index": 0,
            "content_block": {"type": "text", "text": ""},
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "text_delta", "text": "hi"},
        },
        {"type": "content_block_stop", "index": 0},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn"}},
        {"type": "message_stop"},
    ]
    result = validate_stream_sequence(events, "anthropic")
    assert result.passed


def test_validate_stream_sequence_missing_message_start():
    """缺少 message_start 的流式序列验证失败"""
    events = [
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "text_delta", "text": "hi"},
        },
    ]
    result = validate_stream_sequence(events, "anthropic")
    assert not result.passed


def test_validate_stream_sequence_openai_no_done():
    """OpenAI 流式序列缺少 [DONE] 标记应产生 warning"""
    events = [
        {
            "object": "chat.completion.chunk",
            "choices": [{"index": 0, "delta": {"content": "hi"}}],
        },
    ]
    result = validate_stream_sequence(events, "openai")
    assert result.passed
    assert len(result.warnings) > 0
