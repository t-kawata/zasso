"""Tests for the fixture loader module."""

import json
import tempfile
from pathlib import Path

from fixtures import FixtureCase, load_all_fixtures


def test_load_all_fixtures_from_temp_dir():
    """从临时目录加载多个 fixture，验证解析正确"""
    root = Path(tempfile.mkdtemp())
    sub = root / "anthropic-to-openai"
    sub.mkdir(parents=True)

    fixture = {
        "name": "test-basic",
        "mode": "non_stream",
        "notes": "test fixture",
        "input": {
            "headers": {"x-api-key": "test-key"},
            "path": "/v1/messages",
            "body": {"model": "claude-3", "max_tokens": 10, "messages": []},
        },
        "expected": {
            "headers": {"authorization": "Bearer test-key"},
            "path": "/v1/chat/completions",
            "body": {},
        },
    }
    (sub / "test-basic.json").write_text(json.dumps(fixture))

    # 添加一个非 JSON 文件确保被跳过
    (sub / "README.md").write_text("readme")

    cases = load_all_fixtures(root)
    assert len(cases) == 1
    case = cases[0]
    assert case.name == "test-basic"
    assert case.direction == "anthropic-to-openai"
    assert case.mode == "non_stream"
    assert case.input_request is not None
    assert case.input_request["body"]["model"] == "claude-3"
    assert case.expected_output is not None
    assert case.expected_output["path"] == "/v1/chat/completions"


def test_load_stream_fixture():
    """流式 fixture 正确加载 upstream_events"""
    root = Path(tempfile.mkdtemp())
    sub = root / "anthropic-to-openai"
    sub.mkdir(parents=True)

    fixture = {
        "name": "test-stream",
        "mode": "stream",
        "notes": "stream test",
        "input": {
            "events": [
                {
                    "raw_sse": 'event: message_start\ndata: {"type":"message_start","message":{}}'
                }
            ]
        },
        "expected": {"downstream_sse_contains": ["hello"]},
    }
    (sub / "test-stream.json").write_text(json.dumps(fixture))

    cases = load_all_fixtures(root)
    assert len(cases) == 1
    assert cases[0].mode == "stream"
    assert cases[0].input_upstream_events is not None
    assert len(cases[0].input_upstream_events) == 1
    assert cases[0].input_request is None


def test_skip_malformed_fixture():
    """格式不兼容的 fixture 被跳过并记录 warning"""
    root = Path(tempfile.mkdtemp())
    sub = root / "anthropic-to-openai"
    sub.mkdir(parents=True)
    (sub / "bad.json").write_text('{"not_a_fixture": true}')

    cases = load_all_fixtures(root)
    assert len(cases) == 0
