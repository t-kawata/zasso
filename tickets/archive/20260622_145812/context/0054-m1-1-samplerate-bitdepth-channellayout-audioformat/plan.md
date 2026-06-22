# Plan: M1-1 SampleRate / BitDepth / ChannelLayout / AudioFormat 定義

## 要件（spec 承認済み）

1. `audio/format.rs` に SampleRate(4), BitDepth(2), ChannelLayout(2), AudioFormat を定義
2. 各型にヘルパーメソッドを実装（as_hz, bytes_per_sample, num_channels, frame_samples, frame_bytes）
3. AudioFormat::default() を RFC §48 既定値（16kHz/I16/StereoInOut/20ms）で実装
4. audio/mod.rs の作成
5. lib.rs に `pub mod audio;` 追加
6. 全テスト PASS、全型が Copy + Send + Sync

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/audio/format.rs | 新規 | 4 フォーマット型 + ヘルパー + Display + Default + 15 tests |
| crates/siprs/src/audio/mod.rs | 新規 | audio モジュール宣言 |
| crates/siprs/src/lib.rs | 修正 | `pub mod audio;` 追加 |

## Boy Scout 改善

- lib.rs のコメント `// M0-1 時点では error モジュールのみ。` を最新状態に更新（既に M0-2 で util が追加されているため）

## テスト計画

### 基本方針

全テストをユニットテストでカバー。format.rs 内に 15 テスト関数を実装。

### ユニットテスト計画（15件）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | test_sample_rate_as_hz_all_variants | Hz8000→8000, Hz16000→16000, Hz24000→24000, Hz48000→48000 |
| 2 | test_sample_rate_display | "8000Hz" 等 |
| 3 | test_bit_depth_bytes_per_sample | I16=2, F32=4 |
| 4 | test_bit_depth_display | "I16"/"F32" |
| 5 | test_channel_layout_num_channels | Mono=1, StereoInOut=2 |
| 6 | test_channel_layout_display | "Mono"/"Stereo(L=IN,R=OUT)" |
| 7 | test_audio_format_frame_samples | 16kHz/I16/Mono/20ms → 320 |
| 8 | test_audio_format_frame_samples_stereo | StereoInOut で mono の 2 倍 |
| 9 | test_audio_format_frame_samples_all_rates | 全 rate での計算値確認 |
| 10 | test_audio_format_frame_bytes_i16 | I16: 320×2=640 |
| 11 | test_audio_format_frame_bytes_f32 | F32: 320×4=1280 |
| 12 | test_audio_format_default | Default が §48 と一致 |
| 13 | test_audio_format_display | "16000Hz/I16/Stereo(L=IN,R=OUT) 20ms" |
| 14 | test_copy_semantics | 全型が Copy であること |
| 15 | test_send_sync | 全型が Send + Sync |

### ユニットテスト不可能な項目（例外）

- なし（全テストメモリ内完結）

## 実装手順

1. **audio/format.rs 作成**
   ```bash
   mkdir -p crates/siprs/src/audio
   ```
   - SampleRate enum + as_hz + Display
   - BitDepth enum + bytes_per_sample + Display
   - ChannelLayout enum + num_channels + Display
   - AudioFormat struct + frame_samples + frame_bytes + Default + Display
   - テスト mod（15 テスト関数）
   - doc comment に doc-test を含める

2. **audio/mod.rs 作成**
   - `pub mod format;`

3. **lib.rs 修正**
   - `pub mod audio;` 追加、コメント更新

4. **ビルド確認**
   ```bash
   cd crates/siprs && cargo build
   ```

5. **テスト実行**
   ```bash
   cd crates/siprs && cargo test
   ```
   doc-test を含む全テストの PASS 確認

6. **品質チェック**
   ```bash
   node /Users/shyme/shyme/zasso/.claude/scripts/tickets/review/run-quality-checks.js crates/siprs/src/audio/format.rs crates/siprs/src/lib.rs
   ```

## 物理的レビュー方法

1. `cargo build` 成功（0 error, 0 warning）
2. `cargo test` 全テスト + doc-test PASS
3. 翻訳可能性 grep（1文字変数なし、マジックナンバーなし、デバッグ出力なし）
4. `run-quality-checks.js` pass

## リスク

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| frame_samples の計算誤り（整数除算の切り捨て） | 低 | 中 | テストで全 rate の計算値を検証（特に 24kHz×20ms など 1000 で割り切れないケース） |
| doc-test が lib.rs の pub re-export 前提で失敗 | 低 | 中 | doc-test では `siprs::audio::format::*` の完全修飾パスを使用 |
| BitDepth の Eq 欠如によるコンパイルエラー | 低 | 低 | spec で意図的に PartialEq のみと設計済み。問題なし |
