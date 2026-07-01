---
ticket_id: 2
title: llm-bridge-core v0.3.0 更新と互換性検証
slug: llm-bridge-core-v030
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
parent_omission: O-006
---

# llm-bridge-core v0.3.0 更新と互換性検証

## Summary

`Cargo.toml` の `llm-bridge-core` 依存を v0.2.6 → v0.3.0 に更新する。v0.3.0 は Rust 2024 Edition 対応の minor bump（breaking change の可能性あり）であり、更新後も既存コードのコンパイル・全テストがパスすることを検証する。合わせて v0.3.0 に `TransformResult` API が存在するか調査し、RFC §6.3 の設計への影響を評価する。

## Background

**親 RFC**: RFC-OMISSIONS-001.md §6（O-006, N5）
**親 RFC 該当セクション**: §1.1（依存関係管理方針）, §6.2（lossy-tolerant 変換 API 要件）

llm-bridge-core は anthropx の translate mode におけるプロトコル変換（Anthropic ↔ OpenAI 間のリクエスト/レスポンス変換）のコアライブラリである。2026-06-26 に v0.3.0 がリリースされ、Rust 2024 Edition 対応が行われた。

現在 v0.2.6 に固定されており、以下 2 つの理由から v0.3.0 への更新が必要：

1. **Rust 2024 Edition 移行の事前準備**: v0.3.0 は Rust 2024 Edition 対応版である。anthropx 側の edition 移行計画（RFC §F.5）の前に v0.3.0 に更新しておくことで、移行時の変更範囲を小さくできる。
2. **TransformResult API の確認**: RFC §6.3 では独自の lossy-tolerant 変換実装（`scan_anthropic_request()`）を現在使用している。v0.3.0 で `TransformResult` または同等の lossy 検出 API が提供されていれば、RFC §6.3 の設計を見直す機会となる。

v0.2.6 → v0.3.0 は minor bump であり、原則として breaking change を含む可能性がある。具体的には以下が変更されている可能性がある：
- パブリック API の関数シグネチャ変更
- 型名・モジュールパスの変更
- `TransformError` variant の追加・削除
- `anthropic_to_openai()` / `openai_response_to_anthropic_message()` のシグネチャ変更
- `transform_stream_events()` / `events_to_sse()` の変更

## Scope

**スコープ内:**
- `Cargo.toml`: `llm-bridge-core = { version = "0.2.6", ... }` → `"0.3.0"` への更新
- `cargo check --features server` が通ることの検証
- `cargo check`（server feature なし）が通ることの検証
- `cargo test --features server` 全パスの確認
- `cargo clippy -- -D warnings` が通ることの確認
- v0.3.0 における `TransformResult` API の有無調査（ソースコード・ドキュメントの確認）
- breaking change が発見された場合の修正（最小限）

**スコープ外:**
- `scan_anthropic_request()` の `TransformResult` API への全面移行（TransformResult が存在する場合の設計検討は RFC §6.3 で別途対応）
- Rust 2024 Edition への anthropx 側の移行作業（RFC §F.5 で別途対応）
- llm-bridge-core 以外の依存関係の更新
- テストコード以外の新規機能追加

## Investigation

### 現状の使用箇所（2026-07-01 時点）

llm-bridge-core v0.2.6 からのインポートは以下の 2 ファイルに存在する：

1. **`src/provider/translate.rs`**（29-36行目）
   - `llm_bridge_core::model::` → `ApiFormat`, `StreamState`, `TransformError`, `TransformRequest`
   - `llm_bridge_core::stream::` → `events_to_sse`, `transform_stream_events`
   - `llm_bridge_core::transform::` → `anthropic_to_openai`, `anthropic_to_openai_responses`, `openai_response_to_anthropic_message`, `responses_to_anthropic`

2. **`src/routing/mod.rs`**（16行目）
   - `llm_bridge_core::model::ApiFormat as LlmApiFormat`

### Cargo.toml の現状

```toml
# 25行目
llm-bridge-core = { version = "0.2.6", optional = true }

# 38行目（features.server）
server = ["dep:axum", ..., "dep:llm-bridge-core", ...]
```

### 更新手順の確認

`cargo add llm-bridge-core@0.3.0` を実行すると、`Cargo.toml` の該当行が自動更新される。その後 `cargo check --features server` でコンパイルエラーの有無を確認する。v0.2.6 から v0.3.0 への変更ログは `cargo update -p llm-bridge-core --dry-run` または llm-bridge-core の CHANGELOG で確認可能。

### TransformResult API 調査

RFC §6.3 で参照されている `TransformResult` API は、llm-bridge-core v0.2.6 の時点では存在しなかった。v0.3.0 で追加されたかどうかは以下で確認する：
- `llm-bridge-core::transform` モジュールの公開 API 一覧
- ドキュメントまたは CHANGELOG での言及

### リスク評価

1. **API シグネチャ変更**: minor bump のため、関数シグネチャの変更がある可能性が高い。特に `anthropic_to_openai()` と `transform_stream_events()` の引数・戻り値型の変更に注意。
2. **`TransformError` variant 変更**: `LossyDowngrade` variant が追加/削除/リネームされている可能性。
3. **モジュールパス変更**: モジュール再編がある可能性（低いが考慮）。
4. **feature flag 変更**: optional dependency としての feature 解決方法の変更。

## Test Plan

### ユニットテスト計画

| テストケース | 種別 | 内容 |
|-------------|------|------|
| `llm_bridge_core_v0_3_0_builds` | 正常系 | `--features server` で `cargo check` が通ることを確認 |
| `llm_bridge_core_v0_3_0_no_server_builds` | 正常系 | server feature なしで `cargo check` が通ることを確認 |
| `llm_bridge_core_v0_3_0_tests_pass` | 正常系 | `cargo test --features server` 全パス確認 |
| `llm_bridge_core_v0_3_0_clippy_clean` | 正常系 | `cargo clippy -- -D warnings` が通ることを確認 |
| `translate_non_stream_works_with_v0_3_0` | 回帰 | translate mode の non-stream リクエストが正しく変換されるか（既存テストの流用） |
| `translate_stream_works_with_v0_3_0` | 回帰 | translate mode の stream リクエストが正しく変換されるか（既存テストの流用） |

**外部依存**: llm-bridge-core v0.3.0 クレート（crates.io）。テストは Rust のビルド・テストツールチェインで完結するため、モックは不要。

**カバレッジ目標**: クリティカルパス（translate.rs, routing/mod.rs の llm-bridge-core 関連コード）は 100% カバレッジを維持。

### ユニットテスト不可能な項目（例外）

- **TransformResult API の存在確認**: テストコードでは確認不可能。`cargo doc --open` または CHANGELOG の確認、crates.io 上のドキュメント参照が必要。
- **v0.2.6 → v0.3.0 の CHANGELOG 差分**: 外部ドキュメント依存。`cargo update` の dry-run では検出できない API 変更の詳細確認は手動。
- **breaking change の影響範囲の全量特定**: コンパイルエラーで検出可能なものは `cargo check` で自動検出されるが、動作の変更（セマンティクスの変化）はテスト結果の目視確認が必要。

## Boy Scout Rule — 翻訳可能性計画

このチケットで触るコード範囲:

1. **`Cargo.toml`**: 依存関係のバージョン文字列のみ変更。翻訳可能性への影響なし。
2. **`src/provider/translate.rs`**: breaking change により API 呼び出し箇所の修正が必要な場合：
   - 関数呼び出しが「〇〇を変換し、□□に渡す」という散文として読めるよう、1行が長くなる場合は中間変数で段落を区切る
   - 新しい API の戻り値型が既存のエラー伝播パターンと異なる場合、`Result` を維持し `?` で伝播する（`unwrap()` 禁止）
   - `TransformResult` が存在する場合の処理追加時は、既存の `scan_anthropic_request()` の責務と混在させない
3. **`src/routing/mod.rs`**: 変更可能性は低いが、`ApiFormat` の型パスが変わった場合は修正のみで分割リファクタリングは行わない。

## Acceptance Criteria

- [ ] `cargo add llm-bridge-core@0.3.0` で依存関係が更新されている
- [ ] `Cargo.toml` の該当行が `llm-bridge-core = { version = "0.3.0", optional = true }` になっている
- [ ] `cargo check --features server` がパスする
- [ ] `cargo check`（server feature なし）がパスする
- [ ] `cargo test --features server` が全パスする
- [ ] `cargo clippy -- -D warnings` がパスする
- [ ] breaking change が発見された場合、最小限の修正のみで対応されている
- [ ] v0.3.0 における TransformResult API の有無が調査され、spec の Notes または tickets.json に記録されている
- [ ] TransformResult API が存在する場合、RFC §6.3 の設計への影響が評価されている
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している

## Notes

**依存関係:**
- 親チケット: O-006（RFC-OMISSIONS-001.md）
- 関連チケット: P0-1〜P2-2（すべて完了済み。P3-1 は RFC-OMISSIONS-001 の最終チケット）
- 関連 RFC: RFC-ROOT.md §6.2（lossy-tolerant 変換 API 要件）, §F.5（Edition 移行計画）

**TransformResult 調査結果:**
（実装時に記入）
- [ ] v0.3.0 の `llm-bridge-core::transform` モジュールに `TransformResult` または同等の lossy 検出 API は存在するか
- [ ] 存在する場合、`scan_anthropic_request()` の pre-scan 方式からライブラリ API 方式への移行は RFC §6.3 対応として別チケットで対応する

**実装指針:**
- `cargo add` コマンドを使用すること（`Cargo.toml` の直接編集禁止）
- breaking change の影響が大きい場合は、修正量に応じて別チケットとして分割する判断も可能
- commit 前に必ず `cargo fmt` を実行すること

### 成果物の保存先

各成果物は Tickets.json の該当チケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
