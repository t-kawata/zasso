---
ticket_id: 107
title: pipeline/streamer.rs AsrBackend 移行 + lib.rs 再公開更新
slug: pipelinestreamerrs-asrbackend-librs
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0107-pipelinestreamerrs-asrbackend-librs/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0107-pipelinestreamerrs-asrbackend-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0107-pipelinestreamerrs-asrbackend-librs/review.md
---
# pipeline/streamer.rs AsrBackend 移行 + lib.rs 再公開更新

## Summary

`crates/voiput/src/pipeline/streamer.rs` から既存の `AsrBackend` トレイト定義を削除し、代わりに `use trate::AsrBackend` を追加する。併せて `crates/voiput/src/lib.rs` の `pub use` を `pub use trate::AsrBackend` に更新し、外部からの `voiput::AsrBackend` パスを維持する。

**⚠️ 本チケット完了後、OpenAIBackend の impl がコンパイルエラーになる中間状態が発生する（M3-3 で解消）。**

## Background

M3-1 で voiput が trate crate を依存関係として追加した。本チケットでは、voiput 内部に定義された `AsrBackend` トレイトを削除し、trate のものを使用するよう切り替える。これにより外部クレートから `trate::AsrBackend` を実装して voiput パイプラインに統合することが可能になる。

## Scope

### 実施すること

- `crates/voiput/src/pipeline/streamer.rs` から `AsrBackend` トレイト定義（5 メソッド）を削除
- 同ファイルに `use trate::AsrBackend;` を追加
- `PseudoAsrStreamer<B>`、`BackendWrapper<B>` の型制約はそのまま（trate の `AsrBackend` が `Send` を継承するため充足）
- `crates/voiput/src/lib.rs` の `pub use pipeline::streamer::AsrBackend` を `pub use trate::AsrBackend` に置き換え（互換性維持）

### 実施しないこと

- OpenAIBackend の impl 修正（M3-3）
- streamer.rs 内の MockBackend（M3-4）
- binary/test-run.rs の MockStreamerBackend（M3-4）

## Investigation

### ストリーマーの現状

`streamer.rs` L64-72 に `AsrBackend: Send` トレイト（5 メソッド）が定義されている。これを削除し `use trate::AsrBackend;` で置き換える。

`AsrBackend` を参照している箇所:
- `streamer.rs:78` — `BackendWrapper<B: AsrBackend + Send + 'static>`
- `streamer.rs:201` — `PseudoAsrStreamer<B: AsrBackend + Send + Sync + 'static>`
- `streamer.rs:226` — impl ブロック
- `streamer.rs:602` — unsafe impl Send
- `streamer.rs:612` — MockBackend impl（テスト、M3-4）

### lib.rs の現状

L75-77: `pub use pipeline::streamer::{AsrBackend, BackendWrapper, PseudoAsrStreamer, StreamerConfig, StreamerEvent, StreamerLocale};`

これを:
```rust
pub use pipeline::streamer::{BackendWrapper, PseudoAsrStreamer, StreamerConfig, StreamerEvent, StreamerLocale};
pub use trate::AsrBackend;
```
に変更する。

### 依存チケット

- M3-1 (#106): ✅ reviewed（voiput → trate 依存）
- M3-3: 後続（OpenAIBackend impl 修正）

## Test Plan

本チケットでは既存テストの修正は行わない。`cargo check` で streamer.rs 関連のコンパイル成功を確認する（OpenAIBackend のエラーは許容）。

## Boy Scout Rule — 翻訳可能性計画

トレイト定義の移行に伴い、コメントを適切に更新する。

## Acceptance Criteria

- [ ] `streamer.rs` から `AsrBackend` トレイト定義が削除されていること
- [ ] `streamer.rs` に `use trate::AsrBackend;` が追加されていること
- [ ] `lib.rs` の `pub use` が `pub use trate::AsrBackend` に更新されていること
- [ ] streamer.rs 関連のコンパイルが成功すること（OpenAIBackend のエラーは許容）
- [ ] 外部から `voiput::AsrBackend` が利用可能であること

## Notes

### 実装フラグメント

`streamer.rs` から削除:
```rust
pub trait AsrBackend: Send {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    fn post_correct(&mut self, text: &str) -> Result<String>;
    fn model_name(&self) -> String;
    fn record_asr_usage(&mut self, duration_ms: u64);
    fn insert_punctuation(&mut self, text: &str, _locale: &StreamerLocale) -> Result<String> {
        Ok(text.to_string())
    }
}
```

`streamer.rs` に追加（トレイト削除箇所に）:
```rust
use trate::AsrBackend;
```

`lib.rs` の変更:
```rust
// 変更前:
pub use pipeline::streamer::{AsrBackend, BackendWrapper, PseudoAsrStreamer, ...};
// 変更後:
pub use pipeline::streamer::{BackendWrapper, PseudoAsrStreamer, ...};
pub use trate::AsrBackend;
```

### 依存関係

- **先行実装必須**: M3-1 (#106) ✅ reviewed
- **後続**: M3-3 (OpenAIBackend 修正), M3-4 (テストコード移行)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M3-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2.2, Appendix B)
