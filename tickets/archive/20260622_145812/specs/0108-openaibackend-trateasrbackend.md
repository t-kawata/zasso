---
ticket_id: 108
title: OpenAIBackend の trate::AsrBackend 実装スタブ除去
slug: openaibackend-trateasrbackend
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0108-openaibackend-trateasrbackend/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0108-openaibackend-trateasrbackend/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0108-openaibackend-trateasrbackend/review.md
---
# OpenAIBackend の trate::AsrBackend 実装スタブ除去

## Summary

`crates/voiput/src/backends/openai.rs` から、M3-2 レビューで残された `[::STUB::]` スタブ（`#[allow(dead_code)] fn model_name()`）を削除する。

## Background

M3-2 のレビュー時に `OpenAIBackend` の `impl AsrBackend` は `model_name()` → `backend_name()` に修正済みである。しかし、互換性維持のため `#[allow(dead_code)]` 付きの旧 `model_name()` メソッドが `[::STUB::]` として残されている。本チケットではこれを削除し、M3-3 を完了させる。

**本チケットの作業はスタブ除去 1 行のみである。**

## Scope

### 実施すること

- `crates/voiput/src/backends/openai.rs` から以下のスタブブロックを削除（L798-806）:
  ```rust
  // [::STUB::] M3-3: OpenAIBackend の impl 修正で削除する。
  #[allow(dead_code)]
  impl OpenAIBackend {
      fn model_name(&self) -> String { ... }
  }
  ```
- `cargo check` でコンパイル確認
- `cargo test --lib` で全テスト通過確認

### 実施しないこと

- OpenAIBackend 以外のファイルの修正（M3-4 で完了済み）
- テストコードの修正（M3-4 で完了済み）
- `backend_name()` の戻り値変更（`"openai-whisper"` 固定値を維持）

## Investigation

### 現在のスタブ

`crates/voiput/src/backends/openai.rs` L798-806:
```rust
// [::STUB::] M3-3: OpenAIBackend の impl 修正で削除する。
// trate 移行前の model_name() 互換性維持のため一時的に保持。
#[allow(dead_code)]
impl OpenAIBackend {
    /// 設定されたモデル名を返す（将来削除予定）。
    fn model_name(&self) -> String {
        self.openai_config.model.clone()
    }
}
```

### 既に完了していること（本チケットの前提）

| 項目 | 状態 | 対応箇所 |
|------|------|---------|
| `backend_name()` 実装 | ✅ 済 | openai.rs:788-791 |
| `model_name()` 削除 | ⬅️ **本チケット** | openai.rs:798-806 |
| MockBackend の `backend_name()` | ✅ 済 | streamer.rs:621 |
| MockStreamerBackend の `backend_name()` | ✅ 済 | binary/test-run.rs:808 |
| `StreamerLocale::as_str()` | ✅ 済 | streamer.rs:49-55 |
| `insert_punctuation` 呼び出し修正 | ✅ 済 | streamer.rs:562 |

### 依存チケット

- M3-2 (#107): ✅ reviewed（本スタブの発生元）
- 後続: M3-5 (voiput 移行完了確認)

## Test Plan

スタブ削除のみのため専用テストは不要。既存テストの回帰確認のみ。

## Boy Scout Rule — 翻訳可能性計画

スタブ除去によりコードベースの正確性が向上する。

## Acceptance Criteria

- [ ] `openai.rs` から `[::STUB::] M3-3` ブロックが削除されていること
- [ ] `cargo check` が成功すること（0 errors, 0 warnings）
- [ ] `cargo test --lib` が全通過すること

## Notes

### 依存関係

- **先行実装必須**: M3-2 (#107) ✅ reviewed
- **後続**: M3-5 (voiput 移行完了確認)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M3-3
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Appendix A)
