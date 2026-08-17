# Implementation Order (TDD Red-Green-Refactor)

Implementation must strictly follow the **Red → Green → Refactor** sequence. Skipping steps, reordering, or parallel execution is prohibited.

## 1. Red — Fully Implement Failing Tests

Before writing a single line of implementation code, write a failing test suite that achieves 100% coverage of the spec's **Goal, Purpose, Motivation, Constraints, Scope, Acceptance Criteria, and Invariants**. Coverage of these seven elements is mandatory; partial implementation is not acceptable.

When the ticket defines **Contracts** (Precondition/Postcondition/Invariant from graph edge annotation), the Red phase must first translate each Contract into testable form — input schemas, output assertions, and invariant predicates — before implementing them as concrete test code. A Contract whose Precondition/Postcondition/Invariant cannot be expressed as a testable assertion is not yet fully specified.

- Tests must cover all observable behaviors, edge cases, failure modes, and invariants. Any behavior not covered is considered undefined and fails review.
- If a feature is deterministic yet fundamentally untestable, this is not a testing gap but an architectural defect. Redesign the system until it is testable before proceeding to implementation.
- Confirm that all tests fail red due to the absence of implementation. Tests that pass green by accident (e.g., meaningless assertions) are invalid.

## 2. Green — Implement Behavior (No Stubs, No Test Modification)

Implement the **behavior** specified by the tests; do not treat passing the tests as an end in itself. Tests are a means of verifying correctness, not the goal itself.

- Implementations that merely satisfy the literal wording of tests—via hardcoding, input-specific branching, or stubbed return values—are prohibited. The implementation must be a generalized, correct solution.
- If it is impossible to distinguish, via testing, whether an implementation is genuine or a disguised green, this indicates a design flaw caused by insufficient coverage. Add tests until the distinction is possible before proceeding with implementation.
- Modifying, deleting, or weakening tests to make an implementation pass is strictly forbidden. The implementation must conform to the tests; the reverse is never acceptable.
- An implementation whose correctness cannot be proven is invalid. It is not considered complete until it (or its design) is restructured into a provably correct form.

## 3. Refactor — Apply the Boy Scout Rule (Green State Only)

Refactor only after all tests are green. Refactoring in a red state is prohibited.

- Apply the Boy Scout Rule (leave the code cleaner than you found it; readability = translatability) to eliminate `unwrap()` calls, hardcoded values, false comments, and untested code in anything you touch.
- Verify that all tests remain green before and after each refactoring step. If a refactor breaks green, roll it back immediately.

## Definition of Done

Implementation is considered incomplete unless all of the following are satisfied:

- The tests fully and precisely specify the intended behavior.
- The implementation passes all tests green, without exception.
- Correctness is empirically guaranteed by the tests (not a disguised green).
- No gap exists between test coverage and intended behavior.

Green without red, green achieved by modifying tests, and green achieved through stubs are all violations and constitute incomplete work.

# Target ticket is PX-151: Provider-agnostic model/baseUrl configuration (-m/-u) for arbitrary Anthropic-compatible providers

**Ticket Key**: PX-151 · **Phase**: -1

---

## Background

### Goal
-m を自由なモデル選択、-u/--url を自由な baseUrl 設定として受け付けることで、conver が DeepSeek だけでなく OpenRouter / Ollama 等の任意の Anthropic 互換プロバイダーに接続して動作できるようにする。

### Purpose
現状は session.ts:91 の ANTHROPIC_BASE_URL と session.ts:94 の ANTHROPIC_DEFAULT_OPUS_MODEL が DeepSeek に直書きされ、-k も必須（cli.ts:84-88）のため単一ベンダーロックイン。ベース URL とモデルを外部から注入可能にしてロックインを解消する。

### Motivation
OpenRouter は https://openrouter.ai/api でネイティブな Anthropic Messages API を公開し、Ollama（>= v0.14.0）は http://localhost:11434/v1/messages を実装している。claude-agent-acp は Claude Code を起動するため、ANTHROPIC_BASE_URL とモデル env を差し替えるだけで両者へ接続できる。プロバイダーごとの対応を conver 内部に積まず、Claude Code の標準 env 契約に委ねるのが最小で堅牢。

### Constraints
- 既存の DeepSeek 夜間ループがフラグ無変更で動き続けること（デフォルト baseUrl = 現行 DeepSeek URL、デフォルト model = deepseek-v4-flash）。
- 新規依存（npm パッケージ等）を追加しない。
- ACP セッションライフサイクル（session.ts spawn/run/dispose）の構造を変えない。
- プロバイダー検出（URL を読んで挙動を切り替えるマジック）を追加しない。baseUrl は raw パススルー。

## Scope

- Change (path): src/cli.ts, src/session.ts, src/runner.ts, src/conver.ts とテスト4ファイル（src/cli.test.ts, src/session.test.ts, src/runner.test.ts, src/conver.test.ts）。ドキュメントは tools/conver/CLAUDE.md と RFC_ROOT.md。
- Change (action): -u/--url オプション追加、-k の必須解除、baseUrl 末尾スラッシュ正規化、ヘルプ文言の一般化。spawnAgent/withSession のシグネチャ変更、LoopOptions.baseUrl 追加、起動ログへの baseUrl 行追加。
- Change (detail): SessionConfig {apiKey, model, baseUrl} 型を新設し spawnAgent(config) 化。ANTHROPIC_BASE_URL を options 由来に。ANTHROPIC_DEFAULT_OPUS_MODEL = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? model。ANTHROPIC_API_KEY を空文字に設定（OpenRouter の Anthropic 直認証フォールバック防止）。
- Change (before-after): Before = ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic（session.ts:91 直書き）、ANTHROPIC_DEFAULT_OPUS_MODEL: deepseek-v4-pro（session.ts:94 直書き）、-k 必須。After = baseUrl は -u から、-k は任意（keyless プレースホルダ）、OPUS tier は env ?? model。
- Change (api): CliOptions.baseUrl / LoopOptions.baseUrl / SessionConfig を追加。spawnAgent(apiKey, model) を spawnAgent(config: SessionConfig) に、withSession(cwd, apiKey, model, fn) を withSession(cwd, config, fn) に変更。runWithSession も同様。
- Change (schema): データスキーマ変更なし。Tickets.json の構造・フィールドは不変。
- Change (config): 新 CLI オプション -u/--url <baseUrl>（デフォルト https://api.deepseek.com/anthropic）。-k/--api-key が optional 化。env 経由の上書き（ANTHROPIC_DEFAULT_OPUS_MODEL 等）を尊重。
- Change (dep): 依存追加なし。@agentclientprotocol/sdk 等の既存依存は不変。
- Non-change (item): ACP セッションライフサイクル、Slack 通知（notifier.ts）、tickets.ts、watcher.ts、step-timer.ts、cron-scheduler.ts、check-and-start-loop.ts、process.exit の意味論（必須不足時のみ exit 1）。
- Non-change (why): プロバイダー接続性の変更に閉じる。セッション管理・エラー回復は PX-150 で堅牢化済みの直交領域であり、本チケットで触れると回帰リスクが増える。
- Impact (component): cli.ts（パース）、session.ts（spawn env）、runner.ts（baseUrl スレッド）、conver.ts（起動ログ）。影響を受けるテスト: cli.test.ts（全フラグ系）、runner.test.ts（baseOptions と withSession モック）、conver.test.ts（起動ログ検証）。
- Impact (nature): CLI 表面の追加（新規 optional フラグ）と spawn env の変更。内部シグネチャ変更は TS 型レベルでコンパイル時に検出され、外部プロトコルへの破壊的変更はない。
- Impact (response): フラグ無変更の既存呼び出しはデフォルト値により従来通り DeepSeek で動作。-k 省略時は警告ログを出力し、認証必須プロバイダーでは上流エラーとして可視化。ドキュメント（CLAUDE.md オプション表）を更新。

## Implementation Target Files

- `src/cli.ts`
- `src/session.ts`
- `src/runner.ts`
- `src/conver.ts`
- `src/cli.test.ts`
- `src/session.test.ts`
- `src/runner.test.ts`
- `src/conver.test.ts`

## Investigation

- session.ts:91 — ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic がハードコード。
- session.ts:94 — ANTHROPIC_DEFAULT_OPUS_MODEL: deepseek-v4-pro がハードコード。
- session.ts:95-97 — SONNET / HAIKU / SUBAGENT は model 引数に従う。
- session.ts:79-100 — spawnAgent(apiKey, model) は env を ...process.env + 明示7変数で構築。他 env は透過（ANTHROPIC_CUSTOM_HEADERS 等は既に機能）。
- session.ts:172-181 — withSession(cwd, apiKey, model, fn) → spawnAgent(apiKey, model)。baseUrl を渡すにはシグネチャ変更が必要。
- cli.ts:56 — model デフォルト deepseek-v4-flash。
- cli.ts:84-88 — api-key 必須チェック（無ければ usage + exit 1）。
- runner.ts:51-67 — LoopOptions に model あり baseUrl なし。
- runner.ts:175-188 — runWithSession(cwd, apiKey, model, fn)。呼び出し箇所: 232, 245, 415, 445, 501, 514。
- runner.test.ts:83-98 — baseOptions() に apiKey/model あり。withSession モックは (cwd, key, model, fn) の4引数（126-133行）→ baseUrl 追加で更新必須。
- conver.test.ts:178-209 — 起動パラメータログは8行を検証（paramLines.length === 8）。baseUrl 行追加で更新必須。
- cli.test.ts — 全フラグ/デフォルト検証。-u 追加で拡張。
- 外部制約: OpenRouter は https://openrouter.ai/api（Anthropic Messages 互換、末尾スラッシュ不可、ANTHROPIC_API_KEY 空文字必要）。Ollama は v0.14.0+ で /v1/messages ネイティブ、トークンはダミーで可。

## Acceptance Criteria

- Happy path: node dist/conver.js -k <key> -s <url> -u https://openrouter.ai/api -m deepseek/deepseek-chat が claude-agent-acp を ANTHROPIC_BASE_URL=https://openrouter.ai/api, ANTHROPIC_AUTH_TOKEN=<key>, ANTHROPIC_MODEL=deepseek/deepseek-chat で spawn し、ループが走る。Ollama では -u http://localhost:11434 -m qwen3-coder を -k 無しで起動でき、keyless プレースホルダで動作する。
- Error case: -k 無し・-u 無しの既存 DeepSeek 呼び出し（-k <key> -s <url> のみ）が従来通りデフォルト baseUrl https://api.deepseek.com/anthropic で動作し、回帰しない。必須不足（-s 欠如等）は従来通り usage + exit(1)。
- Edge case: -u 末尾スラッシュは正規化される。process.env.ANTHROPIC_DEFAULT_OPUS_MODEL 設定時は OPUS tier が上書きされる。起動ログに baseUrl= が出力される。-k 省略時は警告が出る。

## Invariants

- 【Normal establishment】
  - -u/--url で指定された baseUrl が claude-agent-acp 子プロセスの ANTHROPIC_BASE_URL にそのまま伝播する。
  - -m で指定されたモデルが ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_SONNET_MODEL / ANTHROPIC_DEFAULT_HAIKU_MODEL / CLAUDE_CODE_SUBAGENT_MODEL に一貫して設定される。
  - -k 省略時も ANTHROPIC_AUTH_TOKEN に keyless プレースホルダが入り spawn が必ず成功する。
- 【Invariant on error】
  - 設定不足・パースエラー時は cli.ts が明示的に usage を表示して exit(1) するだけで、baseUrl 起因の未捕捉クラッシュが起きない。
  - セッション確立失敗は既存の PX-150 retry/give-up 機構に委ねられ、baseUrl 導入で回復経路が変わらない。
- 【Internal state invariant】
  - CliOptions.baseUrl === LoopOptions.baseUrl === 各 withSession 呼び出しの baseUrl（一貫性）。
  - spawn env は ...process.env を継承しつつ conver が制御する ANTHROPIC_* のみ上書き。ANTHROPIC_CUSTOM_HEADERS 等の他プロバイダー固有 env は透過させる。
- 【Boundary invariant】
  - baseUrl は末尾スラッシュを除去。空文字・未指定はデフォルト https://api.deepseek.com/anthropic。
  - OPUS tier は process.env.ANTHROPIC_DEFAULT_OPUS_MODEL 優先、未設定なら model。session.ts にプロバイダー固有のモデル名ハードコード（deepseek-v4-pro）を残さない。

## Contracts — mandatory 100% test coverage in TDD Red phase

### C001 — cli.ts -> CliOptions

- **Precondition**: argv contains -u <URL> or --url <URL>
- **Postcondition**: CliOptions.baseUrl equals the normalized URL (trailing slash removed)
- **Invariant**: baseUrl defaults to https://api.deepseek.com/anthropic when the option is absent

### C002 — cli.ts -> parseCliOptions

- **Precondition**: argv lacks -k/--api-key
- **Postcondition**: CliOptions.apiKey is empty string and no process.exit occurs
- **Invariant**: missing api-key alone never terminates the process

### C003 — session.ts spawnAgent -> child env

- **Precondition**: spawnAgent({apiKey, model, baseUrl}) is invoked
- **Postcondition**: child env ANTHROPIC_BASE_URL === baseUrl and ANTHROPIC_AUTH_TOKEN === apiKey or keyless placeholder
- **Invariant**: env always sets ANTHROPIC_MODEL === model, CLAUDE_CODE_SUBAGENT_MODEL === model, CLAUDE_CODE_EFFORT_LEVEL === high

### C004 — session.ts spawnAgent -> ANTHROPIC_DEFAULT_OPUS_MODEL

- **Precondition**: spawnAgent is invoked
- **Postcondition**: env ANTHROPIC_DEFAULT_OPUS_MODEL === process.env.ANTHROPIC_DEFAULT_OPUS_MODEL or model when unset
- **Invariant**: no provider-specific model literal (deepseek-v4-pro) is hardcoded in session.ts

### C005 — runner.ts runLoop -> withSession

- **Precondition**: runLoop(options) is called with options.baseUrl
- **Postcondition**: every runWithSession call passes baseUrl === options.baseUrl
- **Invariant**: no withSession call site drops the baseUrl argument

## Boy Scout Rule

- ハードコードされたリテラル（DeepSeek URL・モデル名）を named constant 化するのではなく、オプション/env 由来の値に置換し、値の出自をコード上で読めるようにする。
- spawnAgent(apiKey, model) の位置引数2つを SessionConfig にまとめ、呼び出しの意図（どの設定で spawn するか）を型で表現する。
- 変更対象の withSession / runWithSession は関数名が動詞句で意図が読み取れる状態を維持し、baseUrl 追加で引数爆発させず options オブジェクトで束ねる。
- 触れた箇所のコメント（session.ts の DeepSeek V4 の Anthropic 互換エンドポイント 等）をプロバイダー非依存の記述に更新し、嘘のコメントを残さない。
- 既存コードで翻訳可能性を損なう箇所は、本変更の範囲内（cli/session/runner/conver）で発見したもののみ改善する（スコープ外の全面改修はしない）。

## Test Plan

### Unit Tests

- UT: [Normal] -u https://openrouter.ai/api parses into CliOptions.baseUrl
- UT: [Normal] -u omitted returns default baseUrl https://api.deepseek.com/anthropic (C001 invariant)
- UT: [Normal] --url long form equals -u short form
- UT: [Edge] -u https://foo/api/ trailing slash is normalized to https://foo/api
- UT: [Edge] -u empty string falls back to default baseUrl
- UT: [Error] -k omitted does not exit; CliOptions.apiKey === empty string (C002 postcondition)
- UT: [Normal] full argv with -u coexists (model and baseUrl both correct)
- UT: [Normal] spawnAgent is invoked with SessionConfig {apiKey, model, baseUrl} and builds the child env (C003/C004 precondition)
- UT: [Normal] mock child_process.spawn: env.ANTHROPIC_BASE_URL === baseUrl, env.ANTHROPIC_AUTH_TOKEN === apiKey, env.ANTHROPIC_MODEL === model, env.CLAUDE_CODE_SUBAGENT_MODEL === model, env.CLAUDE_CODE_EFFORT_LEVEL === high (C003)
- UT: [Normal] apiKey omitted leads to env.ANTHROPIC_AUTH_TOKEN === keyless placeholder (C003 postcondition)
- UT: [Normal] process.env.ANTHROPIC_DEFAULT_OPUS_MODEL set leads to env override; unset falls back to model (C004)
- UT: [Invariant] missing api-key never terminates the process (C002 invariant)
- UT: [Invariant] spawn env never contains the literal deepseek-v4-pro hardcoded in session.ts (C004 invariant)
- UT: [Boundary] baseUrl with scheme-less value passes through unchanged (no magic validation)
- UT: [Invariant] every runWithSession call passes options.baseUrl unchanged to withSession (C005)

### Integration Tests

- IT: [point] cli.ts -> runner.ts -> session.ts baseUrl threading: runLoop passes options.baseUrl into withSession
- IT: [verify] runner.test.ts withSession mock signature updated to receive baseUrl; every call receives baseUrl === options.baseUrl (C005); main() startup log includes a baseUrl= key=value line; buildLoopOptions carries baseUrl from CliOptions to LoopOptions without loss
- IT: [prereq] All unit tests green; Makefile test-conver (npx tsc + node --test on dist) passes
- IT: [tickets] Related tickets PX-145 (CLI options), PX-146 (LoopOptions/retry), PX-149/PX-150 (session robustness) must remain green

### Exceptions

- Item: live end-to-end session against external providers (OpenRouter/Ollama). Reason: requires network + real API credentials or a local Ollama daemon, so it cannot test in CI. This is not a design defect or an architectural defect: the child-process env construction is fully unit-tested by mocking child_process.spawn. Alternative: assert the exact env object passed to spawn via mock, and verify provider connectivity manually in review.
- Item: behavior of claude-agent-acp against a live third-party endpoint. Reason: depends on external service availability and version, not testable in a hermetic unit suite; this is not an architectural defect of conver. Alternative: unit-test that the spawned env matches the documented ANTHROPIC_* contract exactly.

### Plan Test Code (concrete code)

- UT: C001 precondition/postcondition - -u/--url parsed into normalized CliOptions.baseUrl
```typescript
const argv = ["node", "conver.js", "-k", "k", "-s", "s", "-u", "https://openrouter.ai/api/"];
const options = parseCliOptions(argv);
assert.strictEqual(options.baseUrl, "https://openrouter.ai/api");
```
- UT: C001 invariant - default baseUrl when -u absent
```typescript
const defaults = parseCliOptions(["node", "conver.js", "-k", "k", "-s", "s"]);
assert.strictEqual(defaults.baseUrl, "https://api.deepseek.com/anthropic");
```
- UT: C002 precondition/postcondition - missing -k does not exit and apiKey is empty
```typescript
const noKey = parseCliOptions(["node", "conver.js", "-s", "https://hooks.slack.com/x"]);
assert.strictEqual(noKey.apiKey, "");
```
- UT: C002 invariant - missing api-key alone never terminates the process (parseCliOptions is pure; exit path only when slack-url also missing)
```typescript
// no process.exit is reachable inside parseCliOptions for api-key alone
assert.strictEqual(noKey.apiKey, "");
```
- UT: C003 precondition - spawnAgent invoked with SessionConfig
```typescript
const config = { apiKey: "sk-test", model: "deepseek/deepseek-chat", baseUrl: "https://openrouter.ai/api" };
const { proc, stream } = spawnAgent(config);
```
- UT: C003 postcondition - child env carries baseUrl/auth/model
```typescript
assert.strictEqual(capturedEnv.ANTHROPIC_BASE_URL, "https://openrouter.ai/api");
assert.strictEqual(capturedEnv.ANTHROPIC_AUTH_TOKEN, "sk-test");
assert.strictEqual(capturedEnv.ANTHROPIC_MODEL, "deepseek/deepseek-chat");
```
- UT: C003 invariant - env always sets model tiers + effort
```typescript
assert.strictEqual(capturedEnv.CLAUDE_CODE_SUBAGENT_MODEL, "deepseek/deepseek-chat");
assert.strictEqual(capturedEnv.CLAUDE_CODE_EFFORT_LEVEL, "high");
```
- UT: C004 postcondition - ANTHROPIC_DEFAULT_OPUS_MODEL = env override ?? model
```typescript
const prev = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = "deepseek-v4-pro";
spawnAgent({ apiKey: "k", model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com/anthropic" });
assert.strictEqual(capturedEnv.ANTHROPIC_DEFAULT_OPUS_MODEL, "deepseek-v4-pro");
delete process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
spawnAgent({ apiKey: "k", model: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com/anthropic" });
assert.strictEqual(capturedEnv.ANTHROPIC_DEFAULT_OPUS_MODEL, "deepseek-v4-flash");
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = prev;
```
- UT: C004 invariant - no hardcoded provider-specific literal remains
```typescript
const envJson = JSON.stringify(capturedEnv);
assert.strictEqual(envJson.includes("deepseek-v4-pro"), false);
```
- UT: C005 postcondition/invariant - every runWithSession call passes baseUrl unchanged
```typescript
const loopOptions = { ...baseOptions(), baseUrl: "https://openrouter.ai/api" };
await runLoop(loopOptions);
assert.strictEqual(mockState.withSessionBaseUrls.every((u) => u === "https://openrouter.ai/api"), true);
```

## Changes in Prior Implementation Rounds

| Before | After | Description |
|--------|-------|-------------|
| cli.ts: ANTHROPIC_BASE_URL/OPUS model hardcoded in session.ts, -k mandatory, no baseUrl option | cli.ts adds -u/--url + normalizeBaseUrl (trailing-slash strip, default DeepSeek URL); -k is optional | Provider-agnostic CLI surface for base URL and model |
| session.ts: spawnAgent(apiKey, model) hardcoded DeepSeek env; withSession(cwd, apiKey, model, fn) | session.ts adds SessionConfig + pure buildSpawnEnv(); spawnAgent(config, spawnFn?) and withSession(cwd, config, fn) thread baseUrl; ANTHROPIC_DEFAULT_OPUS_MODEL = env ?? model; ANTHROPIC_API_KEY='' | Env construction extracted to a pure, directly testable function |
| runner.ts: LoopOptions had no baseUrl; runWithSession(cwd, apiKey, model, fn) | runner.ts adds LoopOptions.baseUrl, toSessionConfig(options), runWithSession(cwd, config, fn) at all 6 call sites | baseUrl threaded from CLI to every ACP session |
| conver.ts: startup log printed model/ticketsPath/... (8 param lines) | conver.ts prints baseUrl= line and a keyless warning to stderr when -k is omitted | Startup visibility for the provider being used |
| tests covered DeepSeek-only behavior | cli/session/runner/conver tests updated + spawn-env assertions added; test.sh [CLI3] now expects slack-url error | Red-phase test suite for the new contracts |

## Notes in Prior Implementation Rounds

- 【Implementation steps】: 1) cli.ts + cli.test.ts（-u/--url 追加、-k optional 化、末尾スラッシュ正規化、ヘルプ文言一般化）。2) session.ts + session.test.ts（SessionConfig 導入、env 構築、OPUS env ?? model、ANTHROPIC_API_KEY 空文字、spawn モックで env 検証）。3) runner.ts + runner.test.ts（LoopOptions.baseUrl、runWithSession へのスレッド、withSession モックのシグネチャ更新）。4) conver.ts + conver.test.ts（baseUrl ログ行）。5) ドキュメント更新。
- 【Risks】: OPUS tier デフォルトが process.env.ANTHROPIC_DEFAULT_OPUS_MODEL 未設定時に deepseek-v4-pro から model へ変わる（メインエージェントが flash になる）。既存 DeepSeek 運用者は export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro で維持する。ANTHROPIC_API_KEY 空文字追加後、DeepSeek で AUTH_TOKEN が優先されることを実機で確認する。
- 【Caveats】: OpenRouter は ANTHROPIC_API_KEY の明示的空文字が必要（Anthropic 直認証フォールバック防止）。Ollama は >= v0.14.0 かつトークンを無視する（keyless で可）。末尾スラッシュは OpenRouter が拒否。ANTHROPIC_CUSTOM_HEADERS は process.env 透過で既に機能（コード変更不要、動作確認のみ）。
- 【Open items】: baseUrl の URL スキーマ/形式検証を入れるか。CLAUDE_CODE_EFFORT_LEVEL=high をオプション化（--effort）するか。--opus-model フラグを追加するか。
- 【Future improvements】: per-tier モデル CLI フラグ（--opus-model / --sonnet-model / --haiku-model）、プロバイダープリセット（deepseek / openrouter / ollama）、モデル名補完。
Implementation summary (PX-151):
- Changed files: src/cli.ts, src/session.ts, src/runner.ts, src/conver.ts, src/cli.test.ts, src/session.test.ts, src/runner.test.ts, src/conver.test.ts, test.sh
- Key changes: -u/--url baseUrl option (default https://api.deepseek.com/anthropic), -k optional with keyless placeholder token, SessionConfig + buildSpawnEnv pure env constructor, ANTHROPIC_DEFAULT_OPUS_MODEL = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? model, ANTHROPIC_API_KEY set to empty string (OpenRouter fallback prevention), baseUrl threaded through runner to every withSession call, startup log + keyless warning.
- Test results: make test-conver -> 212 tests, 212 pass, 0 fail. CLI integration ([CLI1/3/4/5] of test.sh) verified manually: --help exit 0, no-args error mentions slack-url + usage, -k-only error mentions slack-url, keyless (-k omitted) starts with warning and baseUrl log.
- Quality check: run-quality-checks.js -> 0 issues (converted showUsage/--version console.log to process.stdout.write).
- Verified env: spawnAgent passes buildSpawnEnv(config) to child_process.spawn (spawnFn injection seam for tests).
- Open item (documented risk): existing DeepSeek users should export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro to keep the pro/flash split; manual provider connectivity check for OpenRouter/Ollama remains (cannot be CI-tested).

## PX-151 — implemented at 15 locations

### src/cli.test.ts

- Line 1
```typescript
// cli.test.ts — parseCliOptions のユニットテスト
```

### src/cli.ts

- Line 21
```typescript
export interface CliOptions {
```

- Line 41
```typescript
function showUsage(): void {
```

### src/conver.test.ts

- Line 17
```typescript
interface MockLoopOptions {
```

- Line 81
```typescript
function baseOptions(overrides?: Partial<MockLoopOptions>): MockLoopOptions {
```

### src/conver.ts

- Line 123
```typescript
  const options = parseCliOptions(process.argv);
```

### src/runner.test.ts

- Line 32
```typescript
interface MockState {
```

- Line 85
```typescript
function baseOptions(overrides?: Partial<LoopOptions>): LoopOptions {
```

### src/runner.ts

- Line 50
```typescript
export interface LoopOptions {
```

- Line 176
```typescript
function toSessionConfig(options: LoopOptions): SessionConfig {
```

- Line 234
```typescript
async function runResolve(
```

### src/session.test.ts

- Line 230
```typescript
        prompt() { promptCalled = true; },
```

- Line 443
```typescript
  function callEnv(overrides?: Partial<SessionConfig>): NodeJS.ProcessEnv {
```

- Line 542
```typescript
  function captureSpawnEnv(config: SessionConfig): NodeJS.ProcessEnv {
```

### src/session.ts

- Line 72
```typescript
export interface SessionConfig {
```
