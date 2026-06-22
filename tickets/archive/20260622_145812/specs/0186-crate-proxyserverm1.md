---
ticket_id: 186
title: Crateレベル属性 + ProxyServer再公開（M#1）
slug: crate-proxyserverm1
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0186-crate-proxyserverm1/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0186-crate-proxyserverm1/review.md
---

# Crateレベル属性 + ProxyServer再公開（M#1）

## Summary

`src/lib.rs` に `#![forbid(unsafe_code)]` を始めとする crate レベル属性を設定し、unsafe コードの混入をコンパイル時に禁止する。同時に `pub use lifecycle::ProxyServer` の再公開を追加し、ライブラリ利用者が `anthropx::ProxyServer` としてサーバーを起動できるようにする。

## Background

REMAININGS.md M#1 の指摘対応。RFC02 §1 で明示された以下の crate 属性がすべて欠落しており、unsafe コードの混入を検出できない：

- `#![forbid(unsafe_code)]` — セキュリティ不変条件。全 crate で遵守すべき最優先属性
- `#![warn(rust_2024_compatibility)]` — Edition 2025（旧2024）移行準備
- `#![warn(missing_debug_implementations)]` — Debug 実装欠落の早期発見

また RFC Appendix B のライブラリ利用例が成立していない。現状のライブラリ利用者は `anthropx::lifecycle::ProxyServer` と深いパスを指定する必要があり、crate の公開 API サーフェスとして不適切である。

## Scope

- `src/lib.rs` 冒頭に以下 3 属性を追加:
  ```rust
  #![forbid(unsafe_code)]
  #![warn(rust_2024_compatibility)]
  #![warn(missing_debug_implementations)]
  ```
- `src/lib.rs` に `pub use lifecycle::ProxyServer;` を追加（`#[cfg(feature = "server")]` ガード付き）
- `#![warn(missing_docs)]` は有効化しない（段階的導入のため別チケット扱い）
- コンパイル成功確認、clippy 警告増加がないことの確認

## Non-scope

- `#![warn(missing_docs)]` の有効化と全公開アイテムへの doc コメント追加（別チケット）
- 既存コード内の Debug 実装欠落への対応（今回の警告で検出された場合は別チケットで対応）
- モジュール分割（M6-2）
- 設定検証補完（M6-3）
- Feature gate 整備（M6-5）

## Investigation

### 現在の `src/lib.rs`（実体確認）

ファイル冒頭に crate レベル属性は一切存在しない。直後のコメントブロック（doc コメント）から `pub mod` 宣言が始まっている。

```rust
//! # anthropx: LLM Bridge Proxy Server
//! ...
// src/lib.rs 先頭（L1-39）— 属性なし
pub mod cli;
pub mod config;
pub mod provider;
pub mod routing;
pub mod util;

#[cfg(feature = "server")]
pub mod app_state;
#[cfg(feature = "server")]
pub mod http;
#[cfg(feature = "server")]
pub mod lifecycle;
#[cfg(feature = "server")]
pub mod observability;

pub use config::{
    AppConfig, ConfigError, LogFormat, LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel,
};
```

確認された問題:
1. `#![forbid(unsafe_code)]` なし — unsafe コード混入を検出不可能
2. `#![warn(rust_2024_compatibility)]` なし — Edition 移行準備未実施
3. `#![warn(missing_debug_implementations)]` なし — Debug 欠落に気づけない
4. `pub use lifecycle::ProxyServer` なし — ライブラリ利用者は `anthropx::lifecycle::ProxyServer` と深いパスが必要

### 既存コード内の unsafe ブロック調査

```bash
grep -rn "unsafe" crates/anthropx/src/ --include="*.rs"
```
→ 該当なし。既存コードに unsafe ブロックは存在しない。forbid 設定による影響はない。

### 既存スタブ調査

`routing/mod.rs` に 1 件の `[::STUB::]` あり（ApiFormat 中間型、M5-2 で解決予定）。本チケットのスコープ外だが、`[::STUB::]` マーカーは適切に付与されている。

### Malfeasance 調査

未解決の犯罪は存在しない。犯罪スキャン結果: `{"count":0}`。

## Test Plan

### ユニットテスト計画

本チケットは crate レベル属性の追加と再公開行の追加のみであり、ロジックの変更を伴わない。テストは主にコンパイル検証とリンク検証が主体となる。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `forbid_unsafe_code` が有効であること | コンパイル検証 | `unsafe {}` ブロックを含むコードがコンパイルエラーになることを確認。ただしテストファイル自体に unsafe を仕込むのは現実的でないため、コンパイル成功をもって unsafe なしを確認する |
| 2 | Debug 実装欠落の警告 | コンパイル検証 | `cargo clippy` が新たな警告を出さないこと |
| 3 | `use anthropx::ProxyServer` がコンパイル可能 | リンク検証 | ライブラリ利用者が `use anthropx::ProxyServer` でアクセスできること |
| 4 | 既存テストがすべて通過 | 回帰検証 | 追加前と同一のテストスイートが通過すること |

### コンパイル・静的解析による検証（主要な検証手段）

```bash
# 1. 標準ビルド成功確認
make check-be

# 2. clippy 静的解析（新たな警告の有無）
cargo clippy --all-targets -- -D warnings

# 3. library モードでも ProxyServer が利用可能であることの確認
# （server feature 依存のため --all-features で確認）
cargo check --all-features
```

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| `#![forbid(unsafe_code)]` のコンパイル時検証 | `compiletest.rs`（compile-time test）を導入しない限り、同一クレート内で unsafe のコンパイルエラーをテストできない。代わりに `cargo build` の成功と既存コードに unsafe がないことの grep 確認で代用する |
| `pub use` の外部クレートからの検証 | 統合テストとして tests/ に外部クレート視点のテストを追加可能だが、anthropx 自体のテストで anthropx crate を extern crate として参照するには別 crate が必要。コンパイル確認で代用する |

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るのは `src/lib.rs` のみで、変更内容は以下の通り：

1. **crate レベル属性の追加**: 属性そのもの（`#![forbid(unsafe_code)]` 等）は Rust の宣言的構文であり、翻訳可能性の観点で問題なし
2. **`pub use lifecycle::ProxyServer` の追加**: 1 行の再公開追加。再公開元の `lifecycle.rs` は現状問題ない

スコープ外だが、`src/lib.rs` の doc コメントにモジュール構成図が記載されている。これは翻訳可能性を高める良い例であり、今回の変更で更新する：

- 既存のモジュール構成説明コメントに `lifecycle` と `observability` の記述がない（`#[cfg(feature = "server")]` の前にまとめて記述されているのみ）
- 今回の再公開追加に合わせて、公開 API サーフェス（`pub use`）の説明コメントを更新し、`ProxyServer` の再公開を追記する

## Acceptance Criteria

- [ ] `src/lib.rs` に `#![forbid(unsafe_code)]`、`#![warn(rust_2024_compatibility)]`、`#![warn(missing_debug_implementations)]` が追加されている
- [ ] `src/lib.rs` に `pub use lifecycle::ProxyServer` が `#[cfg(feature = "server")]` ガード付きで追加されている
- [ ] `make check-be` が成功する
- [ ] `cargo clippy --all-targets -- -D warnings` が新たな警告を出さない
- [ ] `cargo check --all-features` が成功する
- [ ] 既存の全テストが通過する（`make test`）
- [ ] `#![warn(missing_docs)]` は有効化されていない
- [ ] 公開 API サーフェスの説明コメントが更新されている
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存・関連チケット

- **先行必須**: なし（全フェーズ6中最先行）
- **後続**: M6-2（モジュール分割）、M6-3（設定検証補完）、M6-4（コード品質改善）、M6-5（Feature gate 整備）
- **参照設計書**: `crates/anthropx/RFC02.md` §1 セキュリティ属性とCrate設定

### 犯罪ステータス

- Malfeasance 未解決件数: 0
- 既存 `[::STUB::]` 件数: 1（`routing/mod.rs:24` — 本チケットスコープ外）

### 実装上注意点

`pub use lifecycle::ProxyServer` は `lifecycle` モジュールが `#[cfg(feature = "server")]` 配下であるため、再公開にも同じ feature gate が必要：

```rust
#[cfg(feature = "server")]
pub use lifecycle::ProxyServer;
```

属性の追加位置は `lib.rs` の冒頭、doc コメントの前（`//!` より前）に記述する必要がある。内包属性（`#![...]`）はモジュールの先頭、あらゆる item の前に配置する。

### 成果物

- 計画: `context/0186-crate-proxyserverm1/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0186-crate-proxyserverm1/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0186-crate-proxyserverm1/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
