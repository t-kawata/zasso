# 実装サマリ: M6-9 (ticket 189)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/server/openai.rs` | MODIFY | chat_completions_handler 統合・本実装、Anthropic削除、mistralrs依存除去、build_prompt_from_messages 等ヘルパー追加、ユニットテスト3件 |
| `crates/ggufrs/src/server/router.rs` | MODIFY | Anthropic ルート削除、テスト全面書き換え（正常系/異常系/SSE/404確認） |
| `crates/ggufrs/tests/server_integration_test.rs` | MODIFY | スタブアサーションを正しい期待値（404/422）に修正 |
| `crates/ggufrs/src/server/mod.rs` | MODIFY | モジュールドキュメント更新 |

## テスト結果
- 184 passed / 0 failed / 1 ignored (lib)
- 1 passed (integration)
- 0 warnings

## Acceptance Criteria
- [x] stream=false → 200 + ChatCompletionResponse JSON
- [x] stream=true → SSE (text/event-stream)
- [x] POST /anthropic/v1/messages → 404
- [x] grep -rn 'send_raw' src/server/ → 空
- [x] 全既存テスト通過
- [x] MistralrsError 関連テスト削除
- [x] 12個の [::STUB::] マーカー削除

## 削除要素
- anthropic_messages_handler, parse_messages, extract_chat_response
- use mistralrs::{...}
- Anthropic ルート /anthropic/v1/messages
- テスト5件（Anthropic関連3 + mistralrs依存1 + send_raw関数名1）
- send_raw コメント参照
- 12個の [::STUB::] マーカー
