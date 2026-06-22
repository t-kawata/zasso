---
ticket_id: 192
title: M6-11: Cargo.toml + build.rs 修正 — 依存差し替え + cmake + 4モデルDL
slug: cargotoml-buildrs-cmake-4dl
status: reviewed
dependencies: "191"
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0192-cargotoml-buildrs-cmake-4dl/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0192-cargotoml-buildrs-cmake-4dl/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0192-cargotoml-buildrs-cmake-4dl/review.md
---

# M6-11: Cargo.toml + build.rs 修正 — 依存差し替え + cmake + 4モデルDL

## Summary

llama-cpp-2 バックエンド移行のビルド基盤を整備する。Cargo.toml から mistralrs / llm-bridge-core を削除し gbnf を追加する。build.rs に cmake フラグ制御（LLAMA_METAL / LLAMA_CUDA）を追加し、モデルファイルを UQFF から GGUF に差し替える。settings.rs の未使用定数 DEFAULT_SW_PORT を削除し、config.rs の Gemma4 モデルパスも GGUF に更新する。

## Background

フェーズF（llama-cpp-2 バックエンド移行）の完了に向け、Cargo.toml と build.rs の修正が必要である。

- **M6-10（#191）** で lib.rs の mistralrs re-export は削除済みだが、Cargo.toml には mistralrs / llm-bridge-core が残存している。
- **llama-cpp-2** は cmake ベースのビルドシステムを持ち、GPU バックエンドの選択は cargo feature → cmake 環境変数（LLAMA_METAL / LLAMA_CUDA）で制御する。現在の build.rs にはこの制御がなく、cmake フラグ未設定のままビルドが行われてしまう。
- **build.rs の Gemma4 モデル** は UQFF 形式でダウンロードしているが、llama-cpp-2 は UQFF をサポートしないため GGUF 形式に差し替えが必要。
- **settings.rs の DEFAULT_SW_PORT** は静的コンテンツサーバー用だが、llama-cpp-2 移行後はこの機能が不要となった。
- **config.rs の Gemma4 モデルパス** が UQFF パスを指したままでは build.rs でダウンロードする GGUF ファイルと不整合を起こすため、同時に更新する。

**コンパイル復旧の最終関門**: `cargo check --all-targets` 完全成功をもって本チケットの終了とする。gbnf::convert の未解決参照エラーを含む一切のコンパイルエラーを本チケットで解消し、M6-14（feature flags 最終調整）以降に先送りしない。

## Investigation

### 現状の Cargo.toml（crates/ggufrs/Cargo.toml）

```toml
[dependencies]
mistralrs = { version = "0.8.1", default-features = false }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }
axum = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
futures = "0.3"
thiserror = "2"
anyhow = "1"
async-trait = "0.1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter"] }
llm-bridge-core = "0.2"
llama-cpp-2 = "0.1.150"
tokio-stream = "0.1.18"

[dev-dependencies]
mockall = "0.14.0"
tower = "0.5"
reqwest = { version = "0.12", features = ["json"] }

[features]
default = ["cpu"]
cpu = []
metal = ["mistralrs/metal"]
cuda = ["mistralrs/cuda"]
gbnf_integration = []
```

**削除 / 追加する依存:**

| 依存 | 操作 | 理由 |
|------|------|------|
| `mistralrs = "0.8.1"` | 削除 | llama-cpp-2 に置き換え済み。Cargo.toml に残存 |
| `llm-bridge-core = "0.2"` | 削除 | Anthropic 変換は M6-9 で廃止。Cargo.toml に残存 |
| `gbnf = "0.2.7"` | 追加 | generate_structured 用 JSON Schema → GBNF 変換（RFC §2.1） |
| `llama-cpp-2 = "0.1.150"` | 維持 | 本バックエンド。すでに追加済み |
| `tokio-stream = "0.1.18"` | 維持 | inference/stream.rs で ReceiverStream 使用中 |

**features 再編:**

| 現在 | 変更後 | 理由 |
|------|--------|------|
| `metal = ["mistralrs/metal"]` | `metal = []` | llama-cpp-2 は cargo feature ではなく cmake 環境変数で GPU 制御 |
| `cuda = ["mistralrs/cuda"]` | `cuda = []` | 同上 |
| `gbnf_integration = []` | 削除 | gbnf が直接依存になったため。Cargo.toml 行61のスタブも解決 |

### 現状の build.rs（crates/ggufrs/build.rs）

**不足している cmake フラグ制御:**
llama-cpp-2 の build.rs は cmake を呼び出して llama.cpp の C++ ソースをコンパイルする。GPU バックエンドを有効化するには、ggufrs の build.rs が cargo feature に応じて環境変数を設定する必要がある（RFC §8.1）。

**MODEL_FILES の差し替え（RFC §8.2）:**

| 現状（UQFF） | 変更後（GGUF） |
|------|--------|
| `gemma4-e2b-uqff/q4k-0.uqff` | `gemma-4-E2B-it-Q4_K_M.gguf` |
| `gemma4-e4b-uqff/q4k-0.uqff` | `gemma-4-E4B-it-Q4_K_M.gguf` |

Qwen3.5 の2モデルは GGUF のまま変更なし。

### 現状の settings.rs（crates/ggufrs/src/consts/settings.rs）

**DEFAULT_SW_PORT（行41）**:
- `pub(crate) const DEFAULT_SW_PORT: u16 = 3911;` — llama-cpp-2 移行後は静的コンテンツサーバー不要
- 行25コメントに「DEFAULT_SW_PORT: M4 以降で使用予定 ⏳」と記載あり
- テスト: `default_sw_port_is_in_user_range()`（行99-105）
- テスト: `ports_are_distinct()` で DEFAULT_SW_PORT を参照（行108-113）

**consts/mod.rs（行22）**:
- `pub(crate) use settings::DEFAULT_SW_PORT;` — 削除

### 現状の config.rs（crates/ggufrs/src/config.rs）

Gemma4 モデルパスが UQFF を指している（RFC §8.2 のダウンロード先と不一致）:

| メソッド | 現状の model_path | 変更後 |
|---------|-------------------|--------|
| `gemma4_e2b()`（行235） | `models/gemma4-e2b-uqff/q4k-0.uqff` | `models/gemma-4-E2B-it-Q4_K_M.gguf` |
| `gemma4_e4b()`（行251） | `models/gemma4-e4b-uqff/q4k-0.uqff` | `models/gemma-4-E4B-it-Q4_K_M.gguf` |

### 依存関係の確認

| 関係 | ID | タイトル | ステータス |
|------|-----|---------|----------|
| 先行実装必須 | #191 | M6-10: lib.rs 修正 — mistralrs re-export 削除 + server::types 追加 | reviewed |
| 先行推奨 | (M6-3) | config.rs + settings.rs 修正 — mistralrs 特化フィールド除去 | ✅ 完了 |
| 後続 | M6-12 | テストコード修正 — MockEngine + 結合テスト | draft (#190) |
| 後続 | M6-13 | test-run + 実動作確認 | 未作成 |
| 後続 | M6-14 | Cargo.toml feature flags 最終調整 + clippy + ドキュメント | 未作成 |

M6-3 完了確認: settings.rs の `#![allow(dead_code)]` コメントに「DEFAULT_SW_PORT: M4 以降で使用予定」の記載が残っており、削除は M6-3 のスコープ外として未実施。本チケットで削除する。

### 犯罪の点検

```bash
.claude/scripts/tickets/scan-crimes.sh  # → 未解決の犯罪なし（0件）
```

Cargo.toml 行61に既存のスタブあり:
```
# [::STUB::] M6-11: gbnf クレートが Cargo.toml に追加されたら gbnf の feature 依存を追加する
```
本チケットで解決する: gbnf = "0.2.7" を直接依存として追加し、gbnf_integration feature を削除するため、このスタブは不要となる。

## Scope

### 実装範囲（In Scope）

1. **Cargo.toml** — 依存差し替えと features 再編
2. **build.rs** — cmake フラグ制御追加、MODEL_FILES 差し替え
3. **settings.rs + consts/mod.rs** — DEFAULT_SW_PORT 削除
4. **config.rs** — Gemma4 モデルパス GGUF 更新

### 非対象（Out of Scope）

- server/ 配下の変更（M6-9 で完了済み）
- inference/ 配下の変更（M6-5/M6-6/M6-7 で完了済み）
- registry.rs の修正（M6-4 で完了済み）
- テストコードの修正（M6-12 相当）
- test-run.rs の修正（M6-13）
- clippy 警告修正（M6-14）

## Test Plan

### ユニットテスト計画

本チケットはビルド基盤の変更であり新規ロジックを追加しない。以下の検証で十分とする:

1. **`cargo check --all-targets` 成功（最重要）**
   - `cargo check --lib` + `cargo check --tests` + `cargo check --bin test-run`
   - gbnf::convert の未解決参照を含む一切のコンパイルエラーを許さない

2. **`cargo tree` で mistralrs / llm-bridge-core 不在確認**
   ```bash
   cargo tree | grep -E "mistralrs|llm-bridge-core" && echo "FAIL: still present"
   ```

3. **既存ユニットテスト通過**
   - `cargo test --lib` — settings.rs のテスト群は DEFAULT_SW_PORT 削除に伴い修正

4. **GPU feature ビルド確認**
   - macOS: `cargo check --features metal`
   - CUDA 環境: `cargo check --features cuda`

### ユニットテスト不可能な項目（例外）

- build.rs の cmake フラグ設定が llama-cpp-2 のビルドに反映されるかの直接確認 — llama-cpp-2 内部ビルドプロセスのため不可。`cargo build` 成功で間接確認する。
- MODEL_FILES ダウンロード成功確認 — ネットワーク依存のため不可。`cargo build` 時の警告出力で確認。

## Acceptance Criteria

- [ ] `cargo check --all-targets` が完全に成功する（本条件が最優先）
- [ ] `cargo check --features metal` が成功する（macOS 環境）
- [ ] `cargo check --features cuda` が成功する（CUDA 環境があれば）
- [ ] `cargo tree` で mistralrs / llm-bridge-core が出力されない
- [ ] `cargo tree` で gbnf = "0.2.7" が出力される
- [ ] `cargo test --lib` が全テスト通過する
- [ ] Cargo.toml の features: metal/cuda が空リスト、gbnf_integration が削除されている
- [ ] Cargo.toml の description が mistralrs 非依存の記述に更新されている
- [ ] build.rs に LLAMA_METAL / LLAMA_CUDA 環境変数設定が追加されている
- [ ] build.rs の MODEL_FILES が4つ全て GGUF 形式（Gemma4 が UQFF → GGUF）
- [ ] settings.rs から DEFAULT_SW_PORT 定数と関連テストが削除されている
- [ ] config.rs の Gemma4 モデルパスが GGUF パスに更新されている
- [ ] 新たな `[::STUB::]` マーカーを発生させていない
- [ ] 既存 `[::STUB::] M6-11: gbnf クレートが...` が解決されている

## 依存・関連チケット

| 関係 | ID | タイトル | ステータス |
|------|-----|---------|----------|
| 先行実装必須 | #191 | M6-10: lib.rs 修正 — mistralrs re-export 削除 + server::types 追加 | reviewed |
| 先行推奨 | (M6-3) | config.rs + settings.rs 修正 — mistralrs 特化フィールド除去 | ✅ 完了 |
| 後続 | M6-12 | テストコード修正 — MockEngine + 結合テスト | draft (#190) |
| 後続 | M6-13 | test-run + 実動作確認 | 未作成 |
| 後続 | M6-14 | Cargo.toml feature flags 最終調整 + clippy + ドキュメント | 未作成 |

## Boy Scout Rule — 翻訳可能性計画

1. **build.rs コメント更新**: UQFF / mistralrs への言及を削除し、llama-cpp-2 / GGUF 用の中立的記述に更新する。cmake フラグ設定ブロックには「なぜこの環境変数が必要か」を日本語コメントで記述する。

2. **config.rs コメント更新**: Gemma4 モデルパス変更に伴い「mistralrs v0.8.1 でサポートが確認された」→ llama-cpp-2 用の中立的記述に更新する。

3. **Cargo.toml description 更新**: 「mistralrs をバックエンドとして」→ バックエンドを特定しない記述に変更（lib.rs は M6-10 で既に更新済み）。

4. **スタブ解決**: Cargo.toml 行61の `[::STUB::] M6-11: gbnf クレートが...` を本チケットで解決する。

## 実装手順（推奨順序）

1. **settings.rs**: DEFAULT_SW_PORT 削除 → consts/mod.rs re-export 削除 → テスト修正
2. **Cargo.toml**: mistralrs/llm-bridge-core 削除、gbnf 追加、features 再編、description 更新
3. **build.rs**: cmake 環境変数設定追加、MODEL_FILES 差し替え、コメント更新
4. **config.rs**: Gemma4 モデルパス更新、コメント更新
5. **検証**: `cargo check --all-targets` → `cargo test --lib` → `cargo tree`

## Notes

### 成果物

- 計画: context/0192-cargotoml-buildrs-cmake-4dl/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0192-cargotoml-buildrs-cmake-4dl/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0192-cargotoml-buildrs-cmake-4dl/review.md（未作成、/review-ticket 全チェック通過後に作成）

### llama-cpp-2 v0.1.150 の build.rs 挙動確認

本チケット実装前に、llama-cpp-2 v0.1.150 の build.rs が環境変数 LLAMA_METAL / LLAMA_CUDA を認識するかどうかを docs.rs またはソースコードで確認すること。cargo feature 経由で cmake フラグを制御する方式であれば、それに合わせて調整する（RFC §8.1 注記）。

### モデルファイルサイズ

| モデル | 推定サイズ |
|--------|-----------|
| Qwen3.5-0.8B-Q4_K_M.gguf | ≈600MB |
| Qwen3.5-2B-Q4_K_M.gguf | ≈1.3GB |
| gemma-4-E2B-it-Q4_K_M.gguf | ≈3.1GB |
| gemma-4-E4B-it-Q4_K_M.gguf | ≈5.0GB |
