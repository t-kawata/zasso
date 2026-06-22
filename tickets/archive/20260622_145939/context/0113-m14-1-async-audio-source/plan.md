# 計画: チケット #113 — M14-1 AsyncAudioSource + ErasedAudioSource

## 要件
RFC §23, §23.1 準拠。非同期音声ソースのトレイト定義と blanket impl。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/source.rs | 新規 | AsyncAudioSource trait / ErasedAudioSource trait / blanket impl + 5 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod source; 追加 |

## 実装手順
1. source.rs 作成（AsyncAudioSource RPITIT, ErasedAudioSource, blanket impl）
2. audio/mod.rs に pub mod source 追加
3. テスト 5 件追加
4. cargo check + cargo test

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
