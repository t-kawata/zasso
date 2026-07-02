# 协议转换正确性验证工具设计

Status: draft · Date: 2026-06-25 · Depends on: [10-protocol-transform-design.md](../../../specs/10-protocol-transform-design.md), [90-protocol-transform-roadmap.md](../../../specs/90-protocol-transform-roadmap.md)

## 1. 问题

`crates/core` 实现了 6 个协议转换方向（Anthropic ↔ OpenAI Chat ↔ OpenAI Responses），但所有转换的正确性依据均为**开发者推断**：

- 所有 fixture 均为手工构造，使用合成 ID 和占位符 API key
- 设计 spec 和代码中零引用 Anthropic/OpenAI 官方 API 文档
- 未依赖任何经过社区验证的协议兼容库
- 测试证明了"代码做到了开发者期望它做的事"（内部一致性），但未证明"代码与真实 API 的期望一致"（外部正确性）

具体风险：

- `thinking` block 的 `signature` 字段用合成值代替，真实 API 是否接受未知
- `stop_reason` → `finish_reason` 映射是否覆盖了所有真实值未知
- Responses API 的事件生命周期是否与 OpenAI 实际产出一致未知
- `deny_unknown_fields` 导致 spec 要求的有损降级变成错误拒绝

## 2. 目标

| # | 目标 | 衡量标准 |
|---|------|----------|
| G1 | 为所有 6 个转换方向建立基于社区库的外部正确性依据 | 每个方向的输出均通过 `openai-python` / `anthropic-sdk-python` 的类型模型验证 |
| G2 | 提供离线验证工具，开发者可一键运行 | `make validate-protocol` 完成全量验证 |
| G3 | 语义对比作为辅助参考，不作为 pass/fail 依据 | 用 `litellm` 做语义对比，差异仅输出到报告 |
| G4 | 验证工具自身具备单元测试覆盖 | fixture 加载、结构验证、语义对比、报告生成各有测试 |

## 3. 非目标

- 不在 CI 中自动运行（当前阶段为离线工具）
- 不录制真实 API 流量作为 golden fixture（留作未来阶段）
- 不程序化生成对抗性测试输入（留作未来阶段）
- 不修改 Rust core 的公共 API

## 4. 方案选择

### 4.1 正确性权威来源

**选定**：社区兼容库（`openai-python`、`anthropic-sdk-python`、`litellm`）

排除的方案：
- ~~真实 API 流量录制~~：需要 API 费用，受速率限制，结果非确定性
- ~~官方 API Schema~~：Anthropic 不提供 OpenAPI spec，OpenAI 的 spec 不完整
- ~~一次性审计~~：无法防止后续改动引入回归

### 4.2 验证深度

**选定**：结构验证（pass/fail）+ 语义对比（best-effort，仅报告）

- **结构验证**：输出能否被社区 SDK 的类型模型成功解析（`model_validate()`）
- **语义对比**：尝试使用 litellm 的工具函数进行参数映射对比，但 litellm 主要做真实 API 调用，不提供纯离线格式转换。对于不支持的方向，仅展示输出，标记为 SKIP

### 4.3 执行方式

**选定**：离线 Python 脚本，`make validate-protocol` 一键运行

排除的方案：
- ~~CI 自动化~~：当前阶段有 P0/P1 问题未修，先建工具再考虑集成
- ~~Rust 工具~~：验证者和被验证者同源，存在盲区

### 4.4 覆盖范围

**选定**：全部 6 个转换方向

| 方向 | 非流式 | 流式 |
|------|--------|------|
| Anthropic → OpenAI Chat | ✅ | ✅ |
| OpenAI Chat → Anthropic | ✅ | ✅ |
| Anthropic → OpenAI Responses | ✅ | ✅ |
| OpenAI Responses → Anthropic | ✅ | ✅ |
| Responses → OpenAI Chat | ✅ | ✅ |
| OpenAI Chat → Responses | N/A | ✅ |

## 5. 工具架构

```
scripts/
└── validate-protocol/
    ├── __init__.py
    ├── cli.py              # 入口：python -m validate_protocol
    ├── runners.py           # 调用 Rust core CLI 执行转换
    ├── validators.py        # 结构验证（openai/anthropic SDK 类型）
    ├── comparators.py       # 语义对比（litellm）
    ├── reporters.py         # 生成报告
    ├── fixtures.py          # 加载 fixture 文件
    ├── requirements.txt     # Python 依赖
    └── tests/
        ├── test_fixtures.py
        ├── test_validators.py
        ├── test_comparators.py
        └── test_reporters.py
```

### 5.1 端到端数据流

```
fixture.json
    ↓
[1] fixtures.py 提取 input.request + input.upstream_events
    ↓
[2] runners.py 调用 Rust core CLI
    cargo run --release -p llm-bridge-core -- transform-request <direction>
    ↓
[3] 拿到 actual_output (JSON)
    ↓
[4] validators.py 结构验证
    openai.ChatCompletion.model_validate(actual_output)
    或 anthropic.Message.model_validate(actual_output)
    ↓
[5] comparators.py 语义对比（best-effort）
    尝试使用 litellm 的参数映射工具函数进行对比
    对于 litellm 不支持的方向，仅展示我们的输出，标记为 SKIP
    ↓
[6] reporters.py 生成报告
    终端彩色表格 + JSON 报告写入 logs/validate-protocol/report.json
    exit code: 有任何 structure_passed=False 则非零
```

### 5.2 流式 Fixture 的特殊处理

流式 fixture 结构不同于非流式：

```json
{
  "input": {
    "upstream_events": [ /* SSE 事件数组 */ ]
  },
  "expected_output": {
    "downstream_sse_contains": [ /* 期望包含的事件片段 */ ]
  }
}
```

处理方式：
- 将 `upstream_events` 序列化为 SSE 文本流
- 调用 Rust core：`transform-stream --direction <dir>`
- 逐行读取 stdout 的 SSE 事件
- **结构验证**：每个事件 JSON 必须是目标协议合法的 event 类型
- **序列验证**：检查事件序列是否符合 spec §4.1 的状态机约束

Anthropic 输出状态机：

```
message_start → [content_block_start, message_delta]
content_block_start → [content_block_delta, content_block_stop]
content_block_delta → [content_block_delta, content_block_stop]
content_block_stop → [content_block_start, content_block_stop, message_delta]
message_delta → [message_stop]
message_stop → [] (终态)
```

违反顺序 → `structure_passed = False`

## 6. 组件职责

### 6.1 `fixtures.py` — Fixture 加载器

```python
@dataclass
class FixtureCase:
    name: str                          # "non-stream-basic"
    direction: str                     # "anthropic-to-openai"
    fixture_path: Path
    input_request: dict                # fixture["input"]["request"]
    input_upstream_events: list[dict]  # fixture["input"]["upstream_events"] (流式)
    expected_output: dict              # fixture["expected_output"] (仅作参考)
    expected_error: dict | None        # fixture["expected_error"] (错误路径测试)

def load_all_fixtures(root: Path) -> list[FixtureCase]
```

逻辑：
- 遍历所有子目录，按目录名推断 `direction`
- 区分非流式（有 `request`/`response`）和流式（有 `upstream_events`）
- 跳过 `README.md` 等非 JSON 文件

### 6.2 `runners.py` — Rust Core 调用器

```python
def run_request_transform(
    direction: str,
    request_body: dict,
    headers: dict,
) -> TransformResult

def run_stream_transform(
    direction: str,
    upstream_events: list[dict],
) -> list[dict]

@dataclass
class TransformResult:
    success: bool
    output: dict | None
    error: str | None
```

调用方式：
```
echo '<input_request>' | \
  target/release/llm-bridge-core \
    transform-request \
    --direction anthropic-to-openai \
    --headers '<input_headers>'
```

### 6.3 `validators.py` — 结构验证器

```python
def validate_openai_chat_request(body: dict) -> ValidationResult
def validate_openai_chat_response(body: dict) -> ValidationResult
def validate_openai_responses_request(body: dict) -> ValidationResult
def validate_openai_responses_response(body: dict) -> ValidationResult
def validate_anthropic_request(body: dict) -> ValidationResult
def validate_anthropic_response(body: dict) -> ValidationResult
def validate_stream_sequence(events: list[dict], target: str) -> ValidationResult

@dataclass
class ValidationResult:
    passed: bool
    errors: list[FieldError]
    warnings: list[str]

@dataclass
class FieldError:
    path: str          # "tool_choice.type"
    error_type: str    # "missing_required_field"
    expected: str      # "str"
    actual: Any        # null
```

覆盖矩阵：

| 输出类型 | 验证用 SDK 类型 |
|---------|----------------|
| OpenAI Chat 请求 | `openai.types.chat.ChatCompletion` 相关模型 |
| OpenAI Chat 响应 | `openai.types.ChatCompletion` |
| OpenAI Responses 请求 | `openai.types.Response` 相关模型 |
| OpenAI Responses 响应 | `openai.types.responses.Response` |
| Anthropic 请求 | `anthropic.types.MessageCreateParams` |
| Anthropic 响应 | `anthropic.types.Message` |

### 6.4 `comparators.py` — 语义对比器

```python
async def compare_with_litellm(
    direction: str,
    input_request: dict,
    our_output: dict,
) -> ComparisonReport:
    """
    尝试使用 litellm 的工具函数进行语义对比。

    注意：litellm 主要做真实 API 调用，不提供纯离线格式转换。
    对于不支持的方向，返回 ComparisonReport with notes=["litellm 不支持此方向的离线对比"]
    """

@dataclass
class ComparisonReport:
    field_diffs: list[FieldDiff]
    missing_in_ours: list[str]
    extra_in_ours: list[str]
    notes: list[str]

@dataclass
class FieldDiff:
    path: str          # "tool_choice.type"
    our_value: Any
    litellm_value: Any
    severity: str      # "info" | "warning" | "critical"
```

差异等级：
- `info`：纯风格差异（如字段顺序、默认值）
- `warning`：语义差异但双方都合理（如 `tool_choice` 映射策略不同）
- `critical`：我们产出的字段在 litellm 的输出中完全缺失，或反之

### 6.5 `reporters.py` — 报告生成器

```python
def generate_report(results: list[FixtureResult]) -> str

@dataclass
class FixtureResult:
    fixture_name: str
    direction: str
    transform_ok: bool
    structure_passed: bool
    structure_errors: list[FieldError]
    semantic_diffs: list[FieldDiff]
```

输出格式：

```
=== Protocol Transform Validation Report ===

[anthropic-to-openai/non-stream-basic]
  Transform:      ✅ OK
  Structure:      ✅ PASS
  Semantic Diffs: 0

[anthropic-to-openai/non-stream-tool-use]
  Transform:      ✅ OK
  Structure:      ✅ PASS
  Semantic Diffs: 2 (info)
    - tool_choice.default: ours="auto", litellm="none" [info]
    - tools[0].strict: missing in ours [info]

[responses-to-openai/non-stream-basic]
  Transform:      ❌ ERROR: missing CLI subcommand
  Structure:      ⏭️ SKIP
  Semantic Diffs: ⏭️ SKIP

Summary: 15/20 fixtures passed structure validation, 3 semantic warnings
```

同时输出 JSON 格式报告到 `logs/validate-protocol/report.json`。

## 7. 错误处理

### 7.1 Rust Core 转换失败

- 如果 fixture 包含 `"expected_error"` 字段，标记为预期错误，跳过后续验证
- 否则标记为 `transform_ok = False`，跳过结构和语义验证

### 7.2 社区 SDK 类型验证失败

- 提取 `ValidationError` 的字段路径、错误类型、期望类型、实际值
- `structure_passed = False`
- 仍然尝试语义对比（litellm 可能更宽容）

### 7.3 litellm 不支持离线对比

litellm 主要做真实 API 调用，不提供纯离线格式转换功能。对于无法离线对比的方向：

- 记录到 `semantic_diffs`，severity = "info"，note = "litellm 不支持此方向的离线对比"
- 不影响 `structure_passed` 判定
- 报告中显示 "⚠️ litellm 不支持此方向的离线对比，仅展示输出"
- **实现时优先保证结构验证的完整性，语义对比作为辅助参考**

### 7.4 Fixture 格式不兼容

- 跳过该 fixture，记录 warning
- 不导致整个验证流程失败
- 在报告开头汇总跳过的 fixture 数量和原因

### 7.5 超时

- Rust core 执行超时：30 秒 → `transform_ok = False, error = "timeout"`
- litellm 调用超时：10 秒 → `semantic_diffs` 记录 timeout
- 不影响其他 fixture 的验证

## 8. 前置依赖

### 8.1 Rust Core CLI

当前 Rust core 是 library（`crates/core`），没有 CLI 入口。验证工具需要一个 CLI 二进制。

**选定方案**：在 `crates/core/examples/` 下新建 `validate-cli.rs`，作为 `cargo run --example validate-cli` 的入口。

提供两个子命令：
- `transform-request --direction <dir>`：读取 stdin JSON，输出转换后的 JSON
- `transform-stream --direction <dir>`：读取 stdin SSE 流，输出转换后的 SSE 流

### 8.2 Python 依赖

```
openai>=1.30.0,<2.0
anthropic>=0.28.0,<1.0
litellm>=1.40.0,<2.0
pydantic>=2.0
rich>=13.0
pytest>=7.0
```

## 9. Makefile 集成

```makefile
.PHONY: validate-protocol

validate-protocol:
	@echo "==> 编译 Rust core (release mode)..."
	@cargo build --release -p llm-bridge-core
	@echo "==> 运行协议转换验证..."
	@cd scripts/validate-protocol && python -m validate_protocol
```

运行方式：`make validate-protocol`

## 10. 版本管理

- `requirements.txt` 中锁定主要版本：`openai>=1.30.0,<2.0.0`
- 每月手动运行 `pip install --upgrade` 检查新版本
- 如果社区 SDK 升级导致验证失败：
  1. 检查是否是真实的协议变更
  2. 如果是，更新 Rust core 的转换逻辑
  3. 如果只是 SDK 类型模型重构，更新验证工具的适配代码

## 11. 质量保证

### 11.1 验证工具的单元测试

- `test_fixtures.py`：fixture 加载逻辑、格式不兼容处理
- `test_validators.py`：结构验证逻辑、必填字段缺失、类型错误
- `test_comparators.py`：语义对比逻辑、差异等级判定
- `test_reporters.py`：报告生成逻辑、输出格式

### 11.2 端到端冒烟测试

用一个人工构造的简单 fixture，完整跑一遍验证流程，确保：
- fixture 加载正确
- Rust core 调用成功
- 结构验证通过
- 语义对比无差异
- 报告生成正确

### 11.3 Code Review 检查清单

新增验证工具代码时，需要检查：

- [ ] fixture 加载逻辑是否正确处理所有子目录？
- [ ] 结构验证是否覆盖了目标协议的所有必填字段？
- [ ] 语义对比是否正确处理了 litellm 不支持的方向？
- [ ] 报告输出是否清晰、可读、可追溯？
- [ ] 错误处理是否完整（超时、格式错误、SDK 异常）？
- [ ] 单元测试是否覆盖了关键路径和边界情况？

## 12. 未来扩展

### 12.1 CI 集成（转换层稳定后）

```yaml
# .github/workflows/validate-protocol.yml
name: Protocol Validation
on:
  push:
    paths:
      - 'crates/core/src/transform/**'
      - 'crates/core/src/stream/**'
      - 'fixtures/protocol-transform/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r scripts/validate-protocol/requirements.txt
      - run: make validate-protocol
```

### 12.2 真实流量录制

每月运行一次脚本，向 Anthropic 和 OpenAI 发真实请求，录制响应作为 golden fixture，更新验证基准。

### 12.3 对抗性生成

基于社区 SDK 的类型定义，程序化生成边界和组合输入，测试转换器的鲁棒性。
