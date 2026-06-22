# 実装サマリ: PseudoAsrStreamer 事後補正バックエンド注入 (#127)

## 変更内容
### pipeline/streamer.rs
- PseudoAsrStreamer::new() に post_correct_backend: Option<Arc<dyn PostCorrectionBackend>> 追加
- Some の場合は事後補正に専用バックエンドを使用、None なら従来通り backend を兼用
- テストコードの new() 呼び出し2箇所に None 追加

### backends/openai.rs
- init_audio() / rebuild_streamer() の new() 呼び出しに None 追加（既存動作維持）

### recognizer.rs
- LocalRecognizerAdapter::new() で post_correction_openai_config から事後補正用バックエンドを生成
- PseudoAsrStreamer::new() に pc_backend を渡す

### binary/test-run.rs
- test_streamer() の new() 呼び出しに None 追加

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| make check-be | ✅ |
