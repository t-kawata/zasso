---
ticket_id: 115
title: "M14-3: 音声ソース管理 API — add_audio_source / remove_audio_source / set_gain / mute"
slug: m14-3-audio-source-management
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0115-m14-3-audio-source-management/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0115-m14-3-audio-source-management/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0115-m14-3-audio-source-management/review.md
---

# M14-3: 音声ソース管理 API — `add_audio_source` / `remove_audio_source` / `set_gain` / `mute`

## Summary

通話中の音声ソース動的管理 API を `SipClient` に追加する。`add_audio_source`, `remove_audio_source`, `set_audio_source_gain`, `mute_audio_source` の 4 メソッドを実装する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§24.4)

## Background

### RFC 準拠

§24.4「通話中の追加・削除・切替は reactor command 経由で同期化し、次 frame 境界で反映する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-4 (#108) | `SipClient` / `block_on` / `send_and_wait` |
| M12-5 (#109) | `ensure_not_shutdown()` |
| M12-6 (#110) | `#[tracing::instrument]` |
| M14-1 (#113) | `AsyncAudioSource` trait |
| M11-1 (#100) | `RuntimeCommand::AddAudioSource` / `RemoveAudioSource` / `SetSourceGain` / `MuteSource` |
| M0-2 (#59) | `AudioSourceId` |

### 設計判断

- `add_audio_source` は `Box<dyn AsyncAudioSource>` を受け取り RTT で reactor に送信
- `set_audio_source_gain` の `gain` は 0.0 以上（負値は `InvalidConfig`）
- 上限は設けないが、極端な値は M15 で警告ログ対応（本チケットではスキップ）
- `mute_audio_source` は `muted: bool` フラグ設定

## Scope

### `crates/siprs/src/client.rs`（追記）

`SipClient` に以下 4 メソッドを追加：

```rust
impl SipClient {
    pub fn add_audio_source(&self, call_id: CallId, source: Box<dyn AsyncAudioSource>) -> Result<AudioSourceId, SipError>;
    pub fn remove_audio_source(&self, call_id: CallId, source_id: AudioSourceId) -> Result<(), SipError>;
    pub fn set_audio_source_gain(&self, call_id: CallId, source_id: AudioSourceId, gain: f32) -> Result<(), SipError>;
    pub fn mute_audio_source(&self, call_id: CallId, source_id: AudioSourceId, muted: bool) -> Result<(), SipError>;
}
```

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_add_audio_source` | RuntimeCommand 配送 + AudioSourceId 取得 |
| 2 | `test_remove_audio_source` | RemoveAudioSource 配送 |
| 3 | `test_set_gain_ok` | gain 0.5 受理 |
| 4 | `test_set_gain_negative` | gain -1.0 → InvalidConfig |
| 5 | `test_mute_unmute` | MuteSource 配送 |
| 6 | `test_audio_source_after_shutdown` | shutdown 後 → ShutdownInProgress |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `add_audio_source` / `remove_audio_source` / `set_audio_source_gain` / `mute_audio_source` が実装済み
- [ ] 負の gain で `InvalidConfig` が返ること

## Notes

### M14 マイルストーン

```text
M14-1 (#113) ✅ | M14-2 (#114) ✅ | M14-3 (#115) ← 本チケット
```
