# 計画: チケット #114 — M14-2 SyncAudioSource + SyncSourceAdapter

## 要件
RFC §23.2 準拠。同期音声ソースの trait 定義と AsyncAudioSource への適合。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/source.rs | 追記 | SyncAudioSource + SyncSourceAdapter + 4 tests |

## 実装手順
1. SyncAudioSource trait 追加
2. SyncSourceAdapter + new()/into_inner() 追加
3. AsyncAudioSource impl 追加
4. テスト 4 件追加
5. cargo check + cargo test

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
