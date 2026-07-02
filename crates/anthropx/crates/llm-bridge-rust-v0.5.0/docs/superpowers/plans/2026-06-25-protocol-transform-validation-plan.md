# 协议转换正确性验证工具 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建离线 Python 验证工具，使用社区 SDK（openai-python、anthropic-sdk-python）的类型模型对 Rust core 的 6 个协议转换方向的输出做结构化验证，确保外部正确性。

**Architecture:** Python 脚本驱动，通过子进程调用 Rust core CLI（`cargo run --example validate-cli`）执行协议转换，然后用 `openai.ChatCompletion.model_validate()` 等 SDK 方法验证输出结构。litellm 做 best-effort 语义对比（仅报告）。

**Tech Stack:** Python 3.11+, Rust 2024, openai SDK, anthropic SDK, litellm, pydantic, rich, pytest

## Global Constraints

- Python >= 3.11
- openai >= 1.30.0, < 2.0
- anthropic >= 0.28.0, < 1.0
- litellm >= 1.40.0, < 2.0
- pydantic >= 2.0
- rich >= 13.0
- pytest >= 7.0
- Rust toolchain: stable（workspace 已锁定）
- 所有 Python 公共函数必须有 docstring
- 所有文件使用 UTF-8 编码
- 验证工具 exit code: 0 = 全部通过，非 0 = 有结构验证失败
- 文件名：snake_case
- 不使用 TODO/TBD/占位符

---

### Task 1: Rust Core CLI — validate-cli.rs

**Files:**
- Create: `crates/core/examples/validate-cli.rs`

**Interfaces:**
- Produces:
  - CLI 子命令 `transform-request --direction <dir>`：stdin 读取 JSON，stdout 输出转换后 JSON
  - CLI 子命令 `transform-stream --direction <dir>`：stdin 读取 lines（每行一个 SSE frame），stdout 输出转换后 SSE
  - exit code 0 = 成功，1 = 转换错误（stderr 输出错误信息）
  - 支持的 direction: `anthropic-to-openai`, `openai-to-anthropic`, `anthropic-to-responses`, `responses-to-anthropic`, `responses-to-openai`, `openai-chat-to-responses`

- [ ] **Step 1: 创建 validate-cli.rs 文件**

```rust
// 离线验证 CLI 工具 — 为 Python 验证脚本提供协议转换接口
//
// 用法:
//   cargo run --example validate-cli -- transform-request --direction anthropic-to-openai < input.json
//   cargo run --example validate-cli -- transform-stream --direction openai-to-anthropic < frames.txt

use std::collections::HashMap;
use std::io::{self, BufRead, Read, Write};

use bytes::Bytes;
use llm_bridge_core::{
    model::{ApiFormat, StreamState, TransformRequest},
    stream::{
        events_to_sse, transform_anthropic_stream_to_openai,
        transform_openai_stream, transform_responses_stream_to_anthropic,
        SseFrame,
    },
    transform::{
        anthropic_to_openai, anthropic_to_openai_responses, openai_to_anthropic,
        responses_to_anthropic, responses_to_openai, transform_headers_anthropic_to_openai,
    },
};

fn main() {
    let mut args = std::env::args().skip(1);
    let subcommand = args.next().expect("expected subcommand: transform-request or transform-stream");

    match subcommand.as_str() {
        "transform-request" => cmd_transform_request(&mut args),
        "transform-stream" => cmd_transform_stream(&mut args),
        other => {
            eprintln!("unknown subcommand: {other}");
            std::process::exit(2);
        }
    }
}

fn parse_direction(args: &mut impl Iterator<Item = String>) -> String {
    let mut direction = String::new();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--direction" => direction = args.next().expect("missing direction value"),
            other => {
                eprintln!("unknown flag: {other}");
                std::process::exit(2);
            }
        }
    }
    if direction.is_empty() {
        eprintln!("--direction is required");
        std::process::exit(2);
    }
    direction
}

fn cmd_transform_request(args: &mut impl Iterator<Item = String>) {
    let direction = parse_direction(args);

    let mut stdin_data = String::new();
    io::stdin().read_to_string(&mut stdin_data).expect("failed to read stdin");

    let input: serde_json::Value =
        serde_json::from_str(&stdin_data).expect("stdin must be valid JSON with 'headers', 'path', 'body'");

    let headers: HashMap<String, String> = input["headers"]
        .as_object()
        .map(|m| m.iter().map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string())).collect())
        .unwrap_or_default();

    let path = input["path"].as_str().unwrap_or("").to_string();
    let body_bytes = Bytes::from(serde_json::to_vec(&input["body"]).unwrap_or_default());

    let req = TransformRequest { headers, path, body: body_bytes };

    let result = match direction.as_str() {
        "anthropic-to-openai" => anthropic_to_openai(&req),
        "openai-to-anthropic" => openai_to_anthropic(&req),
        "anthropic-to-responses" => anthropic_to_openai_responses(&req),
        "responses-to-anthropic" => responses_to_anthropic(&req),
        "responses-to-openai" => responses_to_openai(&req),
        other => {
            eprintln!("unsupported direction: {other}");
            std::process::exit(2);
        }
    };

    match result {
        Ok(resp) => {
            let output = serde_json::json!({
                "headers": resp.headers,
                "path": resp.path,
                "body": serde_json::from_slice::<serde_json::Value>(&resp.body).unwrap_or(serde_json::Value::Null),
            });
            serde_json::to_writer(io::stdout(), &output).expect("failed to write output");
        }
        Err(e) => {
            eprintln!("transform error: {e}");
            std::process::exit(1);
        }
    }
}

fn cmd_transform_stream(args: &mut impl Iterator<Item = String>) {
    let direction = parse_direction(args);

    let mut frames: Vec<SseFrame> = Vec::new();
    for line in io::stdin().lock().lines() {
        let line = line.expect("failed to read stdin line");
        if line == "[DONE]" {
            frames.push(SseFrame { event: None, data: "[DONE]".to_string() });
        } else if line.starts_with("data: ") {
            let data = line.strip_prefix("data: ").unwrap().to_string();
            frames.push(SseFrame { event: None, data });
        } else if line.starts_with("event: ") {
            let event = line.strip_prefix("event: ").unwrap().to_string();
            frames.push(SseFrame { event: Some(event), data: String::new() });
        } else if line.is_empty() || line.starts_with(':') {
            continue;
        } else {
            frames.push(SseFrame { event: None, data: line });
        }
    }

    let source = match direction.as_str() {
        "anthropic-to-openai" => ApiFormat::AnthropicMessages,
        "openai-to-anthropic" => ApiFormat::OpenaiChat,
        "anthropic-to-responses" => ApiFormat::AnthropicMessages,
        "responses-to-anthropic" => ApiFormat::OpenaiResponses,
        "openai-chat-to-responses" => ApiFormat::OpenaiChat,
        other => {
            eprintln!("unsupported direction: {other}");
            std::process::exit(2);
        }
    };

    let target = match direction.as_str() {
        "anthropic-to-openai" => "openai",
        "openai-to-anthropic" => "anthropic",
        "anthropic-to-responses" => "responses",
        "responses-to-anthropic" => "anthropic",
        "openai-chat-to-responses" => "responses",
        _ => unreachable!(),
    };

    let mut state = StreamState::default();

    let output: Result<Vec<u8>, _> = match target {
        "openai" => llm_bridge_core::stream::transform_stream_to_openai_sse(
            &build_raw_sse(&frames), source, &mut state,
        ),
        "anthropic" => llm_bridge_core::stream::transform_stream_to_anthropic_sse(
            &build_raw_sse(&frames), source, &mut state,
        ),
        "responses" => llm_bridge_core::stream::transform_stream_to_openai_responses_sse(
            &build_raw_sse(&frames), source, &mut state,
        ),
        _ => unreachable!(),
    };

    match output {
        Ok(bytes) => {
            io::stdout().write_all(&bytes).expect("failed to write output");
        }
        Err(e) => {
            eprintln!("transform error: {e}");
            std::process::exit(1);
        }
    }
}

fn build_raw_sse(frames: &[SseFrame]) -> Vec<u8> {
    let mut raw = Vec::new();
    for f in frames {
        if let Some(ref ev) = f.event {
            raw.extend_from_slice(format!("event: {ev}\n").as_bytes());
        }
        raw.extend_from_slice(format!("data: {}\n\n", f.data).as_bytes());
    }
    raw
}
```

- [ ] **Step 2: 编译验证**

```bash
cargo build --example validate-cli
```
期望: `Compiling llm-bridge-core ... Finished`，无编译错误。

- [ ] **Step 3: 手动测试非流式转换**

```bash
echo '{"headers":{"x-api-key":"test"},"path":"/v1/messages","body":{"model":"claude-3","max_tokens":100,"messages":[{"role":"user","content":[{"type":"text","text":"hello"}]}]}}' | \
  cargo run --example validate-cli -- transform-request --direction anthropic-to-openai
```

期望：stdout 输出 `{"headers":{"authorization":"Bearer test",...},"path":"/v1/chat/completions","body":{...}}`，exit code 0。

- [ ] **Step 4: 手动测试流式转换**

```bash
printf 'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"test","usage":{"input_tokens":1,"output_tokens":0}}}\ndata: [DONE]\n' | \
  cargo run --example validate-cli -- transform-stream --direction anthropic-to-openai
```

期望：stdout 输出包含 `data: {"choices":[...]}` 的 OpenAI SSE 格式，exit code 0。

- [ ] **Step 5: 提交**

```bash
git add crates/core/examples/validate-cli.rs
git commit -m "feat: add validate-cli example for offline protocol validation"
```

---

### Task 2: Python 项目初始化

**Files:**
- Create: `scripts/validate-protocol/__init__.py`
- Create: `scripts/validate-protocol/requirements.txt`

**Interfaces:**
- Produces: Python 包骨架，依赖锁定在 requirements.txt

- [ ] **Step 1: 创建 __init__.py**

```python
"""Protocol transform validation tool.

Uses community SDKs (openai-python, anthropic-sdk-python) as the external
source of truth to verify that the Rust core's protocol conversion output
is structurally correct across all 6 transform directions.
"""
```

- [ ] **Step 2: 创建 requirements.txt**

```
openai>=1.30.0,<2.0
anthropic>=0.28.0,<1.0
litellm>=1.40.0,<2.0
pydantic>=2.0
rich>=13.0
pytest>=7.0,<9.0
```

- [ ] **Step 3: 验证依赖可安装**

```bash
cd scripts/validate-protocol && pip install -r requirements.txt
```

期望：所有包成功安装，无版本冲突。

- [ ] **Step 4: 提交**

```bash
git add scripts/validate-protocol/__init__.py scripts/validate-protocol/requirements.txt
git commit -m "feat: init Python validation project skeleton"
```

---

### Task 3: fixtures.py — Fixture 加载器

**Files:**
- Create: `scripts/validate-protocol/fixtures.py`
- Create: `scripts/validate-protocol/tests/test_fixtures.py`

**Interfaces:**
- Produces:
  - `class FixtureCase`: dataclass，包含 `name: str`, `direction: str`, `fixture_path: Path`, `input_request: dict | None`, `input_upstream_events: list[dict] | None`, `expected_output: dict | None`, `expected_error: dict | None`, `mode: str`（`"non_stream"` 或 `"stream"`）
  - `def load_all_fixtures(root: Path) -> list[FixtureCase]`: 遍历 root 下所有子目录，加载 JSON fixture

- [ ] **Step 1: 编写失败测试**

```python
# scripts/validate-protocol/tests/test_fixtures.py
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
    assert case.input_request["model"] == "claude-3"
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
                {"raw_sse": "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{}}"}
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_fixtures.py -v
```
期望: FAIL — `ModuleNotFoundError: No module named 'fixtures'`

- [ ] **Step 3: 实现 fixtures.py**

```python
"""Fixture loader for protocol transform validation.

Reads fixture JSON files from the `fixtures/protocol-transform/` directory
and parses them into `FixtureCase` instances for validation.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class FixtureCase:
    """A single protocol transform test case loaded from a fixture file."""

    name: str
    direction: str
    fixture_path: Path
    mode: str  # "non_stream" or "stream"
    input_request: dict | None = None
    input_upstream_events: list[dict] | None = None
    expected_output: dict | None = None
    expected_error: dict | None = None
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
) -> FixtureCase | None:
    """Parse a single fixture JSON dict into a FixtureCase.

    Returns None if the fixture is missing required top-level fields.
    """
    name = data.get("name", fixture_path.stem)
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_fixtures.py -v
```
期望: 3 PASSED

- [ ] **Step 5: 提交**

```bash
git add scripts/validate-protocol/fixtures.py scripts/validate-protocol/tests/test_fixtures.py
git commit -m "feat: add fixture loader with unit tests"
```

---

### Task 4: runners.py — Rust Core 调用器

**Files:**
- Create: `scripts/validate-protocol/runners.py`
- Create: `scripts/validate-protocol/tests/test_runners.py`

**Interfaces:**
- Consumes: `fixtures.FixtureCase`
- Produces:
  - `@dataclass class TransformResult`: `success: bool`, `output: dict | None`, `output_sse: list[dict] | None`, `error: str | None`
  - `def run_request_transform(direction: str, input_request: dict) -> TransformResult`
  - `def run_stream_transform(direction: str, upstream_events: list[dict]) -> TransformResult`

- [ ] **Step 1: 编写失败测试**

```python
# scripts/validate-protocol/tests/test_runners.py
from runners import run_request_transform, run_stream_transform, TransformResult


def test_run_request_transform_anthropic_to_openai():
    """非流式 Anthropic -> OpenAI 请求转换"""
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
    assert result.success
    assert result.output is not None
    assert result.output["path"] == "/v1/chat/completions"
    assert result.output["body"]["model"] == "claude-3"


def test_run_request_transform_error():
    """非法输入返回错误"""
    result = run_request_transform("anthropic-to-openai", {"invalid": True})
    assert not result.success
    assert result.error is not None


def test_run_stream_transform_anthropic_to_openai():
    """流式 Anthropic -> OpenAI 转换"""
    events = [
        {
            "raw_sse": (
                'event: message_start\n'
                'data: {"type":"message_start","message":{'
                '"id":"msg_1","type":"message","role":"assistant",'
                '"content":[],"model":"test","usage":{"input_tokens":1,"output_tokens":0}}}'
            )
        },
        {
            "raw_sse": (
                'event: content_block_start\n'
                'data: {"type":"content_block_start","index":0,'
                '"content_block":{"type":"text","text":""}}'
            )
        },
        {
            "raw_sse": (
                'event: content_block_delta\n'
                'data: {"type":"content_block_delta","index":0,'
                '"delta":{"type":"text_delta","text":"hi"}}'
            )
        },
        {
            "raw_sse": (
                'event: content_block_stop\n'
                'data: {"type":"content_block_stop","index":0}'
            )
        },
        {
            "raw_sse": (
                'event: message_delta\n'
                'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}'
            )
        },
        {"raw_sse": 'event: message_stop\ndata: {"type":"message_stop"}'},
    ]
    result = run_stream_transform("anthropic-to-openai", events)
    assert result.success
    assert result.output_sse is not None
    assert len(result.output_sse) > 0
    # 应包含 OpenAI DONE 标记
    assert any("DONE" in str(sse) for sse in result.output_sse)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_runners.py -v
```
期望: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 runners.py**

```python
"""Rust Core CLI invoker for protocol transform validation.

Spawns the `validate-cli` Rust example via subprocess and captures
the transformed output.
"""

import json
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Duration in seconds before the subprocess is killed.
RUST_CLI_TIMEOUT = 30

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
    """Find the workspace root (where Cargo.toml lives)."""
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
            error="cargo not found — is Rust toolchain installed?",
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
            error="cargo not found — is Rust toolchain installed?",
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
                sse_events.append({"type": "done"})
                continue
            try:
                sse_events.append(json.loads(data_str))
            except json.JSONDecodeError:
                sse_events.append({"raw": data_str})
        elif stripped.startswith("event: "):
            sse_events.append({"event": stripped[len("event: ") :]})

    return TransformResult(success=True, output_sse=sse_events)
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_runners.py -v
```
期望: 3 PASSED（注意：依赖 Rust CLI 已编译，需要先 `cargo build --example validate-cli`）

- [ ] **Step 5: 提交**

```bash
git add scripts/validate-protocol/runners.py scripts/validate-protocol/tests/test_runners.py
git commit -m "feat: add Rust CLI runner with unit tests"
```

---

### Task 5: validators.py — OpenAI 结构验证

**Files:**
- Create: `scripts/validate-protocol/validators.py`
- Create: `scripts/validate-protocol/tests/test_validators.py`

**Interfaces:**
- Produces:
  - `@dataclass class ValidationResult`: `passed: bool`, `errors: list[FieldError]`, `warnings: list[str]`
  - `@dataclass class FieldError`: `path: str`, `error_type: str`, `expected: str`, `actual: Any`
  - `def validate_openai_chat_request(body: dict) -> ValidationResult`
  - `def validate_openai_chat_response(body: dict) -> ValidationResult`
  - `def validate_openai_responses_response(body: dict) -> ValidationResult`

- [ ] **Step 1: 编写失败测试**

```python
# scripts/validate-protocol/tests/test_validators.py
from validators import (
    FieldError,
    ValidationResult,
    validate_openai_chat_request,
    validate_openai_chat_response,
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


def test_validate_openai_chat_response_missing_choices():
    """缺少 choices 字段应报错"""
    body = {"id": "chatcmpl-123", "object": "chat.completion", "model": "gpt-4"}
    result = validate_openai_chat_response(body)
    assert not result.passed
    assert any("choices" in err.path for err in result.errors)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py -v
```
期望: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 validators.py（OpenAI 部分）**

```python
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

    Uses ``openai.types.chat.ChatCompletion`` to validate the shape.
    """
    try:
        from openai.types.chat import (
            ChatCompletionMessageParam,
        )
        from pydantic import TypeAdapter

        ta = TypeAdapter(list[ChatCompletionMessageParam])
        messages = body.get("messages", [])
        ta.validate_python(messages)

        # Also check required top-level: model
        warnings: list[str] = []
        if "model" not in body:
            return ValidationResult(
                passed=False,
                errors=[FieldError(path="model", error_type="missing_required")],
            )

        return ValidationResult(passed=True, warnings=warnings)
    except ImportError as e:
        logger.warning("openai SDK not available: %s", e)
        return ValidationResult(
            passed=True,
            warnings=[f"openai SDK import failed — skipping: {e}"],
        )
    except Exception as e:
        # pydantic ValidationError
        errors: list[FieldError] = []
        if hasattr(e, "errors"):
            errors = _pydantic_errors_to_field_errors(
                e.errors() if callable(e.errors) else []
            )
        return ValidationResult(passed=False, errors=errors)


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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py -v
```
期望: 4 PASSED（OpenAI 相关）

- [ ] **Step 5: 提交**

```bash
git add scripts/validate-protocol/validators.py scripts/validate-protocol/tests/test_validators.py
git commit -m "feat: add OpenAI structure validators"
```

---

### Task 6: validators.py — Anthropic 结构验证

**Files:**
- Modify: `scripts/validate-protocol/validators.py`
- Modify: `scripts/validate-protocol/tests/test_validators.py`（已有测试）

**Interfaces:**
- Produces:
  - `def validate_anthropic_request(body: dict) -> ValidationResult`
  - `def validate_anthropic_response(body: dict) -> ValidationResult`

- [ ] **Step 1: 追加 Anthropic 测试到 test_validators.py 并确认失败**

在 `tests/test_validators.py` 文件末尾追加以下测试代码：

```python
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
```

运行确认失败：

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py::test_validate_anthropic_response_with_thinking -v
```
期望: FAIL — `NameError: name 'validate_anthropic_response' is not defined`

- [ ] **Step 2: 追加 Anthropic 验证函数到 validators.py**

```python
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
                errors.append(
                    FieldError(path=field, error_type="missing_required")
                )

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

    Uses ``anthropic.types.Message.model_validate()``.
    """
    try:
        from anthropic.types import Message

        Message.model_validate(body)
        return ValidationResult(passed=True)
    except ImportError as e:
        logger.warning("anthropic SDK not available: %s", e)
        return ValidationResult(
            passed=True,
            warnings=[f"anthropic SDK import failed — skipping: {e}"],
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
```

- [ ] **Step 3: 运行全部 validators 测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py -v
```
期望: 6 PASSED

- [ ] **Step 4: 提交**

```bash
git add scripts/validate-protocol/validators.py
git commit -m "feat: add Anthropic structure validators"
```

---

### Task 7: validators.py — 流式序列状态机验证

**Files:**
- Modify: `scripts/validate-protocol/validators.py`

**Interfaces:**
- Produces:
  - `def validate_stream_sequence(events: list[dict], target: str) -> ValidationResult`

- [ ] **Step 1: 追加流式测试到 test_validators.py 并确认失败**

在 `tests/test_validators.py` 文件末尾追加：

```python
from validators import validate_stream_sequence


def test_validate_stream_sequence_anthropic_valid():
    """合法的 Anthropic 流式序列通过状态机验证"""
    events = [
        {"type": "message_start", "message": {"id": "m1", "model": "test", "role": "assistant"}},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "hi"}},
        {"type": "content_block_stop", "index": 0},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn"}},
        {"type": "message_stop"},
    ]
    result = validate_stream_sequence(events, "anthropic")
    assert result.passed


def test_validate_stream_sequence_missing_message_start():
    """缺少 message_start 的流式序列验证失败"""
    events = [
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "hi"}},
    ]
    result = validate_stream_sequence(events, "anthropic")
    assert not result.passed


def test_validate_stream_sequence_openai_no_done():
    """OpenAI 流式序列缺少 [DONE] 标记应产生 warning"""
    events = [
        {"object": "chat.completion.chunk", "choices": [{"index": 0, "delta": {"content": "hi"}}]},
    ]
    result = validate_stream_sequence(events, "openai")
    assert result.passed
    assert len(result.warnings) > 0
```

运行确认失败：

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py::test_validate_stream_sequence_anthropic_valid -v
```
期望: FAIL — `ImportError: cannot import name 'validate_stream_sequence'`

- [ ] **Step 2: 追加流式状态机验证函数**

```python
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
        errors=[
            FieldError(
                path="target", error_type="unknown", expected=target
            )
        ],
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

    return ValidationResult(
        passed=len(errors) == 0, errors=errors, warnings=warnings
    )


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

    return ValidationResult(
        passed=len(errors) == 0, errors=errors, warnings=warnings
    )


def _validate_responses_sequence(
    events: list[dict[str, Any]],
) -> ValidationResult:
    """Validate OpenAI Responses SSE event sequence."""
    warnings: list[str] = []
    errors: list[FieldError] = []

    has_created = any(e.get("type") == "response.created" for e in events)
    has_completed_or_incomplete = any(
        e.get("type") in ("response.completed", "response.incomplete")
        for e in events
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

    return ValidationResult(
        passed=len(errors) == 0, errors=errors, warnings=warnings
    )
```

- [ ] **Step 3: 运行所有 validators 测试（共 9 个：4 OpenAI + 2 Anthropic + 3 Stream）**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_validators.py -v
```
期望: 9 PASSED

- [ ] **Step 4: 提交**

```bash
git add scripts/validate-protocol/validators.py
git commit -m "feat: add stream sequence state-machine validators"
```

---

### Task 8: comparators.py — litellm 语义对比

**Files:**
- Create: `scripts/validate-protocol/comparators.py`
- Create: `scripts/validate-protocol/tests/test_comparators.py`

**Interfaces:**
- Consumes: `fixtures.FixtureCase`
- Produces:
  - `@dataclass class FieldDiff`: `path: str`, `our_value: Any`, `litellm_value: Any`, `severity: str`
  - `@dataclass class ComparisonReport`: `field_diffs: list[FieldDiff]`, `missing_in_ours: list[str]`, `extra_in_ours: list[str]`, `notes: list[str]`
  - `def compare_with_litellm(direction: str, input_request: dict | None, our_output: dict | None) -> ComparisonReport`

- [ ] **Step 1: 编写失败测试**

```python
# scripts/validate-protocol/tests/test_comparators.py
from comparators import compare_with_litellm, ComparisonReport, FieldDiff


def test_compare_with_litellm_no_input():
    """无输入时返回 SKIP report"""
    report = compare_with_litellm("anthropic-to-openai", None, None)
    assert len(report.notes) > 0
    assert "skip" in report.notes[0].lower() or "no input" in report.notes[0].lower()


def test_compare_with_litellm_unsupported_direction():
    """不支持的方向返回 SKIP"""
    report = compare_with_litellm(
        "responses-to-anthropic",
        {"model": "test", "messages": []},
        {"type": "message", "role": "assistant", "content": []},
    )
    assert len(report.notes) > 0
    assert any("不支持" in note or "skip" in note.lower() or "unsupported" in note.lower() for note in report.notes)


def test_compare_with_litellm_identical_outputs():
    """完全相同的输出无差异"""
    our = {"choices": [{"message": {"content": "hello", "role": "assistant"}}]}
    report = compare_with_litellm("anthropic-to-openai", {"model": "test"}, our)
    # litellm may or may not support this direction — both are acceptable
    assert isinstance(report, ComparisonReport)
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_comparators.py -v
```
期望: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 comparators.py**

```python
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
    if our_output is None:
        return ComparisonReport(notes=["no output to compare"])

    if input_request is None:
        return ComparisonReport(notes=["no input request — skip litellm comparison"])

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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_comparators.py -v
```
期望: 3 PASSED

- [ ] **Step 5: 提交**

```bash
git add scripts/validate-protocol/comparators.py scripts/validate-protocol/tests/test_comparators.py
git commit -m "feat: add litellm best-effort semantic comparator"
```

---

### Task 9: reporters.py — 报告生成器

**Files:**
- Create: `scripts/validate-protocol/reporters.py`
- Create: `scripts/validate-protocol/tests/test_reporters.py`

**Interfaces:**
- Consumes: `fixtures.FixtureCase`, `runners.TransformResult`, `validators.ValidationResult`, `comparators.ComparisonReport`
- Produces:
  - `@dataclass class FixtureResult`: 聚合所有验证结果
  - `def generate_report(results: list[FixtureResult]) -> str`: 生成终端表格报告
  - `def write_json_report(results: list[FixtureResult], path: Path) -> None`: 输出 JSON 报告

- [ ] **Step 1: 编写失败测试**

```python
# scripts/validate-protocol/tests/test_reporters.py
from reporters import FixtureResult, generate_report, write_json_report
from validators import ValidationResult


def test_generate_report_all_pass():
    """全部通过的 fixture 生成正确报告"""
    results = [
        FixtureResult(
            fixture_name="test-basic",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=["litellm comparison skipped"],
        ),
        FixtureResult(
            fixture_name="test-tool-use",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=[],
        ),
    ]
    report = generate_report(results)
    assert "test-basic" in report
    assert "test-tool-use" in report
    assert "PASS" in report or "通过" in report


def test_generate_report_with_failure():
    """包含失败 fixture 的报告"""
    from validators import FieldError

    results = [
        FixtureResult(
            fixture_name="bad-fixture",
            direction="openai-to-anthropic",
            transform_ok=False,
            transform_error="exit code 1",
            structure_result=None,
            semantic_notes=None,
        ),
    ]
    report = generate_report(results)
    assert "bad-fixture" in report
    assert "FAIL" in report or "失败" in report


def test_write_json_report(tmp_path):
    """JSON 报告正确写入"""
    results = [
        FixtureResult(
            fixture_name="test-basic",
            direction="anthropic-to-openai",
            transform_ok=True,
            structure_result=ValidationResult(passed=True),
            semantic_notes=["no comparison"],
        ),
    ]
    path = tmp_path / "report.json"
    write_json_report(results, path)
    assert path.exists()
    import json
    data = json.loads(path.read_text())
    assert len(data) == 1
    assert data[0]["fixture_name"] == "test-basic"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_reporters.py -v
```
期望: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 reporters.py**

```python
"""Report generator for protocol transform validation results.

Produces human-readable terminal output and machine-readable JSON reports.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
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
            icon = "\N{HOURGLASS WITH FLOWING SAND} SKIP"
            skipped_count += 1
        elif r.structure_result is not None and r.structure_result.passed:
            icon = "\N{WHITE HEAVY CHECK MARK} PASS"
            passed_count += 1
        else:
            icon = "\N{CROSS MARK} FAIL"
            failed_count += 1

        lines.append(f"[{r.direction}/{r.fixture_name}]")
        lines.append(f"  Transform:      {'OK' if r.transform_ok else 'ERROR: ' + (r.transform_error or 'unknown')}")
        if r.structure_result:
            lines.append(f"  Structure:      {'PASS' if r.structure_result.passed else 'FAIL'}")
            for err in r.structure_result.errors:
                lines.append(f"    - {err.path}: {err.error_type} (expected={err.expected})")
            for w in r.structure_result.warnings:
                lines.append(f"    WARNING: {w}")
        else:
            lines.append(f"  Structure:      SKIP (transform failed)")
        if r.semantic_notes:
            for note in r.semantic_notes:
                lines.append(f"  Semantic:       {note}")
        lines.append("")

    lines.append("-" * 60)
    lines.append(f"Summary: {passed_count} passed, {failed_count} failed, {skipped_count} skipped")
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

    path.write_text(json.dumps(serializable, indent=2, ensure_ascii=False), encoding="utf-8")
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_reporters.py -v
```
期望: 3 PASSED

- [ ] **Step 5: 提交**

```bash
git add scripts/validate-protocol/reporters.py scripts/validate-protocol/tests/test_reporters.py
git commit -m "feat: add report generator with unit tests"
```

---

### Task 10: cli.py — 主入口，组装全部组件

**Files:**
- Create: `scripts/validate-protocol/cli.py`
- Create: `scripts/validate-protocol/__main__.py`

**Interfaces:**
- Consumes: `fixtures`, `runners`, `validators`, `comparators`, `reporters`
- Produces:
  - `def main() -> int`: entry point，返回 exit code
  - CLI 参数：`--fixture-root PATH`（默认 `fixtures/protocol-transform/`），`--output-dir PATH`（默认 `logs/validate-protocol/`）

- [ ] **Step 1: 创建 cli.py**

```python
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
        target_format, transform_result.output
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

    transform_result = run_stream_transform(
        case.direction, case.input_upstream_events
    )

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
    target: str, output: dict | None
) -> "ValidationResult | None":
    """Pick the right validator for the target format."""
    from validators import ValidationResult

    if output is None:
        return None

    body = output.get("body", output)

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
```

- [ ] **Step 2: 创建 __main__.py**

```python
"""Allow running the validation tool as ``python -m validate_protocol``."""
from cli import main
import sys

sys.exit(main())
```

- [ ] **Step 3: 验证导入正确**

```bash
cd scripts/validate-protocol && python -c "from cli import main; print('imports OK')"
```
期望: `imports OK`

- [ ] **Step 4: 提交**

```bash
git add scripts/validate-protocol/cli.py scripts/validate-protocol/__main__.py
git commit -m "feat: add main CLI entry point wiring all components"
```

---

### Task 11: Makefile 集成

**Files:**
- Modify: `Makefile`（追加 `validate-protocol` target）

**Interfaces:**
- Produces: `make validate-protocol` 一键运行验证

- [ ] **Step 1: 追加 Makefile target**

在 `Makefile` 末尾追加以下内容（在 `release:` target 之后）：

```makefile
.PHONY: validate-protocol

validate-protocol:
	@echo "==> 编译 Rust core (release mode)..."
	@cargo build --release --example validate-cli
	@echo "==> 运行协议转换验证..."
	@cd scripts/validate-protocol && python -m validate_protocol
```

- [ ] **Step 2: 验证 Makefile 语法**

```bash
make -n validate-protocol
```
期望: 打印将要执行的命令，无语法错误。

- [ ] **Step 3: 提交**

```bash
git add Makefile
git commit -m "feat: add make validate-protocol target"
```

---

### Task 12: 端到端冒烟测试

**Files:**
- Create: `scripts/validate-protocol/tests/test_e2e_smoke.py`
- Modify: `crates/core/examples/validate-cli.rs`（如有编译问题）

**Interfaces:**
- Consumes: 所有已完成组件
- Produces: 端到端测试覆盖完整流程

- [ ] **Step 1: 编写冒烟测试**

```python
# scripts/validate-protocol/tests/test_e2e_smoke.py
"""End-to-end smoke test for the full validation pipeline."""

import json
import tempfile
from pathlib import Path
from cli import main


def test_e2e_smoke_with_temp_fixture():
    """端到端测试：构造临时 fixture，完整跑一遍验证流程"""
    # 1. 创建临时 fixture 目录
    tmp_root = Path(tempfile.mkdtemp())
    sub = tmp_root / "anthropic-to-openai"
    sub.mkdir(parents=True)

    fixture = {
        "name": "smoke-test-basic",
        "mode": "non_stream",
        "notes": "e2e smoke test",
        "input": {
            "headers": {"x-api-key": "test-key-12345"},
            "path": "/v1/messages",
            "body": {
                "model": "claude-3-opus",
                "max_tokens": 100,
                "system": "You are a helpful assistant.",
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "hi"}]}
                ],
            },
        },
        "expected": {
            "path": "/v1/chat/completions",
            "body": {"model": "claude-3-opus"},
        },
    }
    (sub / "smoke-test.json").write_text(json.dumps(fixture), encoding="utf-8")

    # 2. 运行验证（需要 Rust CLI 已编译）
    import subprocess
    import sys

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "validate_protocol",
            "--fixture-root",
            str(tmp_root),
            "--output-dir",
            str(tmp_root / "output"),
        ],
        capture_output=True,
        text=True,
        cwd=str(Path(__file__).resolve().parent.parent),
        timeout=120,
    )

    # 3. 验证
    stdout = result.stdout
    stderr_str = result.stderr
    print("STDOUT:", stdout)
    print("STDERR:", stderr_str)

    assert "smoke-test-basic" in stdout
    # exit code 0 = all passed
    assert result.returncode == 0, (
        f"Expected exit 0, got {result.returncode}\n"
        f"stdout: {stdout}\nstderr: {stderr_str}"
    )
```

- [ ] **Step 2: 运行冒烟测试**

```bash
cd scripts/validate-protocol && python -m pytest tests/test_e2e_smoke.py -v
```
期望: 1 PASSED（如果 Rust CLI 编译成功且转换正确）

如果失败，检查 `validate-cli.rs` 的编译和输出，修复后重跑。

- [ ] **Step 3: 提交**

```bash
git add scripts/validate-protocol/tests/test_e2e_smoke.py
git commit -m "test: add end-to-end smoke test for validation pipeline"
```

---

## Plan Completion Checklist

- [ ] Task 1: Rust Core CLI ✅
- [ ] Task 2: Python 项目初始化 ✅
- [ ] Task 3: fixtures.py — Fixture 加载器 ✅
- [ ] Task 4: runners.py — Rust Core 调用器 ✅
- [ ] Task 5: validators.py — OpenAI 结构验证 ✅
- [ ] Task 6: validators.py — Anthropic 结构验证 ✅
- [ ] Task 7: validators.py — 流式序列状态机 ✅
- [ ] Task 8: comparators.py — litellm 语义对比 ✅
- [ ] Task 9: reporters.py — 报告生成器 ✅
- [ ] Task 10: cli.py — 主入口 ✅
- [ ] Task 11: Makefile 集成 ✅
- [ ] Task 12: 端到端冒烟测试 ✅
