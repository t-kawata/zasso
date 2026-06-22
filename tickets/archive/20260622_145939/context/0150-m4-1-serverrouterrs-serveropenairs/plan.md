# M4-1 実装計画

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/server/router.rs` | 新規 | AppState/AppError 型エイリアス、From<GgufError>、build_router()、全テスト |
| `crates/ggufrs/src/server/openai.rs` | 新規 | openai_chat_handler、list_models_handler、anthropic_messages_handler |
| `crates/ggufrs/src/server/mod.rs` | 編集 | 子モジュール宣言 + 再公開、M4-1 STUB 削除 |
| `crates/ggufrs/src/lib.rs` | 編集 | pub mod server の STUB コメント削除 |

## 実装手順
1. server/router.rs 作成（型エイリアス、エラー変換、ルーター構築関数、テスト）
2. server/openai.rs 作成（3ハンドラ）
3. server/mod.rs 更新（子モジュール宣言 + 再公開）
4. lib.rs STUB コメント削除

## 物理的レビュー方法
make check-be → make test → cargo fmt --check → cargo clippy → スタブ未解決確認

## 発見事項
- ChatCompletionRequest 型は mistralrs v0.8.1 に存在しない → ハンドラは Json<serde_json::Value> を受信し、TextMessages を手動構築
- RequestBuilder::from(TextMessages) で変換
