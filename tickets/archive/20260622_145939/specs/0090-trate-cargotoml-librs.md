---
ticket_id: 90
title: trate Cargo.toml + lib.rs の作成
slug: trate-cargotoml-librs
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0090-trate-cargotoml-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0090-trate-cargotoml-librs/review.md
---
# trate Cargo.toml + lib.rs の作成

## Summary

voiput crate 内部に閉じていた `AsrBackend` トレイトを外部クレートから実装可能にするため、新規 crate `trate` を作成する。本チケットではその骨格（Cargo.toml + 空の lib.rs）のみを作成する。

## Background

### 現状の課題

voiput の音声認識バックエンド抽象化トレイト `AsrBackend` は `crates/voiput/src/pipeline/streamer.rs` に `pub` トレイトとして定義されているが、voiput crate の内部型（`StreamerLocale`）に依存しており、外部クレートから実装することが事実上不可能である。

RFC のアーキテクチャでは、この抽象化部分を独立した crate `trate` に抽出し、以下の設計を実現する：

1. **trate**: 純粋なトレイト定義のみ（`AsrBackend`, `LocalAsrBackend`）。外部依存は `anyhow` のみ。
2. **voiput**: `trate` のトレイトを実装する既存バックエンド（OpenAIBackend）＋新規ローカルバックエンド（Qwen3AsrBackend）＋パイプライン
3. **外部クレート**: `trate` のトレイトを実装することで、独自の ASR バックエンドを voiput パイプラインに統合可能

### プロジェクト構成の注意点

**本プロジェクトは cargo workspace を使用していない。** `src-tauri/Cargo.toml` がメインパッケージであり、`crates/` 配下の各 crate は独立した Cargo.toml を持つ。`make check-be` は `cargo check --manifest-path src-tauri/Cargo.toml` として動作するため、trate（および voiput）はこのターゲットに含まれない。trate のビルド検証は `cargo check --manifest-path crates/trate/Cargo.toml` で個別に行う。

```
crates/
├── trate/        # NEW: 本チケットで作成
├── voiput/       # 依存先（M3-1 で trate への依存追加）
├── procreg/      # 既存 crate（参考）
├── siprs/        # 既存 crate
└── dummy/        # 既存 crate
```

## Scope

### 実施すること

1. `crates/trate/Cargo.toml` を作成する（`anyhow` のみ依存）
2. `crates/trate/src/lib.rs` を作成する（空ファイル、または最小限のコメントのみ）
3. `cargo check --manifest-path crates/trate/Cargo.toml` でコンパイル確認
4. 依存関係が `anyhow` のみであることを `cargo tree` で確認

### 実施しないこと

- `AsrBackend` / `LocalAsrBackend` トレイトの実装（M1-1, M1-2）
- voiput の `Cargo.toml` への trate 依存追加（M3-1）
- ワークスペースルート Cargo.toml の作成（プロジェクトに workspace は存在しない）
- `make check-be` ターゲットの拡張（trate 単独は個別に検証する）
- voiput 既存コードの trate 移行（M3-2 以降）

## Investigation

### プロジェクト構成の証拠

- **`make check-be` の実体**: `Makefile` L83
  ```
  check-be:
      EDITION_SLUG=$(EDITION) cargo check --manifest-path src-tauri/Cargo.toml
  ```
  このターゲットは `src-tauri/Cargo.toml` のみをチェックする。trate はこの依存ツリーに含まれないため、`make check-be` では検証されない。

- **`src-tauri/Cargo.toml` の依存関係**: `process-registry` のみが path 依存として登録。voiput と siprs は含まれていない。

- **既存 crate の独立構成**: `crates/procreg/Cargo.toml` は `[package]` のみで workspace に属さない独立した crate として動作。trate もこれと同様の構成とする。

- **trate 作成先ディレクトリ**: `crates/trate/` — 既存 crate と同一階層

### 既存 crate の Cargo.toml からのパターン抽出

`crates/procreg/Cargo.toml`（最小構成の参考例）:
```toml
[package]
name = "process-registry"
version = "0.1.0"
edition = "2021"
description = "..."

[dependencies]
anyhow = "1.0.102"
# ...
```

trate は `anyhow` のみに依存するため、procreg よりさらにシンプルな構成となる。

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/voiput/ crates/trate/` → 該当コードなし（trate は未作成のため）

### 依存チケットの存在確認

- M1-1, M1-2（AsrBackend / LocalAsrBackend トレイト定義）: 未作成（本チケットの後続）
- M3-1（voiput → trate 依存追加）: 未作成（本チケットの依存先）
- 循環依存: なし。M0-1 → M1-1 → M3-1 の逐次依存

## Test Plan

### ユニットテスト計画

本チケットの実装スコープは Cargo.toml + 空 lib.rs の作成のみであり、Rust のテストコードは存在しない。検証はビルドと依存関係ツリーの確認で代用する：

1. **正常系**: `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
2. **正常系**: `cargo tree --manifest-path crates/trate/Cargo.toml` に `anyhow` のみが表示されること
3. **異常系確認**: trate が `sherpa-onnx` や `tokio` に依存していないこと（`cargo tree` で確認）

### ユニットテスト不可能な項目（例外）

なし（Cargo.toml と空 lib.rs はビルド成功のみで検証可能）

## Boy Scout Rule — 翻訳可能性計画

本チケットで作成するファイルは最小限（Cargo.toml + 空 lib.rs）であり、翻訳可能性の改善対象となるコードは存在しない。後続チケット（M1-1, M1-2）でトレイト定義を追加する際に、トレイト名・メソッド名が「実行可能な散文」として読めることを確認する：

- `AsrBackend`（「ASR バックエンド」＝音声認識バックエンドとして自然）
- `transcribe(samples)`（「サンプルを書き起こす」＝動詞句として自然）
- `backend_name()`（「バックエンド名を返す」＝説明的）

## Acceptance Criteria

- [ ] `crates/trate/Cargo.toml` が作成され、`anyhow = "1"` のみを依存として持つこと
- [ ] `crates/trate/src/lib.rs` が作成されていること（空でも可）
- [ ] `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
- [ ] `cargo tree --manifest-path crates/trate/Cargo.toml` に `anyhow` のみが表示されること
- [ ] trate に `sherpa-onnx` 等の不要な依存が含まれていないこと
- [ ] 後続チケット（M1-1, M1-2）が trate crate を参照可能であること（コンパイル確認）

## Notes

### 成果物

- 計画: context/0090-trate-cargotoml-librs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0090-trate-cargotoml-librs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0090-trate-cargotoml-librs/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 依存関係

- **先行実装必須**: なし（プロジェクト初の trate 関連チケット）
- **後続**: M1-1（AsrBackend トレイト定義）— 本チケット完了後に trate crate へトレイトを追加する
- **後続**: M1-2（LocalAsrBackend トレイト定義）— 同上
- **後続**: M3-1（voiput → trate 依存追加）— 本チケット完了後に voiput が trate を参照可能になる
- **並列可能**: 既存の voiput 型定義チケット（M2 群）— trate とは独立しているため並行作業可能

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1 — crates/trate/ ディレクトリ構成、§12 — 依存関係)
