# Protocol Transform Fixtures

This directory contains the minimal Phase 0 fixture corpus for the protocol transform layer.

## Layout

- `anthropic-to-openai/`
- `openai-to-anthropic/`
- `end-to-end/`

## Fixture shape

- Non-stream fixtures use:
  - `name`
  - `mode: "non_stream"`
  - `input.headers`
  - `input.path`
  - `input.body`
  - `expected.headers`
  - `expected.path`
  - `expected.body`
- Stream fixtures use:
  - `name`
  - `mode: "stream"`
  - `input.events[]`
  - `expected.events[]`
  - `expected.terminal_state`
- End-to-end fixtures use:
  - `name`
  - `mode: "non_stream" | "stream"`
  - `input.anthropic_request` or `input.openai_request`
  - `input.upstream_response_body` or `input.upstream_events[]`
  - `expected.openai_request_path`
  - `expected.openai_request_body`
  - `expected.anthropic_response_body` or `expected.downstream_sse_contains[]`
## Notes

- These fixtures are intentionally minimal and are meant to freeze contracts before production code lands.
- Values that would normally contain secrets are represented by placeholders.
- Provider payloads are representative samples for transformation behavior, not golden protocol conformance captures.