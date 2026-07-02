---
ticket_id: 2
title: enable_thinking: 推論パイプラインの思考モード制御
slug: enable-thinking
status: draft
created_at: 2026-07-02
updated_at: 2026-07-02
---
# enable_thinking: 推論パイプラインの思考モード制御

## Summary

`GenerateParams` に `enable_thinking` フィールドを追加し、推論パイプライン（`InferenceParams` → `run_inference_blocking`）を通じてモデルの思考モードを制御する。
`test-oneshot` の `--thinking`/`--no-thinking` フラグはプロンプトレベル操作ではなく、このパラメータを介して制御するように変更する。

## Background

PX-1 で `test-oneshot` に `--thinking`/`--no-thinking` フラグを追加したが、実装は**プロンプトレベル**（英語の指示文をシステムプロンプトに挿入するのみ）であり、Qwen3.5 系モデルに対して確実に機能しなかった。

調査の結果、以下の事実が判明した：

1. Qwen3.5 の思考モード制御は**チャットテンプレート（Jinja）レベル**で行われる。`/think` / `/no_think` コマンドはチャットテンプレートが処理するものであり、生のプロンプト文字列として与えても単なるテキストとして扱われるだけで制御コマンドとしては機能しない。
2. `llama-cpp-2` v0.1.150 の Rust API には `enable_thinking` や思考制御に相当するパラメータは**一切存在しない**。この機能は C++ `common` ライブラリにしか実装されておらず、Rust FFI バインディングは未対応。
3. ただし `LlamaModel::apply_chat_template()` API は存在し、Qwen3.5 のビルトイン Jinja テンプレートを実行できる。この API に適切なメッセージ形式とパラメータを渡すことで、思考モード制御が可能になる可能性がある。

本チケットでは、API レベルでの思考モード制御を実現するための設計・実装を行う。

## Scope

1. **`GenerateParams` に `enable_thinking: Option<bool>` フィールド追加**
   - `src/inference/mod.rs` — 構造体定義 + Default + Clone + Debug
   - `enable_thinking` は `Option<bool>` 型（`None` = モデルデフォルト）

2. **`InferenceParams` に `enable_thinking: bool` フィールド追加 + `From<GenerateParams>` マッピング**
   - `src/inference/generate.rs` — 内部型への変換時に解決

3. **`run_inference_blocking()` での思考モード実装**
   - llama-cpp-2 の API 制約により、以下の方式を採用する：
     - プライマリ方式: `apply_chat_template()` を使用し、Qwen3.5 のビルトインチャットテンプレート経由で `enable_thinking` を反映
     - フォールバック方式: チャットテンプレート未対応モデル向けに、システムプロンプト先頭に `/think`/`/no_think` コマンドを挿入（現在の test-oneshot と同様の方式だが、InferenceParams の値に基づき推論エンジン側で自動実行）
   - プロンプト形式を `chat_template()` ベースに移行するか、現行のフラット形式に `/think`/`/no_think` を付与するかは実装計画で判断

4. **`test-oneshot` の `--thinking`/`--no-thinking` フラグの動作変更**
   - 現在: `build_prompt()` 内でシステムプロンプトに指示文を挿入
   - 変更後: `GenerateParams { enable_thinking: Some(true/false), .. }` を設定し、推論エンジンに制御を委譲
   - `build_prompt()` から思考モード関連ロジックを削除、純粋なプロンプト組み立て関数に戻す

5. **既存テストへの影響確認と更新**

## Non-scope

- **チャットテンプレートの完全移行**: 現行のフラットプロンプト形式（`"System: ...\n\nUser: ...\n\nAssistant: "`）をチャットテンプレートに完全置き換える作業は本チケットでは行わない。`apply_chat_template()` の導入はオプションとし、実装計画で判断する。
- **llama-cpp-2 のアップグレード / FFI バインディング追加**: C++ `common` ライブラリの Rust FFI を追加する作業は含めない。現行 v0.1.150 の API 範囲内で解決する。
- **ストリーミング時の思考タグ分離**: `<think>` タグの内容と最終回答を別々に出力する処理は含めない。
- **OpenAI / Anthropic 互換 API サーバーへの thinking パラメータ追加**: 別チケットで対応。

## Investigation

### 証拠1: test-oneshot のプロンプトレベル制御は無効（現実の動作）

test-oneshot の `--no-thinking`（デフォルト）で Qwen3.5-0.8B / 2B を実行すると、両モデルとも `<think>` タグ付きの思考プロセスを出力した。
`/no_think` コマンドをシステムプロンプトに挿入しても効果なし。以下の出力からモデルは `/no_think` を「制御コマンド」ではなく「思考抑制を指示するテキスト」として読んでいることが確認できる：

> `System Instruction: /no_think (This indicates I should not show my internal thought process...)`

### 証拠2: llama-cpp-2 Rust API に enable_thinking なし

`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/llama-cpp-2-0.1.150/` 全 `.rs` ファイルを grep した結果、"thinking" / "reasoning" / "enable_thinking" の出現は**ゼロ**。
存在するチャット関連 API：

- `LlamaModel::chat_template(name)` → モデルのビルトイン Jinja テンプレート文字列を取得
- `LlamaModel::apply_chat_template(tmpl, chat, add_ass)` → テンプレートをメッセージリストに適用し整形済み文字列を返す

### 証拠3: C++ common ライブラリは思考モード完全対応（ただし未公開）

`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/llama-cpp-sys-2-0.1.150/llama.cpp/common/`:

- `common.h:397-405`: `common_reasoning_format` enum（NONE / AUTO / DEEPSEEK_LEGACY / DEEPSEEK）
- `common.h:611-612`: `gparams.reasoning_format` / `gparams.enable_reasoning`
- `chat.h:200-201`: `common_chat_templates_inputs { reasoning_format, enable_thinking = true }`
- `chat.h:215-217`: `common_chat_params { supports_thinking, thinking_start_tag, thinking_end_tag }`
- `chat.h:289`: `common_chat_templates_support_enable_thinking()` 関数
- `chat.cpp:1800`: Qwen3.5 の思考タグ制御（`<think>` / `</think>`）
- `arg.cpp:3156-3167`: `--reasoning-format` / `--reasoning on|off|auto` CLI

これらの C++ API は Rust FFI では公開されていない。

### 証拠4: 現在の推論パイプラインは生トークン化を使用

`src/inference/generate.rs:107-201` `run_inference_blocking()`:

```rust
let tokens = model.str_to_token(prompt, AddBos::Always)?;
```

チャットテンプレートを経由せず、生のプロンプト文字列を直接トークン化している。これが `/think` コマンドが効かない根本原因。

### 証拠5: 現在の ModelConfig / GenerateParams に思考関連フィールドなし

- `src/config.rs:155-185`: `ModelConfig` — `name`, `model_path`, `lazy_load`, `context_size`, `gpu_layers`, `batch_size` のみ
- `src/inference/mod.rs:27-58`: `GenerateParams` — `temperature`, `max_tokens`, `top_p`, `presence_penalty`, `frequency_penalty` のみ
- `src/inference/generate.rs:50-54`: `InferenceParams` — `temperature`, `max_tokens`, `top_p` のみ

## Test Plan

### ユニットテスト計画

| # | テストケース | 分類 | 内容 |
|---|------------|------|------|
| 1 | `GenerateParams` の `enable_thinking` デフォルト | 正常 | `GenerateParams::default().enable_thinking` が `None` |
| 2 | `GenerateParams` の `enable_thinking` 設定 | 正常 | `Some(true)` / `Some(false)` が保持される |
| 3 | `InferenceParams` への変換: `None` → `false` | 境界 | `enable_thinking=None` からの変換で `false`（安全側） |
| 4 | `InferenceParams` への変換: `Some(true)` → `true` | 正常 | 値が正しく伝播 |
| 5 | `InferenceParams` への変換: `Some(false)` → `false` | 正常 | 値が正しく伝播 |
| 6 | `GenerateParams` の Clone で `enable_thinking` 保持 | 正常 | Clone 後も値が一致 |
| 7 | `GenerateParams` の Debug 出力に `enable_thinking` 含む | 正常 | デバッグ表示が readable |
| 8 | `test-oneshot` `build_prompt()`: 思考モード関連ロジック削除の確認 | 正常 | プロンプトに `/think` `/no_think` が含まれない |
| 9 | `test-oneshot` `parse_args()`: `--thinking` が `enable_thinking=true` に | 結合 | パース結果が正しく `GenerateParams` に反映 |
| 10 | 既存テスト回帰 | 正常 | `cargo test` 全件通過 |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 実モデルロード + 思考モードON/OFF の応答差 | GGUF モデルファイルが必要。CI 不可。手動テストで確認。 |

## Boy Scout Rule — 翻訳可能性計画

### 変更ファイル

1. **`src/inference/mod.rs`**: `GenerateParams` に `enable_thinking` フィールド追加時の日本語コメントを「なぜこのフィールドが必要か」を説明するものにする
2. **`src/inference/generate.rs`**: `InferenceParams` + `From` 実装の翻訳可能性確認。`presence_penalty` / `frequency_penalty` が `From<GenerateParams>` でドロップされている既存の問題は本チケットでは修正しない（スコープ外、別チケット候補）
3. **`src/bin/test-oneshot.rs`**: `build_prompt()` から思考モードロジックを削除し、純粋なプロンプト整形関数として簡略化。可読性向上

## Acceptance Criteria

- [ ] `GenerateParams` に `enable_thinking: Option<bool>` が追加されている
- [ ] `InferenceParams` に変換時に値が正しくマッピングされる
- [ ] `run_inference_blocking()` で `enable_thinking` の値に応じてプロンプトが変更される
- [ ] `test-oneshot` の `--thinking`/`--no-thinking` が `GenerateParams` 経由で推論エンジンに伝わる
- [ ] `build_prompt()` が純粋なプロンプト整形関数に戻っている
- [ ] `cargo test` 全件通過
- [ ] Qwen3.5-0.8B / Qwen3.5-2B で `--no-thinking`（デフォルト）が `<think>` を出力しない
- [ ] Qwen3.5-0.8B / Qwen3.5-2B で `--thinking` が思考プロセスを出力する

## Notes

- **チケットID**: PX-2
- **依存チケット**: PX-1（test-oneshot で使用するため完了済みであること）
- **関連情報**: PX-1 で `build_prompt()` に `/think` `/no_think` を入れる試みを行ったが、チャットテンプレート未経由のため無効だった。本チケットで根本解決する。
- **llama-cpp-2 の制約**: `enable_thinking` は Rust API に存在しない。実装方式は実装計画で具体化する（`apply_chat_template()` 経由 or フォールバックとしてのプロンプト操作）。
