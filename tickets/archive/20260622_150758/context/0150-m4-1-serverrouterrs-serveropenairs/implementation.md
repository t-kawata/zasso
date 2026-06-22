# M4-1 実装サマリ

## 変更概要
server モジュールに Axum ルーター + OpenAI/Anthropic 互換ハンドラを実装した。

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/server/router.rs` | 新規 | AppState/AppError 型エイリアス、From<GgufError>（6バリアント→HTTP ステータス）、build_router()、全テスト（20ケース） |
| `src/server/openai.rs` | 新規 | openai_chat_handler（POST /v1/chat/completions）、list_models_handler（GET /v1/models）、anthropic_messages_handler（POST /anthropic/v1/messages with llm-bridge-core transform） |
| `src/server/mod.rs` | 編集 | 子モジュール宣言（router, openai）+ pub use 再公開、M4-1 STUB 削除 |
| `src/lib.rs` | 編集 | pub mod server の STUB コメント削除 |
| `src/inference/mod.rs` | 編集 | tests モジュールを pub(crate) に変更（MockEngine を他モジュールから利用可能に） |
| `Cargo.toml` | 編集 | dev-dependencies に tower = "0.5" 追加 |

## 重要な発見事項

- `ChatCompletionRequest` 型は mistralrs v0.8.1 に存在しない → ハンドラは `Json<serde_json::Value>` を受け取り、TextMessages を手動構築
- `llm-bridge-core` v0.2.6 の transform API は `TransformRequest`（header/path/body bytes）を取る設計 → anthropic_to_openai() と openai_response_to_anthropic_message() を使用
- Response 列挙型（mistralrs_core）は 8バリアント → Done から ChatCompletionResponse を取り出す

## テスト結果
- 全153テスト通過（既存133 + 新規20）
- 新規テスト内訳: AppError 変換7ケース、ルーティング4ケース、OpenAI ハンドラ2ケース、モデル一覧1ケース、Anthropic ハンドラ3ケース、エッジケース3ケース
- cargo check --all-targets: 警告0
- cargo fmt: フォーマット済み
