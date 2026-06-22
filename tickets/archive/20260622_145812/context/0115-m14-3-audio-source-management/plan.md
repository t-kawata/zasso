# 計画: チケット #115 — M14-3 音声ソース管理 API

## 要件
RFC §24.4 準拠。通話中音声ソース動的管理 4 メソッド。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | add/remove/set_gain/mute 4 methods + 2 tests |
| crates/siprs/src/audio/source.rs | 修正 | ErasedAudioSource pub に昇格 |

## 実装手順
1. import 追加
2. 4 methods 実装
3. gain ≥ 0.0 検証
4. テスト 2 件追加
5. cargo check + cargo test

## レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- 全テスト PASS
