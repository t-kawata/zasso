---
ticket_id: 2
title: Cargo.toml feature flags 最終調整 + clippy + ドキュメント
slug: cargotoml-feature-flags-clippy
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0002-cargotoml-feature-flags-clippy/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0002-cargotoml-feature-flags-clippy/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0002-cargotoml-feature-flags-clippy/review.md
---

# Cargo.toml feature flags 最終調整 + clippy + ドキュメント

## Summary

llama-cpp-2 バックエンド移行（フェーズF）の最終工程として、Cargo.toml の feature flags 定義を確認・調整し、cargo clippy / cargo test / cargo doc を全てクリーンな状態にする。コード品質チェック合格をもって移行完了とする。

## Background

llama-cpp-2 バックエンド移行（マイルストーン M6-1〜M6-4）の全ての実装が完了した。現時点の状態を検証した結果、ビルド・clippy・テストは既に通過しているが、以下の確認・修正が必要である：

1. feature flags（cpu / metal / cuda）の定義が現状のアーキテクチャに適合しているか最終確認
2. rustdoc 警告が 2 件存在する（未クローズの HTML タグ）
3. `settings.rs` に `[::STUB::]` マーカーが残存している
4. feature flags のドキュメントが crate レベルで不足している

## Scope

- Cargo.toml feature 定義の確認と整理
- rustdoc 警告 2 件の修正
- `settings.rs` の `[::STUB::]` マーカー解決
- `cargo clippy --all-features -- -D warnings` 通過確認
- `cargo test` 全通過確認
- `cargo doc --no-deps` 成功確認
- feature flags に関する crate ドキュメント補完

## Non-scope

- ロジックの変更やバグ修正（別チケット）
- 新規 feature の追加
- GPU バックエンド（metal / cuda）の実機動作確認（ハードウェア依存のため別環境）

## Investigation

### 現状の feature flags 定義（Cargo.toml）

```toml
[features]
default = ["cpu"]
cpu = []
metal = []
cuda = []
```

- `cpu` は実質空の feature（デフォルト選択のマーカーとして機能）
- `metal` と `cuda` は `build.rs` でのみ参照：
  - `build.rs:52` → `#[cfg(feature = "metal")]` → `LLAMA_METAL=ON`
  - `build.rs:58` → `#[cfg(feature = "cuda")]` → `LLAMA_CUDA=ON`
- ソースコード（`src/`）内に `#[cfg(feature = ...)]` の使用はなし
- 現状の定義で十分であり、追加・削除の必要はない

### ビルド・clippy 検証結果

| コマンド | 結果 |
|---------|------|
| `cargo build` (default = cpu) | ✅ 成功 |
| `cargo clippy --all-features -- -D warnings` | ✅ 0 warnings |
| `cargo clippy --features=cpu -- -D warnings` | ✅ 0 warnings |

### テスト結果

| テストカテゴリ | 結果 |
|---------------|------|
| Unit tests（187 tests） | ✅ 187 passed, 0 failed |
| Integration tests（2 tests） | ✅ 2 passed, 0 failed |
| **合計** | **189 passed, 0 failed** |

### doc 警告（2件）

```
warning: unclosed HTML tag `ModelInfo`
  --> src/registry.rs:2:28
     |
   2 | //! RwLock<Vec<ModelInfo>> を用いた...
     |                            ^^^^^^^^^
     help: try marking as source code
     |
   2 | //! `RwLock<Vec<ModelInfo>>` を用いた...
     |       +                   +

warning: unclosed HTML tag `LlamaModel`
  --> src/registry.rs:47:33
     |
  47 | /// 「...状態（Arc<LlamaModel>）」を...
     |                               ^^^^^^^^^^^
     help: help: try marking as source code
```

**原因**: Rustdoc は `<>` を HTML タグとして解釈する。ジェネリクス型をバッククォートで囲んでいないため、`ModelInfo` や `LlamaModel` が HTML タグ名と誤認識される。

### [::STUB::] マーカー

`src/consts/settings.rs:19` に `[::STUB::] dead_code 抑制の理由` と記載されたコメントがある。内容は「各定数がどのチケットで使用済みか」の参照状況を記録したもので、実装上は既に全て使用済み（実際にコードから参照されている）。よってマーカーは不要 —— コメント自体は有用なので `[::STUB::]` マーカーのみ削除する。

### 犯罪スキャン（Malfeasance）

0 records — clean。

### スタブスキャン

1件: `/Users/kawata/shyme/zasso/crates/ggufrs/src/consts/settings.rs:19`（上記のマーカーと同一）

## Test Plan

### 検証項目（テストコードは既存のものを使用）

本チケットはテストコードの新規追加ではなく、既存コードのクリーンアップが主目的である。
以下の検証手順で品質を確認する：

| # | 検証内容 | コマンド | 期待結果 |
|---|---------|---------|---------|
| 1 | CPU モードビルド | `cargo build` | 成功 |
| 2 | 全 feature clippy | `cargo clippy --all-features -- -D warnings` | 0 warnings |
| 3 | CPU feature clippy | `cargo clippy --features=cpu -- -D warnings` | 0 warnings |
| 4 | 全テスト | `cargo test` | 189 passed |
| 5 | ドキュメント | `cargo doc --no-deps` | 成功、0 warnings |

### ユニットテスト不可能な項目（例外）

- 該当なし（全ての検証は上記コマンドで確認可能）

## Boy Scout Rule — 翻訳可能性計画

1. **settings.rs `[::STUB::]` マーカー除去**: 既に解決済み（全定数が使用済み）のためマーカーを削除。ただしコメント自体（各定数の参照状況）は維持して翻訳可能性を高める。
2. **registry.rs rustdoc 修正**: `<>` 内の型名をバッククォートで囲み、ドキュメントの翻訳可能性（可読性）を確保する。これは「書いたコードが正しく解釈される」という可読性の基本要件。
3. **翻訳可能性チェック**: 変更対象はコメント行のみであり、ロジックの翻訳可能性に影響を与えない。

## Acceptance Criteria

- [ ] Cargo.toml feature 定義が現状のアーキテクチャに適合している
- [ ] `cargo clippy --all-features -- -D warnings` が 0 warnings で通過する
- [ ] `cargo clippy --features=cpu -- -D warnings` が 0 warnings で通過する
- [ ] `cargo test` が全 189 tests 通過する
- [ ] `cargo doc --no-deps` が 0 warnings で成功する
- [ ] `settings.rs` の `[::STUB::]` マーカーが除去されている
- [ ] registry.rs の rustdoc 警告が修正されている

## Notes

### 依存・関連チケット

- **先行**: M6-13（test-run + 実動作確認）— ✅ 完了
- **後続**: なし（最終マイルストーン）
- **参照**: RFC.md §2.1 Cargo.toml, §2.3 GPU 自動検出

### 成果物

- 計画: context/0002-cargotoml-feature-flags-clippy/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0002-cargotoml-feature-flags-clippy/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0002-cargotoml-feature-flags-clippy/review.md（未作成、/review-ticket 全チェック通過後に作成）
