---
ticket_id: 71
title: "M5-3: PairAligner — IN/OUT ペア整列アルゴリズム"
slug: m5-3-pair-aligner
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0071-m5-3-pair-aligner/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0071-m5-3-pair-aligner/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0071-m5-3-pair-aligner/review.md
---

# M5-3: `PairAligner` — IN/OUT ペア整列アルゴリズム

## Summary

RTP 受信（IN）とローカルミキサー出力（OUT）の時間軸ズレを吸収し、同一タイムスタンプの IN/OUT ペアを生成する `PairAligner` を実装する。tolerance 内のペアを結合し、tolerance 超過フレームはドロップする。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§25, §25.1, §45.2)

## Background

### RFC 準拠

RFC §25「受信音声は RTP 由来、送信音声は mixer 由来のため時間軸がずれる。内部では timestamped ring buffer を 2 本持ち、共通 frame boundary で最も近いサンプル列を結合する」。§25.1「IN なし/OUT あり、または逆の場合、tolerance 超過後にゼロパディングで pair を生成する」。§45.2「pair aligner（時間ズレ・欠損・ゼロパディング）」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M5-1 (#69) | `mix_i16_frame` / `mix_i16_frame_with_gains` — `bridge.rs` の sibling（依存なし） |
| M5-2 (#70) | `interleave_in_out` — `bridge.rs` に同居、同一ファイルの拡張 |
| M1-2 (#59) | `AudioChunkPair` — ペアリング結果の格納先（本チケットでは生 `Vec<i16>` で動作） |

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M15-1 (#TBD) | `AudioMixer` 内部で `PairAligner` を利用し IN/OUT ペアを生成 |
| M15-2 (#TBD) | `AudioWorkerTask` から `PairAligner` を駆動 |

### 設計判断

- **`bridge.rs` への追記**: M5-2 で作成済みの `src/audio/bridge.rs` に `TimedFrame` / `PairAligner` を追加。同一ファイルにステレオマッピングとペア整列の両方が存在する（両者とも IN/OUT 音声の変換ロジック）
- **`TimedFrame<T>` はプライベート構造体**: `PairAligner` 内部でのみ使用。`pub(crate)` 不要
- **tolerance の単位**: `Duration`（最大 50ms 程度を想定）
- **ドロップ動作**: RFC §25 のアルゴリズム通り、古い方のキューからフレームを捨てる。両方のキューを同時にクリアしない
- **`#![no_std]` 非対応**: `VecDeque`, `Instant`, `Duration` を使用するため `std` 必須
- **`#[cfg_attr(not(test), allow(dead_code))]`**: M15-1 で使用開始されるまで dead_code 警告を抑制。テストコードは `#[cfg(test)]` 内で常に使用される

## Scope

### `crates/siprs/src/audio/bridge.rs`（追記）

```rust
use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// タイムスタンプ付きフレーム。
struct TimedFrame<T> {
    /// モノトニッククロック由来のタイムスタンプ。
    ts_mono: Instant,
    /// フレームデータ。
    data: T,
}

/// IN/OUT ペア整列アルゴリズム。
///
/// 2 本の timestamped ring buffer（`in_q`, `out_q`）を持ち、
/// 共通 frame boundary で最も近いサンプル列を結合する。
pub(crate) struct PairAligner {
    /// IN フレームキュー（RTP 受信音声）。
    in_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// OUT フレームキュー（ローカルミキサー出力）。
    out_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// ペアリング許容時間差。
    tolerance: Duration,
}

impl PairAligner {
    /// 許容時間差を指定して PairAligner を生成する。
    pub(crate) fn new(tolerance_ms: u64) -> Self;

    /// IN フレームをキューに追加する。
    pub(crate) fn push_in(&mut self, ts: Instant, frame: Vec<i16>);

    /// OUT フレームをキューに追加する。
    pub(crate) fn push_out(&mut self, ts: Instant, frame: Vec<i16>);

    /// ペアリング可能な IN/OUT ペアを試行する。
    ///
    /// 戻り値: `Some((in_frame, out_frame, timestamp))` または `None`。
    /// - 両キューにフレームがあり、時間差が tolerance 以内 → ペアを返す。
    /// - 時間差超過かつ IN が古い → IN をドロップし None。
    /// - 時間差超過かつ OUT が古い → OUT をドロップし None。
    /// - いずれかのキューが空 → None。
    pub(crate) fn try_pair(&mut self) -> Option<(Vec<i16>, Vec<i16>, Instant)>;

    /// tolerance を超過した古いフレームを全てドロップする。
    ///
    /// 戻り値: ドロップしたフレーム数。
    /// 現在時刻との比較で判定する。
    pub(crate) fn flush_stale(&mut self, now: Instant) -> usize;

    /// 各キューの滞留フレーム数を返す。
    pub(crate) fn pending_count(&self) -> (usize, usize);
}
```

### テストコード（`bridge.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_pair_exact_match` | 完全一致タイムスタンプのペアが即座に返されること |
| 2 | `test_pair_within_tolerance` | tolerance 以内の微小ズレ（1ms）でペアが返されること |
| 3 | `test_pair_tolerance_exceeded_drop_old_in` | tolerance 超過で IN が古い場合 → IN ドロップ |
| 4 | `test_pair_tolerance_exceeded_drop_old_out` | tolerance 超過で OUT が古い場合 → OUT ドロップ |
| 5 | `test_in_only_no_out` | IN のみ到着、tolerance 超過後も `try_pair` は None |
| 6 | `test_out_only_no_in` | OUT のみ到着、同上 |
| 7 | `test_interleaved_arrival` | IN, OUT, IN, OUT の交互到着で全ペアが正しく返ること |
| 8 | `test_burst_arrival` | IN 10個→OUT 10個のバースト到着で全ペアが正しく返ること |
| 9 | `test_flush_stale` | `flush_stale` が古いフレームを削除すること |
| 10 | `test_pending_count` | `pending_count` が正しい滞留数を返すこと |

## Non-scope

- `AudioChunkPair` との統合 — M15-1 で実施
- ゼロパディングによる強制ペア生成 — M25.1 の高度な機能、現状は単純ドロップ
- MIRI による検証 — CI 環境整備後
- `crossbeam_queue::ArrayQueue` ベースの最適化 — §25.2 の将来最適化候補

## Test Plan

### 基本方針

`Instant` を使用するテストは `Duration` の相対比較で行い、実時間への依存を最小化する。テスト内で `Instant::now()` を呼び、そこからの相対 `Duration` でタイムスタンプを設定する。

特に以下の観点を重点的に検証する：
- **tolerance 判定**: 境界値（tolerance 以内/超過）の正確な判定
- **ドロップ順序**: 古い方のフレームが正しくドロップされること
- **バースト耐性**: 大量フレーム到着時の正しいペアリング

### ユニットテスト不可能な項目（例外）

なし — `Instant` の相対比較で全て検証可能。

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 193 テスト + 新規 10 テスト）
- [ ] `src/audio/bridge.rs` に `PairAligner` / `TimedFrame` が追加されている
- [ ] `PairAligner::new` / `push_in` / `push_out` / `try_pair` / `flush_stale` / `pending_count` の 6 メソッドが実装されている
- [ ] `try_pair` が RFC §25 のアルゴリズムに従うこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### M5 マイルストーン

```text
M5-1 (#69): mix_i16_frame ミキシングアルゴリズム ← 完了済み
M5-2 (#70): interleave_in_out ステレオマッピング ← 完了済み
M5-3 (#71): PairAligner — IN/OUT ペア整列アルゴリズム ← 本チケット
```
