---
ticket_id: 70
title: "M5-2: interleave_in_out ステレオマッピング"
slug: m5-2-interleave-in-out
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0070-m5-2-interleave-in-out/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0070-m5-2-interleave-in-out/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0070-m5-2-interleave-in-out/review.md
---

# M5-2: `interleave_in_out` ステレオマッピング

## Summary

モノラルの IN フレームと OUT フレームを、L=IN, R=OUT のステレオインタリーブ配列に変換する純粋関数を実装する。利用者が `ChannelLayout::StereoInOut` で受信した `AudioChunkPair` の内部表現として使用される。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§26.1)

## Background

### RFC 準拠

RFC §26.1「既定 stereo 出力では L=IN, R=OUT を保証する」に準拠する。電話の音声方向とステレオチャネルの対応を一貫させ、左右のチャネルから IN/OUT を直感的に識別可能にする。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M1-2 (#59) | `AudioChunkPair` — `stereo_i16()` メソッドがステレオ出力を生成する（本関数利用は M15-1 以降） |
| M5-1 (#69) | `mix_i16_frame` — 同一 `audio` モジュールの sibling（依存関係なし） |

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M15-1 (#TBD) | `AudioMixer` がミキシング出力を `AudioChunkPair` に変換する際に本関数を使用 |

### 設計判断

- **新規ファイル `src/audio/bridge.rs`**: ステレオマッピング専用ファイル。`mixer.rs` とは責務が異なるため分離
- **エラー型不要**: 純粋関数のため `Result<(), E>` ではなくメモリ内完結。ゼロ長入力は空 `Vec` を返す
- **短い方への切り詰め**: 両入力の短い方に合わせる。RFC の `in_mono.len().min(out_mono.len())` に従う
- **`pub(crate)`**: 全ての関数は crate 内部でのみ使用
- **i16 版と f32 版**: 両方実装。`AudioChunk` が i16 と f32 の両形式を保持するため

## Scope

### `crates/siprs/src/audio/bridge.rs`（新規）

```rust
/// モノラル IN/OUT フレームを L=IN, R=OUT のステレオ配列にインタリーブする。
///
/// 両入力の短い方に合わせて切り詰める。
pub(crate) fn interleave_in_out(in_mono: &[i16], out_mono: &[i16]) -> Vec<i16>;

/// ステレオ配列を L→IN, R→OUT のモノラルペアにデインタリーブする。
///
/// 入力長が奇数の場合、最後のサンプルは切り捨てる。
pub(crate) fn deinterleave_stereo(stereo: &[i16]) -> (Vec<i16>, Vec<i16>);

/// f32 版インタリーブ。
pub(crate) fn interleave_in_out_f32(in_mono: &[f32], out_mono: &[f32]) -> Vec<f32>;
```

### `crates/siprs/src/audio/mod.rs`（修正）

- `pub mod bridge;` を追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_interleave_i16_basic` | `in=[1,2,3]`, `out=[4,5,6]` → `[1,4,2,5,3,6]` |
| 2 | `test_deinterleave_basic` | `[1,4,2,5,3,6]` → `(vec![1,2,3], vec![4,5,6])` |
| 3 | `test_roundtrip` | interleave → deinterleave が恒等写像であること |
| 4 | `test_interleave_in_longer` | `in.len() > out.len()` → 短い方に切り詰め |
| 5 | `test_interleave_out_longer` | `out.len() > in.len()` → 短い方に切り詰め |
| 6 | `test_interleave_empty` | 空入力 → 空出力 |
| 7 | `test_interleave_f32_basic` | f32 版の基本動作確認 |
| 8 | `test_deinterleave_odd_length` | 奇数長入力 → 最後のサンプル切り捨て |
| 9 | `test_interleave_large` | 1000 サンプルで正しくインタリーブされること |

## Non-scope

- `AudioChunk` / `AudioChunkPair` との統合 — M15-1 で実施
- `AudioMixer` 内部への組み込み — 同上
- 逆変換 f32 版（`deinterleave_stereo_f32`）— 現時点では不要
- チャネル配置の切り替え（`StereoInOut` 以外）— 現状固定

## Test Plan

### 基本方針

純粋関数のため全テストはメモリ内完結・決定論的。モック不要。

特に以下の観点を重点的に検証する：
- **L=IN, R=OUT の配置不変性**: 交互配置が正しいこと
- **ラウンドトリップ**: interleave → deinterleave で元の値に戻ること
- **切り詰め**: 短い方に合わせる動作
- **境界値**: 空入力、奇数長

### ユニットテスト不可能な項目（例外）

なし — 全関数が純粋で外部依存ゼロ。

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 184 テスト + 新規 9 テスト）
- [ ] `src/audio/bridge.rs` が作成されている
- [ ] `audio/mod.rs` に `pub mod bridge;` が追加されている
- [ ] `interleave_in_out` / `deinterleave_stereo` / `interleave_in_out_f32` の 3 関数が実装されている
- [ ] 全関数が `pub(crate)` であること
- [ ] 全テストで `unwrap()` 不使用
- [ ] ラウンドトリップテストで interleave → deinterleave の恒等性が確認されていること

## Notes

### ファイル名について

本チケットのファイル名は `bridge.rs` とする。Tickets.md でも同一のファイル名が指定されている。このファイルは M18-2 の `AudioBridge`（lock-free queue 接続）が追加される際の土台となる。

### M5 マイルストーン

```text
M5-1 (#69): mix_i16_frame ミキシングアルゴリズム ← 完了済み
M5-2 (#70): interleave_in_out ステレオマッピング ← 本チケット
M5-3 (#71): PairAligner — IN/OUT ペア整列アルゴリズム
```
