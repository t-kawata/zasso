---
ticket_id: 191
title: M6-10: lib.rs 修正 — mistralrs re-export 削除 + server::types 追加
slug: librs-mistralrs-re-export-servertypes
status: reviewed
dependencies: 
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0191-librs-mistralrs-re-export-servertypes/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0191-librs-mistralrs-re-export-servertypes/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0191-librs-mistralrs-re-export-servertypes/review.md
---

# M6-10: lib.rs 修正 — mistralrs re-export 削除 + server::types 追加

## Summary

`lib.rs` に残存する `pub use mistralrs::{...}`（32-35行目）を全削除し、代わりに `pub use crate::server::types::{...}` を追加する。これにより、llama-cpp-2 移行後も `ggufrs::ChatCompletionRequest` 等の OpenAI 互換型が crate 利用者から直接アクセス可能になる。`mistralrs` および `llama-cpp-2`（将来追加予定の gbnf 関連型を含む）の型は一切 re-export しない。

## Background

フェーズF（llama-cpp-2 バックエンド移行）の完了に向け、lib.rs が唯一の入口として mistralrs の型を公開し続けている状態を解消する。

M6-1（ticket #160）で `server/types.rs` が作成され、OpenAI Chat Completion API 互換の型（`ChatCompletionRequest`、`ChatCompletionResponse`、`ChatCompletionChunk` 等）が自前定義された。これにより `pub use mistralrs::ChatCompletionResponse` 等の外部依存 re-export は不要となった。

また、M6-5 で `InferenceEngine` トレイトから `send_raw`（mistralrs `RequestBuilder` 依存）が削除され、M6-8（ticket #188）で `inference/raw.rs` が物理削除された。この時点で mistralrs の型を crate 公開APIとして維持する理由は完全に消失している。

本チケットはこの最終的な後片付けを行い、クレートの公開APIから mistralrs 依存を完全に排除する。

## Investigation

### 現状の lib.rs 該当箇所（32-35行目）

```rust
// mistralrs の主要型を crate 利用者に公開する
// ggufrs のみを依存関係に追加すれば mistralrs の型も利用可能
pub use mistralrs::{
    ChatCompletionResponse, Constraint, Model, RequestBuilder, SamplingParams,
    TextMessageRole, TextMessages,
};
```

削除対象の型と代替:

| 型 | mistralrs での用途 | 代替先 |
|---|---|---|
| `ChatCompletionResponse` | OpenAI 互換レスポンス | `server::types::ChatCompletionResponse` |
| `Constraint` | JSON Schema 拘束生成 | gbnf 統合で別途対応（M6-11 参照） |
| `Model` | mistralrs 内部モデル型 | 非公開化 |
| `RequestBuilder` | mistralrs リクエストビルダー | llama-cpp-2 には存在しない |
| `SamplingParams` | mistralrs サンプリングパラメータ | llama-cpp-2 内部型（非公開） |
| `TextMessageRole` | メッセージ role 列挙型 | `ChatMessage::role`（String）で代替 |
| `TextMessages` | メッセージ配列型 | `Vec<ChatMessage>` で代替 |

### 追加する re-export

`server/types.rs` の全公開型から選択的に再公開する。必要な型: `ChatCompletionRequest`, `ChatCompletionResponse`, `ChatMessage`, `ChatResponseMessage`, `Choice`, `Usage`, `ChatCompletionChunk`, `ChunkChoice`, `Delta`。

### ファイルヘッダ更新

- 「mistralrs をバックエンドとして」→ 「複数のGGUF推論バックエンドに対応」など中立的記述に変更
- 「OpenAI/Anthropic 互換」→ 「OpenAI 互換」（Anthropic エンドポイントは M6-9 で削除）

### 犯罪の点検

`scan-crimes.sh`: 未解決の犯罪なし（対象ゼロ）。
`find-all-stubs.js`: 7件 — いずれも他チケット由来で本チケットスコープ外。新たなスタブは発生しない。

## Scope

### 実装範囲（In Scope）
- `lib.rs` 32-35行目: `pub use mistralrs::{...}` ブロックの全削除
- `lib.rs`: `pub use crate::server::types::{...}` の追加（選択的 re-export）
- `lib.rs` 冒頭: ドキュメントコメントの更新（mistralrs / Anthropic への言及を削除）
- `tests/ggufrs_api_check.rs`: 公開API確認の簡易テストファイル追加

### 非対象（Out of Scope）
- `Cargo.toml` の依存変更 / `build.rs` の変更（M6-11）
- `server/openai.rs` / `router.rs` の変更（M6-9、未チケット化）
- `inference/` 配下の修正（M6-5/M6-6/M6-7 で完了済み）
- `registry.rs` の修正（M6-4 で完了済み）
- gbnf 関連の型定義・feature flag（M6-11）

## Test Plan

### ユニットテスト計画

本チケットは新規ロジックを追加しないため、ユニットテストの新規追加は最小限とする:

1. **既存 lib.rs テストの通過確認**: `gguf_engine_*`, `drop_*`, `new_with_auto_start_*`, `shutdown_signal_is_callable` が全て通過すること
2. **公開API確認テスト（`cargo test` 級）**: 以下を `tests/ggufrs_api_check.rs` に記述
   - `use ggufrs::ChatCompletionRequest` が有効であることを確認（コンパイル確認、テスト本体は `assert!(true)`）
   - mistralrs の型が直接インポートできないことを TODO コメントで記述（コンパイルエラーの自動テストは `trybuild` 等が必要で過剰なため、確認方法をコメントに残す）

### ユニットテスト不可能な項目（例外）

- `use ggufrs::mistralrs::LlamaModel` がコンパイルエラーになることの自動検証: `trybuild` クレート未導入のため、手動で `cargo check` 時に確認する

## Acceptance Criteria

- [ ] `pub use mistralrs::{...}` が lib.rs から完全に除去されている
- [ ] `pub use crate::server::types::{ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ChatResponseMessage, Choice, Usage, ChatCompletionChunk, ChunkChoice, Delta};` が lib.rs に追加されている
- [ ] `use ggufrs::ChatCompletionRequest` がコンパイル可能
- [ ] mistralrs の型（例: `LlamaModel`）が直接インポートできず、コンパイルエラーになることを確認（手動）
- [ ] 全既存テスト通過（`cargo test --lib`）
- [ ] lib.rs 冒頭のドキュメントコメントが最新状態（mistralrs / Anthropic への直接言及なし）
- [ ] 新たな `[::STUB::]` を発生させていない

## 依存・関連チケット

| 関係 | ID | タイトル | ステータス |
|------|-----|---------|----------|
| 先行実装必須 | #160 | M6-1: server/types.rs 新規作成 | reviewed |
| 先行実装必須 | #188 | M6-8: inference/raw.rs 削除 | reviewed |
| 先行完了済み | M6-5 | InferenceEngine トレイト3メソッド化 | ✅ 完了 |
| 先行（未チケット化） | M6-9 | server/openai.rs + router.rs 修正 | — |
| 後続（本チケット後に着手） | M6-11 | Cargo.toml + build.rs 修正 | 未作成 |
| 後続 | #190 | M6-12: テストコード修正 | draft |

## Boy Scout Rule — 翻訳可能性計画

1. **`pub use mistralrs::{...}` → `pub use server::types::{...}`**: 型名が汎用的（`Model`, `Response`, `Constraint`）からドメイン概念を正確に表現する名前に置き換わる。`ChatCompletionRequest`, `ChatCompletionResponse` は「何をするための型か」が型名から読み取れる。
2. **ドキュメントコメント更新**: 「mistralrs をバックエンドとして」→ 中立的説明に変更し、バックエンド差し替え可能性をコードコメントからも読み取れるようにする。
3. **マジックナンバー・ハードコード値**: 現状該当なし。

## Notes

### 成果物
- 計画: `context/0191-librs-mistralrs-re-export-servertypes/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0191-librs-mistralrs-re-export-servertypes/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0191-librs-mistralrs-re-export-servertypes/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
