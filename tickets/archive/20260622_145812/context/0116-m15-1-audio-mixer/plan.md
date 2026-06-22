# 計画: チケット #116 — M15-1 AudioMixer

## 要件
RFC §24.1, §24.2 準拠。通話単位の音声ミキサー実装。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/mixer.rs | 追記 | AudioMixer + MixerSourceEntry + 8 tests |
| crates/siprs/src/audio/source.rs | 修正 | ErasedAudioSource #[allow(dead_code)] 除去 |
| crates/siprs/src/util/id.rs | 修正 | AudioSourceId フィールド visibility 変更 |
| crates/siprs/Cargo.toml | 修正 | dashmap, crossbeam-queue 追加 |

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
