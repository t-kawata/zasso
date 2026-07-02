"""Tests for the Rust CLI runner module."""

import sys
import unittest
from pathlib import Path

# Add parent directory to path so we can import runners
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from runners import TransformResult, run_request_transform, run_stream_transform


class TestTransformResult(unittest.TestCase):
    """Test TransformResult dataclass."""

    def test_should_create_success_result(self):
        result = TransformResult(success=True, output={"path": "/v1/chat/completions"})
        self.assertTrue(result.success)
        self.assertEqual(result.output, {"path": "/v1/chat/completions"})
        self.assertIsNone(result.output_sse)
        self.assertIsNone(result.error)

    def test_should_create_error_result(self):
        result = TransformResult(success=False, error="something went wrong")
        self.assertFalse(result.success)
        self.assertIsNone(result.output)
        self.assertIsNone(result.output_sse)
        self.assertEqual(result.error, "something went wrong")

    def test_should_create_stream_result(self):
        sse = [{"type": "done"}]
        result = TransformResult(success=True, output_sse=sse)
        self.assertTrue(result.success)
        self.assertEqual(result.output_sse, sse)


class TestRunRequestTransform(unittest.TestCase):
    """Test non-streaming request transform via Rust CLI."""

    def test_should_transform_anthropic_to_openai(self):
        """Non-streaming Anthropic -> OpenAI request transform."""
        input_req = {
            "headers": {"x-api-key": "test-key"},
            "path": "/v1/messages",
            "body": {
                "model": "claude-3",
                "max_tokens": 100,
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "hello"}]}
                ],
            },
        }
        result = run_request_transform("anthropic-to-openai", input_req)
        self.assertTrue(
            result.success, f"Expected success but got error: {result.error}"
        )
        self.assertIsNotNone(result.output)
        self.assertEqual(result.output["path"], "/v1/chat/completions")
        self.assertEqual(result.output["body"]["model"], "claude-3")

    def test_should_return_error_for_invalid_input(self):
        """Invalid input should return an error."""
        result = run_request_transform("anthropic-to-openai", {"invalid": True})
        self.assertFalse(result.success)
        self.assertIsNotNone(result.error)


class TestRunStreamTransform(unittest.TestCase):
    """Test streaming transform via Rust CLI."""

    def test_should_transform_anthropic_to_openai_stream(self):
        """Streaming Anthropic -> OpenAI transform."""
        events = [
            {
                "raw_sse": (
                    "event: message_start\n"
                    'data: {"type":"message_start","message":{'
                    '"id":"msg_1","type":"message","role":"assistant",'
                    '"content":[],"model":"test","usage":{"input_tokens":1,"output_tokens":0}}}'
                )
            },
            {
                "raw_sse": (
                    "event: content_block_start\n"
                    'data: {"type":"content_block_start","index":0,'
                    '"content_block":{"type":"text","text":""}}'
                )
            },
            {
                "raw_sse": (
                    "event: content_block_delta\n"
                    'data: {"type":"content_block_delta","index":0,'
                    '"delta":{"type":"text_delta","text":"hi"}}'
                )
            },
            {
                "raw_sse": (
                    "event: content_block_stop\n"
                    'data: {"type":"content_block_stop","index":0}'
                )
            },
            {
                "raw_sse": (
                    "event: message_delta\n"
                    'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
                )
            },
            {"raw_sse": 'event: message_stop\ndata: {"type":"message_stop"}'},
        ]
        result = run_stream_transform("anthropic-to-openai", events)
        self.assertTrue(
            result.success, f"Expected success but got error: {result.error}"
        )
        self.assertIsNotNone(result.output_sse)
        self.assertGreater(len(result.output_sse), 0)
        # Should contain OpenAI DONE marker
        self.assertTrue(
            any("DONE" in str(sse) for sse in result.output_sse),
            f"Expected DONE marker in output SSE, got: {result.output_sse}",
        )


if __name__ == "__main__":
    unittest.main()
