---
ticket_id: 189
title: server/openai.rs + router.rs 修正 — 自前型 + Anthropic 削除
slug: serveropenairs-routerrs-anthropic
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0189-serveropenairs-routerrs-anthropic/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0189-serveropenairs-routerrs-anthropic/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0189-serveropenairs-routerrs-anthropic/review.md
---

# M6-9: server/openai.rs + router.rs 修正 — 自前型 + Anthropic 削除

- **フェーズ**: M6-3（Layer 3 — サーバー層置き換え）
- **参照設計書**: `crates/ggufrs/RFC.md`（§6.1 アーキテクチャ, §6.3 ルーター）

---

## 依存・関連チケット

| 関係 | チケット | 内容 | 状態 |
|------|---------|------|------|
| 先行必須 | M6-1 | `server/types.rs` 自前型定義 | ✅ 完了 |
| 先行必須 | M6-5 | `InferenceEngine` トレイト3メソッド化（send_raw 削除） | ✅ 完了 |
| 先行必須 | M6-8 | `inference/raw.rs` 削除 | ✅ 完了 |
| 関連 | M6-11 | 依存差し替え（mistralrs → llama-cpp-2） | 未着手 |
| 関連 | M6-12 | テストコード修正 | 未着手 |

**循環依存**: なし。

---

## Summary

`server/openai.rs` と `server/router.rs` を修正し、以下を達成する：

1. OpenAI 互換ハンドラを mistralrs 依存の仮置きから、自前型（`server::types`）+ `InferenceEngine` トレイトの `generate`/`generate_stream` を使用する本実装に置き換える
2. Anthropic 互換ハンドラ（`anthropic_messages_handler`）と関連ルート・テストを完全削除する
3. `send_raw` の参照をコード・コメント・テスト関数名から完全抹消する
4. ルーターのテストをスタブ（500確認のみ）から実際の正常系・異常系検証に書き換える

---

## Background

### 目的

M5 以前のサーバー実装は mistralrs の型に直接依存し、かつ Anthropic 互換エンドポイントを含んでいた。M6 シリーズでは以下の方針でサーバー層を置き換える：

1. **自前型への全面移行**: M6-1 で定義した `server::types::ChatCompletionRequest` / `ChatCompletionResponse` / `ChatCompletionChunk` を使用する
2. **Anthropic 完全削除**: llama-cpp-2 バックエンドでは Anthropic 互換を提供しない
3. **send_raw 完全抹消**: M6-5 で InferenceEngine から send_raw が削除済み。ハンドラは `generate()` / `generate_stream()` のみを使用する
4. **単一 handler への統合**: stream フィールドで分岐する単一 `chat_completions_handler` に統合する（RFC §6.3 の設計に準拠）

### 現状

**server/openai.rs**:
- `openai_chat_handler`: 全ハンドラ仮置き（`Err(Unsupported)` を返すスタブ）
- `anthropic_messages_handler`: Anthropic 互換ハンドラ（仮置き、削除予定）
- `list_models_handler`: 正常動作中（4モデルのハードコード一覧）
- `parse_messages` / `extract_chat_response`: mistralrs 型を使用するデッドコード
- `use mistralrs::{...}`: `#[allow(unused_imports)]` 付きで残存
- 戻り値型: mistralrs 版 `ChatCompletionResponse` を使用

**server/router.rs**:
- `build_router`: Anthropic ルート（`/anthropic/v1/messages`）を含む
- `AppState`, `AppError`, `From<GgufError>`: 適切に実装済み
- テスト: 全13関数中 6 つが STUB、2 つが Anthropic 関連（削除予定）

**send_raw 参照**: server/ 配下に 9 箇所のコメント参照のみ。コード呼び出しは存在しない。
**MistralrsError 参照**: server/ 配下に 0 箇所。
**唯一の mistralrs コード参照**: テストの `llama_cpp_error_returns_500` 内の `mistralrs::error::Error::ModelLoad` — M6-11 で対応するため、本チケットではテストごと削除する。

---

## Investigation

### ファイル別調査結果

**server/openai.rs**（120行）:
- モジュールドキュメントに「Anthropic 互換」の記述あり → 削除
- `parse_messages()`: mistralrs 型依存、dead_code → `build_prompt_from_messages` に置き換えて削除
- `extract_chat_response()`: mistralrs 型依存、dead_code → 削除
- `openai_chat_handler`: 戻り値が mistralrs 版 `ChatCompletionResponse` → 自前型に変更
- `anthropic_messages_handler`: 関数全体 → 削除
- `list_models_handler`: 4モデルハードコード → 維持（変更不要）

**server/router.rs**（369行）:
- `build_router`: Anthropic ルート → 削除
- テスト: スタブ多数（詳細は本spec内「スタブ状況」参照）
- `mock_app_state()`: 正常系・エラー系でテストごとに expectation を分ける必要あり

### スタブ状況（14箇所、M6-9 / M6-11 タグ付き）

本チケットで解決するスタブ（12箇所）:
- openai.rs L16, L27, L51, L73, L108
- router.rs L80, L155, L252, L270, L274, L323, L347, L351

M6-11 に先送りするスタブ:
- router.rs L132: `mistralrs::error::Error::ModelLoad` — テストごと削除して本チケットで解決しない

---

## Scope

### 実装範囲

**server/openai.rs — 全面的書き換え**:

1. **ハンドラ関数の統合**: `openai_chat_handler` → `chat_completions_handler`（stream フィールド分岐）
2. **非ストリーミングヘルパー**: `chat_completions_sync` 新規作成
3. **ストリーミングヘルパー**: `stream_chat_completions` 新規作成（SSE 形式）
4. **メッセージ変換**: `build_prompt_from_messages` 新規作成（`ChatMessage` 配列 → 単一プロンプト文字列）
5. **削除**: `anthropic_messages_handler`, `parse_messages`, `extract_chat_response`, `use mistralrs::{...}`

**server/router.rs — 修正**:
1. Anthropic ルート削除
2. テストコード全面的書き換え（スタブ解消）
3. コメント整理

### 非スコープ

- `list_models_handler` の動的モデル一覧取得（後続チケット）
- `uuid` クレートの依存追加判断（M6-11 で対応。本チケットでは簡易 ID 生成で回避）
- `llama_cpp_error_returns_500` テスト内の `mistralrs::error::Error` 修正（M6-11 で対応）
- `server/types.rs` の型定義追加（M6-1 完了済み）
- `server/mod.rs` のモジュール宣言（既に完了）

---

## Test Plan

### ユニットテスト計画

**openai.rs に追加するテスト**:
| # | テスト名 | 種別 | 正常/異常 | 内容 |
|---|---------|------|-----------|------|
| 1 | `build_prompt_joins_single_message` | unit | 正常 | 単一メッセージ → role: content 形式 |
| 2 | `build_prompt_joins_multiple_messages` | unit | 正常 | 複数メッセージ → \n 結合 |
| 3 | `build_prompt_handles_empty_messages` | unit | 境界 | 空配列 → 空文字列 |

**router.rs の既存テスト修正・追加**:
| # | テスト名 | 種別 | 内容 |
|---|---------|------|------|
| 4 | `chat_completions_non_stream_returns_200` | integration | MockEngine で generate 成功 → 200 + レスポンス検証 |
| 5 | `chat_completions_stream_returns_sse` | integration | MockEngine で generate_stream 成功 → SSE Content-Type 確認 |
| 6 | `chat_completions_returns_500_on_error` | integration | MockEngine で generate エラー → 500 |
| 7 | `anthropic_endpoint_returns_404` | integration | POST /anthropic/v1/messages → 404 |
| 8 | `openai_handler_returns_chat_completion` | integration | 正常系：リクエスト→200 + ChatCompletionResponse JSON |
| 9 | `openai_handler_returns_error_on_generate_failure` | integration | 異常系：generate エラー → 500（関数名は `send_raw` → `generate` に変更） |

**現状維持のテスト**（変更不要）:
- `model_not_found_returns_404`, `inference_failed_returns_500`, `invalid_config_returns_400`,
  `model_load_failed_returns_500`, `server_startup_failed_returns_500`,
  `app_error_contains_error_field`, `get_models_returns_200`, `unknown_path_returns_404`,
  `wrong_method_returns_405`, `list_models_returns_valid_json`

**本チケットで削除するテスト**:
- `post_anthropic_messages_returns_200_or_400`（ルート削除につき不要）
- `anthropic_handler_returns_anthropic_format`（Anthropic 削除）
- `anthropic_handler_empty_body_returns_400`（同上）
- `llama_cpp_error_returns_500`（`mistralrs::error::Error` 依存のため削除。M6-11 で再実装）
- `openai_handler_returns_error_on_send_raw_failure`（関数名変更 + 再実装して削除相当）

### MockEngine 設定方針

```rust
// 正常系ヘルパー（mock_state_with_success）
fn mock_state_with_success(response_text: &str) -> AppState {
    let mut mock = MockEngine::new();
    mock.expect_generate()
        .returning(move |_, _, _| Ok(response_text.to_string()));
    Arc::new(mock)
}

// エラー系ヘルパー（mock_state_with_error）
fn mock_state_with_error() -> AppState {
    let mut mock = MockEngine::new();
    mock.expect_generate()
        .returning(|_, _, _| {
            Err(GgufError::InferenceFailed(Box::new(std::io::Error::other("inference failed"))))
        });
    Arc::new(mock)
}
```

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| SSE ストリーミングの実ブラウザ互換性 | 実際の HTTP Client 動作は確認できるが、ブラウザの EventSource API との互換性は目視確認が必要 |

---

## 対象不変条件 / 規範

1. `chat_completions_handler` は stream フィールドで分岐する単一ハンドラとする（RFC §6.3）
2. `anthropic_messages_handler` は完全削除 — コメントアウトや `#[cfg(...)]` での隠蔽は禁止
3. `send_raw` の参照を一切残さない（コード・コメント・テスト関数名すべて）
4. `mistralrs` の型をハンドラの戻り値型・引数型として使用しない
5. `AppError`, `AppState`, `From<GgufError>` は現状維持

---

## Acceptance Criteria

- [ ] `chat_completions_handler` が stream=false で 200 + ChatCompletionResponse JSON を返す
- [ ] `chat_completions_handler` が stream=true で SSE（text/event-stream）を返す
- [ ] POST `/anthropic/v1/messages` が 404 を返す（ルート不在）
- [ ] `grep -rn 'send_raw' src/server/` が空（send_raw 完全抹消）
- [ ] `grep -rn 'anthropic\|Anthropic\|mistralrs' src/server/` が空（外部依存抹消）
- [ ] すべての既存テストが通過する
- [ ] MistralrsError に関連するテスト（`llama_cpp_error_returns_500`）は本チケットで削除しており、残存しない
- [ ] スタブ12箇所の `[::STUB::]` マーカーが削除されている（M6-11 タグの2箇所のみ残存）

## Boy Scout Rule — 翻訳可能性計画

1. **関数名の明確化**: `openai_chat_handler` → `chat_completions_handler`
2. **単一責務の徹底**:
   - `chat_completions_handler`: 分岐のみ
   - `chat_completions_sync`: 非ストリーミング
   - `stream_chat_completions`: ストリーミング
   - `build_prompt_from_messages`: メッセージ→プロンプト変換
3. **エラー握りつぶし禁止**: `unwrap_or_default()` は真に unreachable な箇所のみ使用

## Notes

### 成果物

- 計画: `context/0189-serveropenairs-routerrs-anthropic/plan.md`（未作成）
- 実装サマリ: `context/0189-serveropenairs-routerrs-anthropic/implementation.md`（未作成）
- レビュー報告書: `context/0189-serveropenairs-routerrs-anthropic/review.md`（未作成）
