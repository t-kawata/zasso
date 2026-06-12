# 実装成果: チケット #69 — M5-1 mix_i16_frame ミキシングアルゴリズム

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/audio/mixer.rs | 新規 | 3 ミキシング関数 + 1 内部ヘルパー + 12 tests |
| crates/siprs/src/audio/mod.rs | 修正 | pub mod mixer; 追加 |

## 実装内容

### mix_i16_frame
- 二重ループ: 各サンプル位置で全入力を i32 加算 → i16 clamp
- 空 inputs → output ゼロフィル
- 入力長不一致 → input.get(idx).copied().unwrap_or(0) でゼロパディング

### mix_i16_frame_with_gains
- 各 input に個別 gain (f32) を乗算後加算
- gains 不足分は unwrap_or(1.0) でデフォルト補完
- f64 で乗算し i32 範囲の飽和を防止（内部ヘルパー apply_gain_i32）

### apply_gain_to_frame
- 単一フレームの全サンプルに gain を適用
- 乗算結果を i32 → clamp → i16

## テスト結果
- 184 tests PASS（既存 172 + 新規 12）
- 0 warnings（dead_code は M15-1 使用開始時に解除）
- Quality checks: 0 issues
