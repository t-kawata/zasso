---
ticket_id: 1
title: test-oneshot: テスト用バイナリ作成
slug: test-oneshot
status: draft
created_at: 2026-07-02
updated_at: 2026-07-02
---
# test-oneshot: テスト用バイナリ作成

## Summary

`test-chat` `test-run` とは別に、システムプロンプト・ユーザープロンプト・思考モードON/OFFスイッチをCLI引数で指定し、ワンショット推論の結果をタイムスタンプ・トークン速度とともに標準出力に表示する `test-oneshot` バイナリを新規作成する。

## Background

既存のテストバイナリには以下の制約があり、柔軟なプロンプトテストが行えない：

- **test-chat**: `--prompt` のみ対応。システムプロンプト不可。プロンプト書式は `"User: ...\n\nAssistant: "` 固定。
- **test-run**: 全プロンプトがハードコード（日本語固定）。モデル名も `gemma4-e2b` 固定。CLI引数なし。

ASR補正タスク（ggufrs の主たるユースケース）では、以下の検証パターンが必要である：

1. 任意のシステムプロンプトでモデルの振る舞いを制御するテスト
2. 思考モード（chain-of-thought）のON/OFFによる応答の違いの検証
3. Qwen3.5-0.8B / Gemma4-E2B 等、異なるモデルへの同一プロンプト投入

また、`GenerateParams` にはかつて `enable_thinking` フィールドが計画された（Tickets.md M5-2.3, line 651）が、llama-cpp-2 移行（M6-5, line 770）に伴い削除され、現状ゼロ実装である。本バイナリでは、推論パイプラインの中核を変更せずとも、**プロンプトレベルでの思考モード制御**を実現することで、実用的なテスト手段を提供する。

## Scope

1. **`src/bin/test-oneshot.rs` の新規作成**
   - CLI引数: `--model`（必須）、`--system-prompt`（省略可、デフォルトなし）、`--prompt`（必須）、`--temperature`（デフォルト 0.3）、`--max-tokens`（デフォルト 256）、`--thinking`/`--no-thinking`（デフォルト `--no-thinking`）
   - モデル名解決: `resolve_model_config()` 関数（test-chat と同一の4モデル対応）
   - エンジン初期化: CPU-only、`auto_start_server: false`、単一モデル構成（test-chat と同一パターン）

2. **プロンプト組み立てロジック**
   - システムプロンプト指定時: `"System: {sysprompt}\n\nUser: {prompt}\n\nAssistant: "`
   - システムプロンプト未指定時: `"User: {prompt}\n\nAssistant: "`（test-chat 互換）
   - 思考モード `--thinking` 時: システムプロンプトの先頭に指示文 `"Think step by step before answering.\n"` を挿入（システムプロンプト未指定時はシステムプロンプトとして自動生成）

3. **推論実行と結果表示**
   - `engine.generate()` （非ストリーミング）でワンショット推論
   - 出力形式: 生成テキスト、タイムスタンプ、生成文字数・推定トークン数・処理時間・トークン/秒

4. **`Cargo.toml` への `[[bin]]` エントリ追加**
   - `name = "test-oneshot"`, `path = "src/bin/test-oneshot.rs"`

## Non-scope

- **`GenerateParams` / `InferenceParams` / `InferenceEngine` トレイトの変更は行わない** — 思考モード制御はプロンプトレベルのみで実現し、コア推論パイプラインには影響を与えない
- **対話モード（multi-turn）は実装しない** — test-chat が既にカバー
- **ストリーミング出力は実装しない** — ワンショット取得に特化
- **`enable_thinking` フィールドの `GenerateParams` への追加は行わない** — 本バイナリではプロンプトエンジニアリングで代替。将来のチケットでコア変更が必要なら別途計画
- **チャットテンプレート（Qwen3.5 の `<|im_start|>` 等）の適用は行わない** — 現状のフラットプロンプト形式に統一
- **サーバーモードは実装しない** — test-chat/test-run と同様に `auto_start_server: false`

## Investigation

### 証拠1: test-chat のプロンプト書式（src/bin/test-chat.rs:214-217）

test-chat は `run_one_shot()` 内で以下のようにプロンプトを組み立てている：

```rust
let formatted_prompt = format!("User: {}\n\nAssistant: ", raw_prompt);
```

システムプロンプトの概念は存在しない。`CliArgs` 構造体にも `system_prompt` フィールドはない（lines 59-68）。

### 証拠2: `GenerateParams` および `InferenceParams` に思考モード関連フィールドなし

- `src/inference/mod.rs:27-58`: `GenerateParams` は `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty` の5フィールドのみ。`enable_thinking` は存在しない。
- `src/inference/generate.rs:50-54`: `InferenceParams` は `temperature`, `max_tokens`, `top_p` の3フィールドのみ。`enable_thinking` も `presence_penalty` / `frequency_penalty` もマッピングされていない（`From<GenerateParams>` 実装でドロップされる）。

### 証拠3: 過去の設計文書における enable_thinking の経緯

- Tickets.md:651-656（M5-2.3）: `GenerateParams` に `enable_thinking: Option<bool>` を追加し、mistralrs の `RequestBuilder` に反映する計画。
- Tickets.md:770（M6-5）: llama-cpp-2 移行に伴い `send_raw()` 削除と同時に `enable_thinking` 削除。理由: `RequestBuilder` が llama-cpp-2 に存在しないため。
- 現状 `src/` 配下の全 `.rs` ファイルで `thinking` / `reasoning` 文字列の出現はゼロ。

### 証拠4: llama-cpp-2 における思考モード制御

llama-cpp-2 の `run_inference_blocking()`（src/inference/generate.rs:107-201）は、`prompt: &str` をそのままトークン化してモデルに入力する。思考モードのON/OFFに相当するAPIパラメータは存在しない。モデルの挙動変化はプロンプトの内容・形式にのみ依存する。

### 証拠5: モデル対応状況

`resolve_model_config()`（test-chat.rs:163-171 / test-run.rs:248-259）は4モデル対応：

| モデル名 | 設定関数 | 備考 |
|---------|---------|------|
| `gemma4-e2b` | `ModelConfig::gemma4_e2b()` | デフォルトレコメンド |
| `gemma4-e4b` | `ModelConfig::gemma4_e4b()` | |
| `qwen3.5-0.8b` | `ModelConfig::qwen3_5_0_8b()` | README 曰く llama-cpp-2 でのみ動作 |
| `qwen3.5-2b` | `ModelConfig::qwen3_5_2b()` | |

## Test Plan

### ユニットテスト計画

テスト対象: `src/bin/test-oneshot.rs` 内の純粋関数

| # | テストケース | 正常/異常/境界 | 内容 |
|---|------------|--------------|------|
| 1 | `resolve_model_config()` 全4モデル（大文字小文字 insensitive） | 正常 | 各モデル名が正しい `ModelConfig` を返す |
| 2 | `resolve_model_config()` 未知のモデル名 | 異常 | `None` を返す |
| 3 | `resolve_model_config()` 空文字 | 異常 | `None` を返す |
| 4 | プロンプト組み立て: システムプロンプトあり | 正常 | `System: ...\n\nUser: ...\n\nAssistant: ` 形式 |
| 5 | プロンプト組み立て: システムプロンプトなし | 正常 | `User: ...\n\nAssistant: ` 形式（test-chat 互換） |
| 6 | プロンプト組み立て: 空システムプロンプト | 境界 | システムプロンプトなし扱い |
| 7 | プロンプト組み立て: 思考モードON + システムプロンプトあり | 正常 | システムプロンプト先頭に指示文挿入 |
| 8 | プロンプト組み立て: 思考モードON + システムプロンプトなし | 正常 | システムプロンプトとして指示文のみ設定 |
| 9 | プロンプト組み立て: 思考モードOFF | 正常 | システムプロンプトに追加の指示文なし |
| 10 | CLI引数パース: 全引数指定 | 正常 | 各フィールドが正しく設定される |
| 11 | CLI引数パース: `--model` のみ指定（必須不足） | 異常 | エラーメッセージ出力して終了 |
| 12 | CLI引数パース: `--help` | 正常 | ヘルプ表示して終了 |
| 13 | CLI引数パース: 不正な `--temperature` 値 | 異常 | パースエラー |
| 14 | CLI引数パース: パース結果表示用の文字列整形 | 正常 | 設定値の一覧表示が正しい形式 |

カバレッジ目標: 80%以上（純粋関数は100%）

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 実モデルをロードしての推論実行 | GGUFモデルファイル（~500MB〜1.2GB）が必要。オフライン環境やCIでは実行不可。手動テストとして実施。 |
| 2 | 思考モードON/OFFによる実際の応答変化の検証 | モデルの振る舞いに依存。ユニットテストではプロンプト書式のみ検証し、実際の応答差は目視確認。 |

## Boy Scout Rule — 翻訳可能性計画

### 新規作成ファイル: `src/bin/test-oneshot.rs`

以下の設計原則に従い、翻訳可能性を確保する：

1. **関数は動詞句**: `build_prompt()` / `parse_cli_args()` / `resolve_model_config()` / `run_inference()` / `display_result()` — 関数呼び出しの並びが処理の流れを物語る
2. **一関数一責務**: CLIパース、プロンプト構築、推論実行、結果表示をそれぞれ独立した関数に分離
3. **ハードコード値は名前付き定数**: `DEFAULT_TEMPERATURE`, `DEFAULT_MAX_TOKENS`, `THINKING_INSTRUCTION` 等を定数化
4. **エラーの握りつぶし禁止**: すべての `Result` は `?` 演算子で伝播。`unwrap()` はテストコードと `--help` の早期終了のみ

### 既存コードへの影響

- `Cargo.toml`: `[[bin]]` エントリ追加のみ。最小差分。
- `src/bin/test-chat.rs` / `src/bin/test-run.rs`: 変更なし。

## Acceptance Criteria

- [ ] `cargo run --bin test-oneshot -- --model gemma4-e2b --prompt "こんにちは"` で推論結果が表示される
- [ ] `--system-prompt "You are a helpful assistant" --thinking` でシステムプロンプトが反映される
- [ ] `--no-thinking`（デフォルト）で思考モードOFFのプロンプト書式になる
- [ ] `--thinking` でシステムプロンプトに思考指示文が挿入される
- [ ] `--model qwen3.5-0.8b` でQwen3.5-0.8Bモデルが選択される
- [ ] 必須引数 `--model` / `--prompt` 未指定時にエラーメッセージを表示して終了する
- [ ] `--help` / `-h` で使用方法が表示される
- [ ] `cargo test --bin test-oneshot` で全ユニットテストが通過する
- [ ] `cargo test`（既存テスト）に影響を与えない
- [ ] 結果表示にタイムスタンプ、文字数、推定トークン数、処理時間、トークン/秒が含まれる

## Notes

- **チケットID**: PX-1
- **依存チケット**: なし（独立フェーズ）
- **関連バイナリ**: test-chat（対話モード + ストリーミング）、test-run（3パターン自動検証）
- **plan**: `/plan-ticket PX-1` で実装計画を策定可能
- **start**: `/start-ticket PX-1` で実装を開始可能

<!--
注: このコメントは人間向けの説明である。

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testVerification, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

詳細は Tickets.json の該当チケットフィールドを参照すること。
-->

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
