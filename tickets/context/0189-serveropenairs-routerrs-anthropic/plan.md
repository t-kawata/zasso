# 実装計画: M6-9 (ticket 189)

## 要件
1. chat_completions_handler の本実装（stream フィールド分岐、自前型使用）
2. Anthropic ハンドラ・ルート・テストの完全削除
3. send_raw 参照の完全抹消
4. テストのスタブ解消

## 変更ファイル
1. src/server/openai.rs — 全面書き換え
2. src/server/router.rs — ルート修正＋テスト書き換え
3. tests/server_integration_test.rs — アサーション修正
4. src/server/mod.rs — モジュールドキュメント修正
