# 実装サマリ: LocalRecognizerAdapter イベント中継 regression 修正 (#125)

## 原因
SpeechRecognizer::tick() がどこからも呼ばれない関数のため、
tick() 経由のイベント中継方式では StreamerEvent が誰にも読まれない。

## 修正内容

### crates/voiput/src/recognizer.rs
- streamer_rx: Mutex<Option<...>> → Arc<Mutex<Option<...>>>
- start(): スレッド内で rx を Arc::clone + イベント中継をスレッド内で実施
- tick() メソッドを削除
- SpeechRecognizer::tick() の Local ディスパッチを no-op に戻す

### アーキテクチャ
streamer_rx を Arc<Mutex> でラップすることで start/stop サイクルを
超えて生存し、スレッド終了後も次回 start で再利用可能。
→ rebuild_streamer 不要 → モデル再読み込みなし

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| make check-be | ✅ |
