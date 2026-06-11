# 実装サマリー: M1-2 PostCorrectionProcessor

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/post_correct.rs` | 新規 | PostCorrectionProcessor 完全移植（9テスト含む）。PostCorrectionConfig のみ crate::types 参照 |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod post_correct;` 追加 |
| `src/lib.rs` | 変更 | PostCorrectionProcessor/PostCorrectionBackend/SttModelType/ProcessorOutput の pub re-export |
| `src/bin/test-run.rs` | 変更 | `test_post_correct()` 追加（OfflineModel/OnlineModel/commit デモ） |

## 検証結果

- cargo test: ✅ 48/48 PASS（既存39 + 新規9）
- cargo run --bin test-run: ✅ [POST_CORRECT] 3テスト全て ✓ PASS
- cargo fmt: ✅ 整形済み

## 特記事項

- MYCUTE からの完全移植。変更点は PostCorrectionConfig の参照パスのみ
- MockBackend を使用。LLM 呼び出しなしで全テスト完結
- 重複防止ロジック（commit_correction 後のバッファクリア）確認済み
