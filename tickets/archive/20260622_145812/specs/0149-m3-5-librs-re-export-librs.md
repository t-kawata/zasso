---
ticket_id: 149
title: "M3-5: lib.rs 統合・re-export 実装 (lib.rs)"
slug: "m3-5-librs-re-export-librs"
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0149-m3-5-librs-re-export-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0149-m3-5-librs-re-export-librs/review.md
---
# M3-5: lib.rs 統合・re-export 実装 (lib.rs)

## Summary

`lib.rs` の公開APIを完成させる。解決済みの STUB コメントを除去し、全公開型を `pub use` で re-export する。
crate 利用者は `use ggufrs::*` で全機能にアクセス可能になる。

## Background

### 設計上の位置づけ

crate の公開APIを統一的に提供する最終チケット。crate 利用者が `ggufrs` だけを依存関係に追加すればよく、
mistralrs を直接依存に追加する必要をなくす。

### 現在の実装状況（lib.rs）

| 行 | 内容 | 状態 |
|----|------|------|
| L21-23 | `pub mod config; consts; error;` | ✅ 完了 |
| L25-26 | `// [::STUB::] M2-1 で InferenceEngine を実装` + `pub mod inference;` | 🔧 STUB残（既に実装済み） |
| L28-29 | `// [::STUB::] M2-2 で ModelRegistry を実装` + `pub mod registry;` | 🔧 STUB残（既に実装済み） |
| L31-32 | `// [::STUB::] M4-1 で server モジュールを実装` + `pub mod server;` | ⏳ 別チケット |
| L34-38 | `pub use mistralrs::{Constraint, RequestBuilder, Response};` | ✅ M3-2 先行対応 |
| L39 | `// [::STUB::] M3-5 で残りの型を追加` | 🔧 M3-5 で解決 |
| L61-63 | `#[allow(dead_code)]` + `server_handle` | ⏳ M4-2 で解決 |
| L88-132 | テストコード | ✅ 完了 |

### このチケットの必要性

M3 マイルストーン完了の最終チケット。公開APIが整備されていないと crate 利用者が使いづらく、
`cargo doc` の出力も不完全になる。

## Scope

### 実装するもの

1. **解決済み STUB コメントの除去**
   - `// [::STUB::] M2-1 で InferenceEngine トレイトを実装` → 削除（M2-1 完了済み）
   - `// [::STUB::] M2-2 で ModelRegistry を実装` → 削除（M2-2 完了済み）

2. **mistralrs 型の re-export 完全化**
   - `Model` — モデル型（`GgufEngine::registry.get()` の戻り値）
   - `ChatCompletionResponse` — `send_raw()` の戻り値に含まれる
   - `SamplingParams` — mistralrs の生成パラメータ（低レベルAPI用）
   - `TextMessages`, `TextMessageRole` — メッセージ構築用（RFC の使用例で必要）

3. **ggufrs 公開型の re-export**
   - `GgufEngine` — エントリポイント（既に crate ルートにある）
   - `InferenceEngine`, `GenerateParams` — トレイトとパラメータ
   - `GgufConfig`, `ModelConfig`, `ServerConfig`, `GpuConfig`, `GpuProvider`, `ConfigLayer` — 設定型
   - `ModelRegistry`, `ModelInfo` — レジストリ型
   - `GgufError` — エラー型

4. **`// [::STUB::] M3-5 で残りの型を追加` の除去**

### 実装しないもの

- `server` モジュールの STUB — M4-1 で解決（server は未実装のため STUB 維持）
- `server_handle` の `#[allow(dead_code)]` — M4-2 で解決
- モジュール構成の変更

## Investigation

### ソースコード調査結果

#### 現在の lib.rs の構造

`crates/ggufrs/src/lib.rs` (全133行):

| セクション | 行 | 備考 |
|-----------|-----|------|
| crate ドキュメント | L1-14 | ✅ 適切 |
| モジュール宣言 | L20-32 | 2つのSTUBが解決済み |
| mistralrs re-export | L34-39 | 未完了（3型のみ→全型へ） |
| GgufEngine 構造体 | L41-64 | ✅ 完了 |
| GgufEngine impl | L66-86 | ✅ 完了 |
| テスト | L88-132 | ✅ 完了 |

#### STUB 状態

```
lib.rs:25 — [::STUB::] M2-1 → M3-5 で削除（M2-1 完了済み）
lib.rs:28 — [::STUB::] M2-2 → M3-5 で削除（M2-2 完了済み）
lib.rs:31 — [::STUB::] M4-1 → 保留（サーバー未実装）
lib.rs:39 — [::STUB::] M3-5 → M3-5 で削除
```

### 依存チケット状態

- M2-1 (InferenceEngine): ✅ 完了
- M2-2 (ModelRegistry): ✅ 完了
- M3-2 (generate): ✅ 完了
- M3-3 (generate_stream): ✅ 完了
- M3-4 (send_raw): ✅ 完了

## Test Plan

### ユニットテスト計画

lib.rs の変更は re-export とコメントのみであり、コンパイル検証で十分。

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1 | 全テスト回帰 | 回帰 | `cargo test --lib` 136件通過 |
| 2 | コンパイル検証 | 正常 | `cargo check --lib` |

### ユニットテスト不可能な項目（例外）

なし。全てコンパイル検証でカバー可能。

## Boy Scout Rule — 翻訳可能性計画

- 解決済みSTUBコメントのクリーンアップ
- re-export のコメントは日本語で「なぜこの型が公開されているか」を説明
- `M3-5 で残りの型を追加` コメントを削除

## Acceptance Criteria

- [ ] `[::STUB::] M2-1` コメントが削除されている
- [ ] `[::STUB::] M2-2` コメントが削除されている
- [ ] `[::STUB::] M3-5` コメントが削除されている
- [ ] `[::STUB::] M4-1` は維持されている（未完了のため）
- [ ] 全 mistralrs 主要型が `pub use` で re-export されている
- [ ] 全 ggufrs 公開型が `pub use` で re-export されている
- [ ] `cargo check --lib` が通過する
- [ ] `cargo test --lib` 136件が通過する
- [ ] `cargo doc --no-deps` が成功する

## Notes

- M3-5 は実装変更のない「クリーンアップ」チケット
- 依存: M3-2 ✅, M3-3 ✅, M3-4 ✅
- 後続: M4-1（サーバールーター）、M4-2（サーバー統合）

### 成果物

- 計画: context/0149-m3-5-librs-re-export-librs/plan.md（未作成）
- 実装サマリ: context/0149-m3-5-librs-re-export-librs/implementation.md（未作成）
- レビュー報告書: context/0149-m3-5-librs-re-export-librs/review.md（未作成）
