# 実装サマリ: LocalRecognizerAdapter 不足機能追加 (#126)

## 変更内容
- struct にデコレーションフィールドを追加（seq_counter, is_decorating, session_counter, partial_buf, decoration_task, last_speech_end）
- new() で新フィールドを初期化
- start() のバックグラウンドスレッドでイベント中継を拡張:
  - SpeechStart → デコレーションタスク起動 + SttPending
  - SpeechEnd → デコレーション停止 + バッファフラッシュ + SttCompleted
  - PartialResult → デコレーション中はバッファ / 非デコレーション中は直接送信 + SttCompleted
  - FinalResult → strip_decoration_artifacts + 送信 + SttCompleted
  - ForceClearDecoration 異常時処理
- stop() でデコレーションタスク abort
- シーケンスカウンタを Arc<AtomicU64> に変更（start/stop を超えて継続）

## 変更ファイル
crates/voiput/src/recognizer.rs — 1ファイルのみ

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| make check-be | ✅ |
