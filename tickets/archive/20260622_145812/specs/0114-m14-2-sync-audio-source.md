---
ticket_id: 114
title: "M14-2: SyncAudioSource + SyncSourceAdapter"
slug: m14-2-sync-audio-source
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0114-m14-2-sync-audio-source/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0114-m14-2-sync-audio-source/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0114-m14-2-sync-audio-source/review.md
---

# M14-2: `SyncAudioSource` + `SyncSourceAdapter`

## Summary

同期的な音声ソースを `AsyncAudioSource` に適合させる `SyncAudioSource` trait と `SyncSourceAdapter` を実装する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§23.2)

## Background

### RFC 準拠

§23.2「同期的な音声ソースを非同期 trait に適合させるアダプタを提供する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M14-1 (#113) | `AsyncAudioSource` trait / `audio/source.rs` |

### 設計判断

- `SyncSourceAdapter` は単純な所有権ラッパー。`async fn next_chunk` 内で同期的に `inner.next_chunk(buf)` を呼び出すだけ
- 変換オーバーヘッドはコンパイラの最適化に期待（`async fn` が単なる同期呼び出しになる）

## Scope

### `crates/siprs/src/audio/source.rs`（追記）

```rust
/// 同期音声ソース。
pub trait SyncAudioSource: Send {
    fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

/// 同期音声ソースを非同期に適合させるアダプタ。
pub struct SyncSourceAdapter<T: SyncAudioSource + Send> {
    inner: T,
}

impl<T: SyncAudioSource + Send> SyncSourceAdapter<T> {
    pub fn new(inner: T) -> Self;
    pub fn into_inner(self) -> T;
}

impl<T: SyncAudioSource + Send> AsyncAudioSource for SyncSourceAdapter<T> {
    fn next_chunk(&mut self, buf: &mut [i16]) -> impl Future<Output = usize> + Send {
        let written = self.inner.next_chunk(buf);
        async move { written }
    }
}
```

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_sync_source_adapter` | MockSyncSource → SyncSourceAdapter 経由で動作 |
| 2 | `test_sync_source_empty_buf` | buf.len() == 0 → 0 を返す |
| 3 | `test_sync_source_truncate` | バッファサイズ分のみ返す |
| 4 | `test_into_inner` | into_inner() が元の実装を返す |
| 5 | `test_sync_source_send` | Send 境界充足のコンパイル時検証 |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `SyncAudioSource` trait が定義される
- [ ] `SyncSourceAdapter` が `AsyncAudioSource` を実装する
- [ ] `into_inner()` が元の実装を返す

## Notes

### M14 マイルストーン

```text
M14-1 (#113) ✅ | M14-2 (#114) ← 本チケット | M14-3 (#115)
```
