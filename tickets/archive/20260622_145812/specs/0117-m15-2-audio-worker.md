---
ticket_id: 117
title: "M15-2: AudioWorkerTask — Tokio blocking pool 駆動"
slug: m15-2-audio-worker
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/shyme/shyme/zasso/tickets/context/0117-m15-2-audio-worker/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0117-m15-2-audio-worker/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0117-m15-2-audio-worker/review.md
---

# M15-2: `AudioWorkerTask` — Tokio blocking pool 駆動

## Summary

音声処理のメインループ `AudioWorker` を実装する。全非同期ソースから音声を pull し、ミキシング、queue への書き込み、PairAligner 経由の Tap 配送までを行う。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§7.1, §24.3)

## Background

### RFC 準拠

- §24.3「AudioWorkerTask は AudioMixer ごとに 1 つ、Tokio の blocking pool 上で動作する」
- §24.0「PJSIP RT callback とは lock-free queue を介してのみ通信する」

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M15-1 (#116) | `AudioMixer` / `MixerSourceEntry` |
| M14-1 (#113) | `ErasedAudioSource` / ソース pull |
| M5-3 (#71) | `PairAligner` |
| M14-3 (#115) | 音声ソース管理 API |

### 設計判断

- `AudioWorker` は `AudioMixer` を所有し、`spawn_blocking` で駆動
- `process_frame()` が 1 フレーム分の処理を実行、`tokio::time::interval` で定周期化
- Tap 配送は `mpsc::Sender<AudioChunkPair>` の Vec で管理

## Scope

### 新規: `crates/siprs/src/audio/worker.rs`

```rust
pub(crate) struct AudioWorker {
    mixer: Arc<AudioMixer>,
    call_id: CallId,
    format: AudioFormat,
    tap_txs: Vec<mpsc::Sender<AudioChunkPair>>,
    pair_aligner: PairAligner,
    shutdown: watch::Receiver<bool>,
}

impl AudioWorker {
    pub(crate) fn new(...) -> Self;
    pub(crate) fn process_frame(&mut self) -> Result<(), SipError>;
    pub(crate) fn run(mut self) -> impl FnOnce() + Send;
}
```

### 既存ファイル変更

- `crates/siprs/src/audio/mod.rs`: `pub mod worker;` 追加

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_single_source` | 1ソース・10フレーム → out_queue 配送 |
| 2 | `test_shutdown_stops_worker` | shutdown signal → graceful stop |
| 3 | `test_tap_delivery` | in_queue → PairAligner → Tap 配送 |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `AudioWorker::process_frame()` がソース pull → ミキシング → queue まで実行できること

## Notes

### M15 マイルストーン

```text
M15-1 (#116) ✅ | M15-2 (#117) ← 本チケット
```
