# 計画: チケット #70 — M5-2 interleave_in_out ステレオマッピング

## 要件

RFC §26.1 準拠の 3 関数を src/audio/bridge.rs に実装:
- interleave_in_out: モノラル IN/OUT → L=IN, R=OUT ステレオ
- deinterleave_stereo: ステレオ → (IN, OUT) モノラルペア
- interleave_in_out_f32: f32 版インタリーブ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/bridge.rs | 新規 | 3 関数 + 9 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod bridge; |

## 実装手順

1. bridge.rs 作成
2. mod.rs 修正 (pub mod bridge;)
3. cargo check + cargo test

## レビュー方法

- run-quality-checks.js on bridge.rs
- 翻訳可能性 grep
- 全テスト PASS 確認 (184 + 9 = 193)
