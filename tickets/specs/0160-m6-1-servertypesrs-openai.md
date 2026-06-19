---
ticket_id: 160
title: M6-1: server/types.rs 新規作成 — OpenAI 互換型自前定義
slug: m6-1-servertypesrs-openai
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0160-m6-1-servertypesrs-openai/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0160-m6-1-servertypesrs-openai/review.md
---
# M6-1: server/types.rs 新規作成 — OpenAI 互換型自前定義

## Summary

`server/types.rs` を新規作成し、OpenAI Chat Completion API に準拠したリクエスト/レスポンス/SSEチャンクの3構造体群を自前定義する。併せて `server/mod.rs` に `pub mod types;` を追加して公開する。この段階では型定義とシリアライズ/デシリアライズの検証のみを行い、ハンドラでの使用は後続チケット M6-9 に委ねる。

## Background

mistralrs は `ChatCompletionRequest` / `ChatCompletionResponse` 等の OpenAI 互換型をクレート内部で提供していた。llama-cpp-2 移行後はこれらの型が利用できなくなるため、自前で同等の型を定義する必要がある。フェーズFの最初のチケットとして、孤立した型定義（外部依存なし）から着手することで、後続の全チケットが使用する基盤型を早期に確定する。

**設計決定**: Q11/Q20 で確認済み。OpenAI API 仕様に準拠した全標準フィールドを実装する。

## Scope

- `server/types.rs` を新規作成し、以下の9構造体を定義する（全フィールドは RFC §6.2 に基づく）：
  - `ChatCompletionRequest` — model, messages, temperature, top_p, max_tokens, stream, presence_penalty, frequency_penalty, stop
  - `ChatMessage` — role, content
  - `ChatCompletionResponse` — id, object, created, model, choices, usage
  - `ChatResponseMessage` — role, content
  - `Choice` — index, message, finish_reason
  - `Usage` — prompt_tokens, completion_tokens, total_tokens
  - `ChatCompletionChunk` — id, object, created, model, choices
  - `ChunkChoice` — index, delta, finish_reason
  - `Delta` — role, content
- 全構造体に `#[derive(Debug, Clone, Serialize, Deserialize)]` を付与
- `server/mod.rs` に `pub mod types;` を追加
- ファイル末尾に `#[cfg(test)] mod tests` でシリアライズ/デシリアライズのラウンドトリップテストを実装

## Non-scope

- サーバーハンドラ（openai.rs / router.rs）の修正は **M6-9** で行う
- エラー型の修正（`MistralrsError` → `LlamaCppError`）は **M6-2** で行う
- lib.rs の re-export 追加は **M6-10** で行う
- 現状の openai.rs が mistralrs 型をインポートしている状態は変更しない（M6-9 で一括置き換え）

## Investigation

**サーバーモジュールの現状**（`crates/ggufrs/src/server/mod.rs` 行1-12）:
- 現在のモジュール構造: `pub mod openai; pub mod router;` — `types` モジュールは未存在
- `pub use` は `router::{build_router, AppError, AppState}` のみ

**既存の mistralrs 型使用箇所**（本チケットでは修正しないが現状把握）:
- `openai.rs` 行18: `use mistralrs::{ChatCompletionResponse, RequestBuilder, Response, TextMessageRole, TextMessages};`
- `openai.rs` 行69-80: `openai_chat_handler` が `ChatCompletionResponse` を戻り値に使用
- `router.rs` 行80（テスト内）: `use mistralrs::{ChatCompletionResponse, Choice, Response, ResponseMessage, Usage};`

**依存関係の確認**（`crates/ggufrs/Cargo.toml`）:
- `serde = { version = "1", features = ["derive"] }` ✅ — Serialize/Deserialize 導出に必要な feature が既に有効
- `serde_json = "1"` ✅ — テストでの JSON シリアライズ/デシリアライズに使用
- 新規依存クレートの追加は不要。既存の serde + serde_json で完結する。

**スタブの確認**:
- `find-all-stubs.js` の結果: ggufrs/src 配下のスタブは `settings.rs` 行19 の `[::STUB::] dead_code 抑制の理由` のみ — 本チケットに関係なし。

**RFC の型定義**（`crates/ggufrs/RFC.md` 行961-1037）:
- 全9構造体のフィールド定義は RFC に完備。これをそのままコードに落とす。
- 特記: `ChatCompletionRequest` の `stop` フィールドは `Option<Vec<String>>` 型（セクション区切り文字列の配列）。

## Test Plan

### ユニットテスト計画

**対象**: `server/types.rs` 内の `#[cfg(test)] mod tests`

全テストは外部依存なし・メモリ内完結・ミリ秒単位で完了する。Mock/Stub は不要。

| # | カテゴリ | ケース | 検証内容 |
|---|---------|--------|---------|
| 1 | 正常系 | ChatCompletionRequest ラウンドトリップ | 最小構成（model + messages のみ）の JSON をデシリアライズ → 再シリアライズして値が一致する |
| 2 | 正常系 | ChatCompletionRequest 全フィールド | 全 Optional フィールドを含む JSON をデシリアライズ → 各フィールドの値が正しい |
| 3 | 正常系 | ChatCompletionResponse ラウンドトリップ | OpenAI 形式のレスポンス JSON をデシリアライズ → 再シリアライズして値が一致する |
| 4 | 正常系 | ChatCompletionChunk ラウンドトリップ | SSE チャンク JSON をデシリアライズ → 再シリアライズして値が一致する |
| 5 | 正常系 | Choice の finish_reason 確認 | `finish_reason: "stop"` の JSON が正しくデシリアライズされる |
| 6 | 正常系 | Usage のトークン数確認 | Usage の各トークン数（prompt/completion/total）が正しくデシリアライズされる |
| 7 | 正常系 | Delta の内容確認 | role と content が Optional として正しくデシリアライズされる |
| 8 | 異常系 | 必須フィールド欠落 | `messages` がないリクエスト → デシリアライズ失敗する |
| 9 | 異常系 | 不正な JSON | 空文字列や配列など構造体と型が合わない JSON → デシリアライズ失敗する |
| 10 | 境界値 | 空配列 messages | `messages: []` のリクエストがデシリアライズ可能（空配列は許可） |
| 11 | 境界値 | 全オプションフィールド省略 | model, temperature 等の Option フィールドが全て `None` になることを確認 |
| 12 | 境界値 | 最大値トークン数 | `max_tokens: 0` がデシリアライズ可能（0は「制限なし」の意味として許可） |

**カバレッジ目標**: 90% 以上（型定義のみのファイルであり、ほぼ全フィールドがテスト網羅可能）

### ユニットテスト不可能な項目（例外）

なし。型定義とシリアライズ/デシリアライズの検証は全項目がユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

**スコープ内（server/types.rs 新規作成）**:
- 構造体名・フィールド名は OpenAI API 仕様の用語をそのまま使用する（`ChatCompletionRequest`, `messages`, `choices` 等）— これらは業界標準のドメイン用語であり、翻訳可能性を損なわない
- フィールドの doc コメントは「なぜこのフィールドが Optional か」「API 仕様上の振る舞い」を日本語で説明する
- テスト関数名は `test_` 接頭辞 + 動作内容の動詞句（例: `test_roundtrip_request_minimal`, `test_rejects_missing_messages`）

**スコープ外（server/mod.rs）**:
- `server/mod.rs` 行6-7 の doc コメントに旧チケット番号（`M4-1 で...実装済み。M4-2 で...実装済み。`）が残っている。これは保守性を損なうため、より永続的な説明に書き換える。ただし `pub mod types;` の1行追加時に合わせて行う。

## Acceptance Criteria

- [ ] 9構造体すべてが `server/types.rs` に定義され、`#[derive(Serialize, Deserialize)]` が付与されている
- [ ] `server/mod.rs` に `pub mod types;` が追加され、`cargo check` が通る
- [ ] 全12テストケースが通過する（`cargo test --lib server::types`)
- [ ] 既存テストに影響を与えない（`cargo test` 全通過）
- [ ] 翻訳可能性の検証が通っている（関数名が動詞句、変数名がドメイン概念）

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0160-m6-1-servertypesrs-openai/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0160-m6-1-servertypesrs-openai/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0160-m6-1-servertypesrs-openai/review.md（未作成、/review-ticket 全チェック通過後に作成）
