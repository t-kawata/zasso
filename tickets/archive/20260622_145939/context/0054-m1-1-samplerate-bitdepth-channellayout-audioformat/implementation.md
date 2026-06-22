# Implementation: M1-1 SampleRate / BitDepth / ChannelLayout / AudioFormat 定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/audio/mod.rs | 新規 | 6行 | audio モジュール宣言 |
| crates/siprs/src/audio/format.rs | 新規 | 295行 | SampleRate(4) + BitDepth(2) + ChannelLayout(2) + AudioFormat + 15 tests + 1 doc-test |
| crates/siprs/src/lib.rs | 修正 | +1行, -2行 | pub mod audio 追加、コメント更新 |

## 実装内容

### format.rs 主要構成

1. **SampleRate** — Hz8000/Hz16000/Hz24000/Hz48000, as_hz(), Display
2. **BitDepth** — I16/F32, bytes_per_sample(), Display
3. **ChannelLayout** — Mono/StereoInOut, num_channels(), Display
4. **AudioFormat** — frame_samples(), frame_bytes(), Default, Display, doc-test

### 設計判断
- BitDepth は PartialEq のみ（f32 の Eq 制約）
- frame_samples は ms × hz / 1000 × ch の整数演算（信頼性と速度を優先）
- frame_bytes は PCM リニアのみ対応（圧縮フォーマットは非対応）

## ビルド・テスト結果

- `cargo build` → ✅ OK（0 error, 0 warning）
- `cargo clippy -- -D warnings` → ✅ OK（0 warning）
- `cargo test` → ✅ OK（36 unit + 1 doc-test = 37 passed, 0 failed）

### テスト内訳

**format.rs（15件新規）:**
- SampleRate: as_hz 全4 variant, Display
- BitDepth: bytes_per_sample, Display
- ChannelLayout: num_channels, Display
- AudioFormat: frame_samples(mono/stereo/全rate), frame_bytes(I16/F32), Default, Display
- コンパイル時検証: Copy, Send+Sync（全4型）

**既存テスト（M0-1/2 継続）:**
- error.rs: 10件 ✅
- util/id.rs: 11件 ✅

## Quality Checks
- run-quality-checks.js: 1 finding（doc-test 内のコードブロック → 誤検出、許容範囲）
