# 実装サマリ: LocalRecognizerAdapter 音声パイプライン修正 (#124)

## バグ1: 二重イベント — 修正済み
- `LocalRecognizerAdapter::start()` から `SttEvent::Started` 送信を削除
- `LocalRecognizerAdapter::stop()` から `SttEvent::Stopped` 送信を削除
- SpeechRecognizer（444行 / 514行）で一元送信する設計に統一

## バグ2: 音声パイプライン未配線 — 修正済み
- `LocalRecognizerAdapter` に `PseudoAsrStreamer<LocalRecognizer>` を追加
- `start()` で以下のパイプラインを構築:
  1. PseudoAsrStreamer の起動（VAD モデル初期化）
  2. ネイティブ音声キャプチャ開始（`start_native_audio_capture()`）
  3. バックグラウンドスレッド: 音声データ転送 + StreamerEvent→SttEvent 中継
- `stop()` で streamer 停止 + キャプチャ停止
- `rebuild_streamer()` で複数回の start/stop サイクル対応

## 変更ファイル

### crates/voiput/src/recognizer.rs
- インポート追加: `PseudoAsrStreamer`, `StreamerEvent`, `anyhow`, `Mutex`, `Duration`
- `LocalRecognizerAdapter` 構造体にフィールド追加: `streamer`, `streamer_rx`, `capture_rx`, `is_running`, `voiput_config`
- `new()`: PseudoAsrStreamer を構築して保持するよう変更
- `start()`: 音声パイプライン起動（Streamer → capture → バックグラウンドスレッド）
- `stop()`: パイプライン停止
- `rebuild_streamer()`: 複数サイクル対応の再構築
- `platform_start_capture()` / `platform_stop_capture()`: プラットフォーム固有キャプチャ制御

### crates/voiput/src/backends/openai.rs
- `build_streamer_config()` を `pub(crate)` に変更（recognizer.rs から共用）

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| make check-be | ✅ |
| run-quality-checks | ✅ 14件 pre-existing（新規 issues なし） |
