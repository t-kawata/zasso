---
ticket_id: 39
title: M1-3: 信号品質フィルタ + test-run.rs [SIGNAL_FILTER]
slug: m1-3-test-runrs-signal-filter
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0039-m1-3-test-runrs-signal-filter/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0039-m1-3-test-runrs-signal-filter/review.md
---
# M1-3: 信号品質フィルタ + test-run.rs [SIGNAL_FILTER]

## Summary

MYCUTE の `is_worthy_to_run_asr()` 関数を voiput `src/pipeline/signal_filter.rs` に独立した純粋関数として移植する。test-run.rs に `[SIGNAL_FILTER]` セクションを追加する。

## Background

VAD で切り出された音声区間が「本当に意味のある音声を含んでいるか」を、ASR に渡す前に軽量な計算で判定する。これにより、残響やノイズを「はい」等と誤認識する幻聴を防止する。

判定ロジック：
1. 最小発話長（ms）を超えているか
2. RMS（音圧実効値）が閾値以上か
3. 有意な音声の占有率が閾値以上か

MYCUTE `~/shyme/mycute/src/tools/pseudo_asr_streamer.rs` の `is_worthy_to_run_asr()` メソッドを独立した pub(crate) 関数として抽出する。

## Scope

### 1. `src/pipeline/signal_filter.rs`

```rust
pub fn is_worthy_to_run_asr(
    samples: &[f32],
    config: &SignalFilterConfig,
    utterance_min_ms: u64,
    sample_rate: u32,
) -> bool
```

- `config.enabled == false` → 常に true を返す
- `samples.is_empty()` → false
- 最小発話長チェック: `(samples.len() as f32 / sample_rate as f32) * 1000 < utterance_min_ms` → false
- RMS 計算: `sum_sq.sqrt() / samples.len()`
- 占有率: `active_samples / samples.len()`
- 両方の閾値を超えた場合のみ true

### 2. `src/pipeline/mod.rs`

- `pub(crate) mod signal_filter;` を追加

### 3. `src/bin/test-run.rs`

- `test_signal_filter()` 関数を新規追加（5ケース）
- `main()` から呼び出し

## Non-scope

- 置換辞書（M1-4）— 別チケット
- PseudoAsrStreamer への統合 — M3-1

## Investigation

### 証拠1: MYCUTE の実装

`~/shyme/mycute/src/tools/pseudo_asr_streamer.rs` 1081〜1135行目。
メソッド形式だが、voiput ではすべて引数で受け取る純粋関数に変換。

### 証拠2: 依存追加不要

SignalFilterConfig は `crate::types` に既に定義済み（M0-2）。

## Test Plan

### ユニットテスト計画（7テスト）

1. **test_empty**: 空スライス → false
2. **test_below_min_duration**: 300ms未満 → false
3. **test_low_rms**: RMS 不足 → false
4. **test_low_occupancy**: 占有率不足 → false
5. **test_good_signal**: 全条件充足 → true
6. **test_disabled**: enabled=false → true
7. **test_deterministic**: 同一入力→同一出力

既存48 + 新規7 = 55テスト PASS 見込み

### ユニットテスト不可能な項目

なし。

## Boy Scout Rule

- MYCUTE のメソッド（`&self` 依存）→ 独立した純粋関数に抽出
- 関数名 `is_worthy_to_run_asr` は散文として読める

## Acceptance Criteria

- [ ] `cargo test` が全55テスト PASS
- [ ] `cargo run --bin test-run` で `[SIGNAL_FILTER]` 表示
- [ ] 純粋関数として独立抽出（self 参照なし）

## Notes

- このチケットで最も小さなファイル（約50行 + テスト）
- M3-1 で PseudoAsrStreamer から呼ばれる

### 成果物

- 計画: context/0039-m1-3-signal-filter/plan.md（未作成）
- 実装サマリ: context/0039-m1-3-signal-filter/implementation.md（未作成）
- レビュー報告書: context/0039-m1-3-signal-filter/review.md（未作成）
