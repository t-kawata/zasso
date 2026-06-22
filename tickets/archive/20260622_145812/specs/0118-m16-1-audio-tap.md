---
ticket_id: 118
title: "M16-1: AudioTapHandle / AudioTapMode / subscribe_audio"
slug: m16-1-audio-tap
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
plan_path: /Users/shyme/shyme/zasso/tickets/context/0118-m16-1-audio-tap/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0118-m16-1-audio-tap/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0118-m16-1-audio-tap/review.md
---

# M16-1: `AudioTapHandle` / `AudioTapMode` / `subscribe_audio`

## Summary

利用者が通話音声を購読するための API `AudioTapHandle`, `AudioTapMode`, `SipClient::subscribe_audio` を実装する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§22, §22.1)

## Background

### RFC 準拠

- §22「音声タップは Realtime（oldest-drop）と Lossless（backpressure）の2モードを持つ」
- §22.1 backpressure policy
- §15.7「AudioTapHandle の oldest-drop 戦略と組み合わせて使用すること」

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M15-2 (#117) | `AudioWorker` / `tap_txs` 配送パス |
| M14-3 (#115) | `SipClient` 音声ソース管理 / `call_id` |
| M1-2 (#59) | `AudioChunkPair` |
| M12-3 (#107) | `subscribe` パターン |

### 設計判断

- `AudioTapMode` は `Realtime`（既定）と `Lossless` の2値
- `subscribe_audio` は reactor 経由で AudioWorker に `mpsc::Sender` を登録
- `Realtime` モード: `try_send` + oldest-drop（`mpsc::Sender` の容量を超えたら古いフレームを捨てる）
- `Lossless` モード: `send().await` でバックプレッシャー

## Scope

### 新規: `crates/siprs/src/audio/tap.rs`

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioTapMode {
    Realtime,
    Lossless,
}

pub struct AudioTapHandle {
    rx: tokio::sync::mpsc::Receiver<AudioChunkPair>,
}

impl AudioTapHandle {
    pub async fn recv(&mut self) -> Option<AudioChunkPair>;
    pub fn try_recv(&mut self) -> Result<AudioChunkPair, TryRecvError>;
}
```

### `crates/siprs/src/client.rs`（追記）

```rust
impl SipClient {
    pub fn subscribe_audio(
        &self,
        call_id: CallId,
        format: AudioFormat,
        capacity: usize,
        mode: AudioTapMode,
    ) -> Result<AudioTapHandle, SipError>;
}
```

### 既存ファイル変更

- `crates/siprs/src/audio/mod.rs`: `pub mod tap;` 追加

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_tap_realtime_drop` | Realtime モード: 超過フレームがドロップされる |
| 2 | `test_tap_recv_none_on_close` | channel close → None |
| 3 | `test_tap_mode_default` | AudioTapMode::default() == Realtime |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `AudioTapHandle` / `AudioTapMode` が定義され、`subscribe_audio` が実装されること

## Notes

### M16 マイルストーン

```text
M16-1 (#118) ← 本チケット | M16-2 (#119) | M16-3 (#120)
```
