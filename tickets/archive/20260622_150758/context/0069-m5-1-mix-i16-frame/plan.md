# 計画: チケット #69 — M5-1 mix_i16_frame ミキシングアルゴリズム

## 要件

RFC §24.2 準拠の 3 つの純粋ミキシング関数を src/audio/mixer.rs に実装:
- mix_i16_frame: 複数 i16 入力を i32 accumulation → i16 clamp
- mix_i16_frame_with_gains: 個別ゲイン適用版
- apply_gain_to_frame: 単一フレームゲイン調整

全関数 pub(crate)、エラー型不要。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/mixer.rs | 新規 | 3 ミキシング関数 + 12 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod mixer; 追加 |

## 実装手順

1. src/audio/mixer.rs 作成
2. src/audio/mod.rs 修正
3. (cd crates/siprs && cargo check)
4. (cd crates/siprs && cargo test)

## レビュー方法

- run-quality-checks.js on mixer.rs
- 翻訳可能性 grep（関数名・変数名・魔法数）
- 全テストPASS確認（172 + 12 = 184 tests）
