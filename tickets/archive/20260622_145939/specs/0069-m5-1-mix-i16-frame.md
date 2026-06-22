---
ticket_id: 69
title: "M5-1: mix_i16_frame ミキシングアルゴリズム"
slug: m5-1-mix-i16-frame
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0069-m5-1-mix-i16-frame/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0069-m5-1-mix-i16-frame/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0069-m5-1-mix-i16-frame/review.md
---

# M5-1: `mix_i16_frame` ミキシングアルゴリズム

## Summary

複数音声ソースのミキシングを実行する純粋関数を実装する。i32 中間バッファでオーバーフローを防止し、最終的に i16 飽和で出力する。ゲイン適用版・単一フレームゲイン調整も同時に実装する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§24.2)

## Background

### RFC 準拠

RFC §24.2「内部ミキシングは i32 accumulation でオーバーフローを避け、最後に saturating i16 に落とす」に準拠する。§24.2 gain and normalization「既定では soft normalization は行わない」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M1-1 (#54) | `SampleRate` / `BitDepth` / `AudioFormat` — フォーマット情報（本チケットでは使用しないが同一 `audio` モジュール） |
| M1-2 (#59) | `AudioChunk` / `AudioChunkPair` — ミキシング結果の格納先として使用（M5-1 は生 `&[i16]` で動作するため非依存） |
| M0-1 (#52) | `SipError` — 本チケットは純粋関数のためエラー型不要 |

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M15-1 (#TBD) | `AudioMixer` 構造体の内部ミキシング処理で本関数を呼び出す |

### 設計判断

- **新規ファイル `src/audio/mixer.rs`**: ミキシング専用の関数群を `chunk.rs` / `format.rs` から分離
- **エラー型不要**: 純粋関数のため `Result<(), E>` ではなくメモリ内完結。不正な入力（ゼロ長スライス等）は空出力またはゼロフィルで対応
- **`#![no_std]` 互換**: `alloc` crate のみで動作可能な設計。ただし現段階では `std` 環境で実装し、将来 `no_std` 対応が必要になった時点で検証
- **入力長不一致の扱い**: 短い入力をゼロパディング扱いとする。`input.get(sample_idx).copied().unwrap_or(0)` のパターンで安全に処理
- **`pub(crate)`**: 全ての関数は crate 内部でのみ使用し、公開APIとしない

## Scope

### `crates/siprs/src/audio/mixer.rs`（新規）

```rust
/// 複数の i16 フレームを加算ミキシングする。
///
/// 各サンプル位置で全 input の値を i32 に加算後、i16 範囲に clamp する。
/// 入力リストが空の場合は output をゼロフィルする。
pub(crate) fn mix_i16_frame(inputs: &[&[i16]], output: &mut [i16]);

/// ゲイン適用版ミキシング。
///
/// 各 input に個別ゲインを乗算してから加算する。
/// gains の長さが inputs より短い場合、残りのゲインは 1.0 とする。
pub(crate) fn mix_i16_frame_with_gains(
    inputs: &[&[i16]],
    gains: &[f32],
    output: &mut [i16],
);

/// 単一 i16 フレームにゲインを適用する。
///
/// gain * sample を i32 計算し、i16 範囲に clamp する。
pub(crate) fn apply_gain_to_frame(frame: &mut [i16], gain: f32);
```

### `crates/siprs/src/audio/mod.rs`（修正）

- `pub mod mixer;` を追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_mix_single_input` | 単一 input `[100, 200, 300]` → output `[100, 200, 300]` |
| 2 | `test_mix_two_inputs` | 2入力 `[100, 200]` + `[50, 100]` → output `[150, 300]` |
| 3 | `test_mix_overflow_clamp` | `[i16::MAX]` + `[1]` → `[i16::MAX]`（飽和） |
| 4 | `test_mix_underflow_clamp` | `[i16::MIN]` + `[-1]` → `[i16::MIN]`（飽和） |
| 5 | `test_mix_empty_inputs` | 空 input リスト → 全ゼロ出力 |
| 6 | `test_mix_mismatched_lengths` | `[100, 200, 300]` + `[50]` → `[150, 200, 300]`（ゼロパディング） |
| 7 | `test_mix_with_gains_half` | gain=0.5 で `[100, 200]` → `[50, 100]` |
| 8 | `test_mix_with_gains_zero` | gain=0.0 で全ゼロ |
| 9 | `test_mix_with_gains_double` | gain=2.0 で `[10000]` → `[20000]` |
| 10 | `test_apply_gain_half` | apply_gain_to_frame `[100, 200]`, 0.5 → `[50, 100]` |
| 11 | `test_apply_gain_clamp` | apply_gain_to_frame `[20000]`, 2.0 → `[i16::MAX]`（飽和） |
| 12 | `test_mix_stress` | 1000サンプル × 10入力を1000回 → オーバーフロー/アンダーフローなし |

## Non-scope

- `AudioMixer` 構造体 — M15-1 で実装
- `AudioChunk` / `AudioChunkPair` との統合 — 同上
- `f32` 版ミキシング — 現時点では不要（`AudioChunk::as_f32` で変換可能）
- ソフト正規化 — RFC §24.2 で既定無効

## Test Plan

### 基本方針

純粋関数のため、全テストはメモリ内完結・決定論的・並列実行可能。プロパティベーステスト（proptest）は後段で追加。

特に以下の観点を重点的に検証する：
- **飽和演算**: `i16::MAX + 1` / `i16::MIN - 1` が正しく clamp されること
- **ゼロパディング**: 入力長不一致時も安全に動作すること
- **ゲイン演算**: 乗算後の clamp が正しく機能すること
- **ストレステスト**: 1000 サンプル × 10 入力 × 1000 回でオーバーフロー/アンダーフローが発生しないこと

### ユニットテスト不可能な項目（例外）

なし — 全関数が純粋で外部依存ゼロのため、全てユニットテストで検証可能。

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 172 テスト + 新規 12 テスト）
- [ ] `src/audio/mixer.rs` が作成されている
- [ ] `audio/mod.rs` に `pub mod mixer;` が追加されている
- [ ] `mix_i16_frame` / `mix_i16_frame_with_gains` / `apply_gain_to_frame` の 3 関数が実装されている
- [ ] 全関数が `pub(crate)` であること
- [ ] 全テストで `unwrap()` 不使用
- [ ] オーバーフローテスト・アンダーフローテストが正しく clamp を検証すること
- [ ] ストレステスト（1000×10×1000）がパンクや過剰メモリ消費なく完了すること

## Notes

### ファイル分割

本チケットは `src/audio/mixer.rs` を新規追加する。`chunk.rs` は `AudioChunk` / `AudioChunkPair` のデータ型定義に専念し、ミキシングロジックは `mixer.rs` に分離する。

### M5 マイルストーン

```text
M5-1 (#69): mix_i16_frame ミキシングアルゴリズム ← 本チケット
M5-2 (#70): interleave_in_out ステレオマッピング
M5-3 (#71): PairAligner — IN/OUT ペア整列アルゴリズム
```
