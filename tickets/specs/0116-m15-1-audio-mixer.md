---
ticket_id: 116
title: "M15-1: AudioMixer 構造体"
slug: m15-1-audio-mixer
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-17
plan_path: /Users/shyme/shyme/zasso/tickets/context/0116-m15-1-audio-mixer/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0116-m15-1-audio-mixer/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0116-m15-1-audio-mixer/review.md
---

# M15-1: `AudioMixer` 構造体

## Summary

通話単位の音声ミキサー `AudioMixer` を実装する。複数ソースから音声を pull し、ミキシングして lock-free queue に書き込む。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§24.1, §24.2)

## Background

### RFC 準拠

- §24.1「1 通話ごとに AudioMixer を 1 つ持つ。複数 source を frame ごとに pull、sum、clamp、gain 適用し、ミキシング済みフレームを lock-free queue へ書き込む」
- §24.0「PJSIP オーディオコールバック内でのロック・非同期待機・メモリ確保は厳禁」

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M14-1 (#113) | `ErasedAudioSource` trait |
| M14-3 (#115) | 音声ソース管理 API / `AudioSourceId` |
| M5-1 (#69) | `mix_i16_frame` ミキシングアルゴリズム |

### 設計判断

- `sources: DashMap` — 通話中の並行追加・削除に備えて shard 化された concurrent map を使用
- `out_queue / in_queue` — `crossbeam_queue::ArrayQueue` で lock-free 実現
- `gain` は `AtomicU32` で f32 のビット表現を保持（lock-free な更新のため）
- 新規依存: `dashmap`, `crossbeam-queue`

## Scope

### 新規: `crates/siprs/src/audio/mixer.rs`（拡張）

既存の `mixer.rs` に追記：

- `MixerSourceEntry` struct（source / gain / muted / eof）
- `AudioMixer` struct（format / sources / master_gain / next_id / out_queue / in_queue）
- 全 public メソッド（new / add_source / remove_source / set_gain / mute / push_out_frame / pop_out_frame / push_in_frame / pop_in_frame / set_master_gain）

### 依存追加

- `dashmap = "6"`
- `crossbeam-queue = "0.3"`

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_add_source` | ソース追加 → ID 採番 |
| 2 | `test_add_remove_reuse` | 削除・再追加で ID 単調増加 |
| 3 | `test_out_queue_roundtrip` | push → pop 一致 |
| 4 | `test_out_queue_overflow` | 満杯時 oldest-drop |
| 5 | `test_in_queue_overflow` | 満杯時 oldest-drop |
| 6 | `test_set_gain` | gain 0.0 → 無音 |
| 7 | `test_mute` | mute → unmute で gain 復元 |
| 8 | `test_master_gain` | master_gain 0.5 → 半減 |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `AudioMixer` がソース管理・ミキシング・queue 操作を提供すること
- [ ] queue 満杯時に oldest-drop が動作すること

## Notes

### M15 マイルストーン

```text
M15-1 (#116) ← 本チケット | M15-2 (#117) 未着手
```
