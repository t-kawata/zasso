# チケット #191 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/ggufrs/src/lib.rs | 修正 | mistralrs re-export 削除 + server::types re-export 追加 + ドキュメントコメント更新 |
| crates/ggufrs/tests/ggufrs_api_check.rs | 新規作成 | 公開API確認テスト（全9型のアクセス検証） |

## 実装内容

### lib.rs の変更 (3箇所)
1. **モジュールドキュメント更新** (1-15行目):
   - "mistralrs をバックエンドとして" → "内部バックエンド（llama-cpp-2 / その他）を切り替え可能"
   - "OpenAI/Anthropic 互換" → "OpenAI 互換"

2. **mistralrs re-export ブロック削除** (旧31-36行目):
   - 削除した型: `ChatCompletionResponse`, `Constraint`, `Model`, `RequestBuilder`, `Response`, `SamplingParams`, `TextMessageRole`, `TextMessages`

3. **server::types re-export 追加** (31-35行目):
   - 追加した型: `ChatCompletionRequest`, `ChatCompletionResponse`, `ChatMessage`, `ChatResponseMessage`, `Choice`, `Usage`, `ChatCompletionChunk`, `ChunkChoice`, `Delta`

### tests/ggufrs_api_check.rs (新規)
- `use ggufrs::server::types::{...}` で全9型が正しくインポート可能であることを確認
- 各型の構築・デシリアライズが可能であることを簡易テスト
- mistralrs 型の非公開確認方法をコメントで記載

## 検証結果
- `cargo check -p ggufrs` → ✅ 成功
- `cargo test --lib -p ggufrs` → ✅ 184 passed, 1 ignored
- `cargo test -p ggufrs --test ggufrs_api_check` → ✅ 1 passed
- `cargo test -p ggufrs --test server_integration_test` → ✅ 1 passed
- `grep 'pub use mistralrs' src/lib.rs` → ✅ なし（完全削除確認）
- 翻訳可能性チェック → ✅ 新規コードに問題なし
- `[::STUB::]` チェック → ✅ 新たなスタブ未発生
- `cargo clippy --lib --tests` → 全警告は変更対象外の既存コード由来

## 備考
- clippy の警告は全て既存コード（test-run.rs, settings.rs, error.rs, inference/, server/router.rs）由来で、本チケットのスコープ外
