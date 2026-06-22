---
ticket_id: 113
title: "M14-1: AsyncAudioSource trait（RPITIT）+ ErasedAudioSource blanket impl"
slug: m14-1-async-audio-source
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0113-m14-1-async-audio-source/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0113-m14-1-async-audio-source/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0113-m14-1-async-audio-source/review.md
---

# M14-1: `AsyncAudioSource` trait（RPITIT）+ `ErasedAudioSource` blanket impl

## Summary

利用者が非同期音声ソースを実装するためのプライマリ trait `AsyncAudioSource` と、内部動的ディスパッチ用の `ErasedAudioSource` blanket impl を定義する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§23, §23.1)

## Background

### RFC 準拠

§23「本crate は MSRV 1.95 を前提とし、RPITIT を採用する」。
§23.1「内部の AudioMixer は Box\<dyn ErasedAudioSource\> でソースを保持するため、object-safe な wrapper trait を自動導出する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M0-2 (#59) | `AudioSourceId`（`util/id.rs`） |
| M5 (#69-71) | オーディオ処理（`mixer.rs`, `chunk.rs`） |

### 設計判断

- **RPITIT（Return Position Impl Trait In Trait）**: Rust 1.75 で安定化。`async fn` in trait を可能にし、`Pin<Box<dyn Future>>` の手動ラップを不要にする
- **`ErasedAudioSource`**: 内部の `AudioMixer` は動的ディスパッチのため object-safe な wrapper が必要。blanket impl で自動導出
- **ファイル構成**: 新規 `src/audio/source.rs` に定義。`audio/mod.rs` に `pub mod source;` 追加

## Scope

### 新規ファイル

**`crates/siprs/src/audio/source.rs`**:

```rust
/// 非同期音声ソース。
///
/// 利用者が実装するプライマリ trait。RPITIT により async fn を trait 内で宣言可能。
pub trait AsyncAudioSource: Send {
    /// 次のオーディオチャンクを buf に書き込む。
    ///
    /// 戻り値は実際に書き込まれたサンプル数（buf.len() 以下）。
    async fn next_chunk(&mut self, buf: &mut [i16]) -> usize;
}

/// Object-safe な音声ソース。
///
/// AudioMixer 内部での動的ディスパッチ用。利用者が直接触ることはない。
pub(crate) trait ErasedAudioSource: Send {
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>>;
}

/// blanket impl: AsyncAudioSource → ErasedAudioSource を自動導出。
impl<T: AsyncAudioSource + Send> ErasedAudioSource for T {
    fn next_chunk<'a>(
        &'a mut self,
        buf: &'a mut [i16],
    ) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>> {
        Box::pin(AsyncAudioSource::next_chunk(self, buf))
    }
}
```

### 既存ファイル変更

**`crates/siprs/src/audio/mod.rs`**: `pub mod source;` 追加。

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_mock_source` | MockSource が AsyncAudioSource を実装し値を返す |
| 2 | `test_not_object_safe` | `Box<dyn AsyncAudioSource>` がコンパイルエラー（型チェック） |
| 3 | `test_erased_trait_object` | `Box<dyn ErasedAudioSource>` がコンパイル可能 |
| 4 | `test_blanket_impl` | MockSource が自動で ErasedAudioSource を実装 |
| 5 | `test_send_sync` | Send 境界充足のコンパイル時検証 |

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS
- [ ] `AsyncAudioSource` trait が定義され RPITIT で動作すること
- [ ] `ErasedAudioSource` blanket impl が自動導出されること
- [ ] `Box<dyn AsyncAudioSource>` がコンパイルエラーになること

## Notes

### M14 マイルストーン

```text
M14-1 (#113) ← 本チケット | M14-2 (#114) | M14-3 (#115)
```
