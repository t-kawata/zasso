---
ticket_id: 129
title: M0-1: Cargo.toml / lib.rs プロジェクト骨格
slug: m0-1-cargotoml-librs
status: draft
created_at: 2026-06-18
updated_at: 2026-06-18
---
# M0-1: Cargo.toml / lib.rs プロジェクト骨格

## Summary

ggufrs crate のプロジェクト骨格を作成する。Cargo.toml の package 定義・全依存関係・feature flags・bin 定義、src/lib.rs のモジュール宣言と mistralrs 型 re-export の STUB 宣言、空の子モジュール群、Makefile 連携、.gitignore を確立する。

## Background

全チケットのビルド基盤である。crate の骨格を最初に確立し、以降のチケットが段階的に機能を追加できるようにする。mistralrs のバージョンは固定せず `cargo update` で追従可能な状態とし、Cargo.lock はバージョン管理対象とする。

ggufrs は以下の crate 群と同じ `crates/` ディレクトリに配置されるスタンドアロン crate であり、ワークスペース管理は行わない。

- 参照設計書: crates/ggufrs/RFC.md (§8.1 Cargo.toml, §8.3 mistralrs 型の re-export)
- 依存・関連チケットID: 全チケットの先行実装必須

## Scope

- crates/ggufrs/Cargo.toml 作成（package 定義、dependencies、features、bin）
- crates/ggufrs/src/lib.rs 作成（モジュール宣言 + mistralrs re-export の `[::STUB::]`）
- crates/ggufrs/src/consts/mod.rs 作成（空の mod 宣言）
- crates/ggufrs/src/config.rs 作成（STUB、後続チケット用）
- crates/ggufrs/src/error.rs 作成（STUB、後続チケット用）
- crates/ggufrs/src/registry.rs 作成（STUB、後続チケット用）
- crates/ggufrs/src/inference/mod.rs 作成（空の mod 宣言）
- crates/ggufrs/src/server/mod.rs 作成（空の mod 宣言）
- crates/ggufrs/src/bin/test-run.rs 作成（STUB バイナリ）
- crates/ggufrs/.gitignore 作成（/target/, /models/ を git 管理対象外に）
- Makefile に check-ggufrs ターゲット追加、check-all に統合

依存関係:
- mistralrs = "0.8.1"（default-features = false。GGUF はデフォルトでサポート）
- tokio, axum, serde, serde_json, futures, thiserror, anyhow, async-trait, tracing, tracing-subscriber
- llm-bridge-core = "0.2"（Anthropic ↔ OpenAI プロトコル変換用）

## Non-scope

- 実際のロジック実装（全モジュールは STUB）
- GgufError の定義（M0-4）
- 設定構造体の定義（M0-3, M0-5）
- ModelInfo / ModelRegistry（M0-6, M1-5, M2-2）
- InferenceEngine トレイト（M2-1）
- GgufConfig マージロジック（M1-4, M3-1）
- サーバールーター（M4-1, M4-2）
- build.rs（M5-1）
- test-run バイナリの実装（M5-2）

## Investigation

### 2026-06-18: mistralrs v0.8.1 実際の API 調査

`cargo info mistralrs` と `cargo add` の dry-run による調査で、RFC/Tickets の記述と実際の mistralrs v0.8.1 に以下の乖離を確認：

1. **`features = ["gguf"]` は存在しない**: mistralrs はデフォルトで GGUF をサポートする。`gguf` feature は不要。
2. **`directml` feature は存在しない**: mistralrs v0.8.1 の feature 一覧: `accelerate`, `cuda`, `cudnn`, `flash-attn`, `metal`, `mkl`, `nccl`, `ring`。
3. **`version = "*"` は依存解決に失敗する**: 実在する最新版 `0.8.1` に固定する。
4. **`default-features = false` は有効**: CPU-Only ビルドが可能。

証拠:
```
$ cargo info mistralrs
mistralrs v0.8.1
features: accelerate, cuda, cudnn, flash-attn, metal, mkl, nccl, ring

$ cargo add mistralrs --dry-run 2>&1
error: unrecognized feature for crate mistralrs: gguf
disabled features: accelerate, cuda, cudnn, flash-attn, metal, mkl, nccl, ring
```

この乖離は RFC.md §8.1（Cargo.toml）と Tickets.md M0-1 の記述に影響するため、RFC/Tickets の該当箇所を修正する必要がある。

### 2026-06-18: 初回ビルド結果

`cargo check --manifest-path crates/ggufrs/Cargo.toml` 成功。全 672 パッケージがロック・コンパイルされ、ggufrs v0.1.0 のビルドが通ることを確認。

依存関係ツリー（depth 1）:
```
ggufrs v0.1.0
├── anyhow v1.0.102
├── async-trait v0.1.89
├── axum v0.8.9
├── futures v0.3.32
├── llm-bridge-core v0.2.6
├── mistralrs v0.8.1
├── serde v1.0.228
├── serde_json v1.0.150
├── thiserror v2.0.18
├── tokio v1.52.3
├── tracing v0.1.44
└── tracing-subscriber v0.3.23
```

## Test Plan

### ユニットテスト計画

このチケットはプロジェクト骨格作成であり、実装ロジックを含まない。ユニットテストは以下の観点で検証する：

| 関数/モジュール | テスト内容 | 正常系 | 異常系 |
|----------------|-----------|--------|--------|
| lib.rs モジュール構造 | 全 pub mod が解決可能 | ✅ モジュール宣言 | — |
| Cargo.toml | 依存関係が解決可能 | ✅ cargo tree | — |
| Makefile check-ggufrs | ターゲットが動作 | ✅ make check-ggufrs | — |

具体的な検証コマンド：
1. `make check-ggufrs` が成功する（Makefile 連携 + 空の crate がコンパイル可能）
2. `cargo check --manifest-path crates/ggufrs/Cargo.toml` が成功する
3. `cargo tree --manifest-path crates/ggufrs/Cargo.toml --depth 1` で全依存関係が期待通り解決されている

### ユニットテスト不可能な項目（例外）

- 実際の mistralrs モデルロード（M3-2 以降で実施）
- 実際の HTTP サーバー起動（M4-2 以降で実施）
- build.rs によるモデルダウンロード（M5-1 で実施）

## Boy Scout Rule — 翻訳可能性計画

このチケットでは新規ファイルの作成のみが対象であり、既存コードに対する改修は行わない。
新規作成にあたり以下の翻訳可能性を確保する：

- **コメントは日本語で意図を説明**: 各 STUB コメントに解決先チケットIDを明記
- **モジュール名はドメイン概念を表現**: config, error, registry, inference, server と責務で分割
- **`[::STUB::]` マーカーは明示的に付与**: 解決先チケットIDを併記
- **pub use re-export はコメントで宣言のみ**: 実際のコードは M3-5 で有効化（コンパイルエラー回避）

## Acceptance Criteria

- [ ] `make check-ggufrs` が成功する
- [ ] `cargo check --manifest-path crates/ggufrs/Cargo.toml` が成功する
- [ ] `cargo tree` で全依存関係が期待通り解決されている（llm-bridge-core v0.2.6 を含む）
- [ ] Makefile に check-ggufrs が定義され、check-all に統合されている
- [ ] crates/ggufrs/.gitignore で /target/ と /models/ が git 管理対象外になっている
- [ ] 全ソースファイルに `[::STUB::]` が適切にマークされている

## Notes

### 調査で判明した RFC/Tickets の修正点

以下の乖離を調査で確認。実装と同時に crates/ggufrs/RFC.md（§8.1）と crates/ggufrs/Tickets.md（M0-1）の記述も修正することを推奨：

1. RFC §8.1: `mistralrs = { version = "*", features = ["gguf"] }` → `version = "0.8.1"`、`features = ["gguf"]` 削除
2. RFC §8.1: `directml = ["mistralrs/directml"]` → `directml` feature は mistralrs に存在しないため削除
3. Tickets.md M0-1: `--features gguf` → 削除、`version = "*"` を明記 → 調査結果に基づき実態に合わせる

### 成果物

- 計画: context/0129-m0-1-cargotoml-librs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0129-m0-1-cargotoml-librs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0129-m0-1-cargotoml-librs/review.md（未作成、/review-ticket 全チェック通過後に作成）
