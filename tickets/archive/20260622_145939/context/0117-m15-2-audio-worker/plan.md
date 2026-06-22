# 計画: チケット #117 — M15-2 AudioWorkerTask

## 要件
RFC §24.3 準拠。spawn_blocking 駆動の音声処理メインループ。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/worker.rs | 新規 | AudioWorker struct + process_frame() + 3 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod worker; 追加 |
| crates/siprs/src/audio/mixer.rs | 修正 | AudioMixer/MixerSourceEntry #[allow(dead_code)] 除去（STUB解決）|

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
