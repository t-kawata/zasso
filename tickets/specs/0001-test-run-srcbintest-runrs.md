---
ticket_id: 1
title: test-run + 実動作確認 (src/bin/test-run.rs)
slug: test-run-srcbintest-runrs
aliases: 
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0001-test-run-srcbintest-runrs/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0001-test-run-srcbintest-runrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0001-test-run-srcbintest-runrs/review.md
---
# M6-13: test-run + 実動作確認 (src/bin/test-run.rs)

**元チケット参照**: Tickets.md 「チケット M6-13: test-run + 実動作確認 (src/bin/test-run.rs)」(L873-888)

## Summary

GGUF 推論エンジンの llama-cpp-2 バックエンド移行（フェーズ F）の最終動作確認として、
test-run バイナリ (`src/bin/test-run.rs`) が llama-cpp-2 API に適合していることを確認し、
`cargo run --bin test-run` で 3/3 パターンが PASS することを目視確認する。

## Background

ggufrs クレートはフェーズ A〜E で mistralrs バックエンド上に実装され、
test-run バイナリ（M5-2）は目視確認用ツールとして作成された。
しかしフェーズ F（M6 マイルストーン群）でバックエンドを llama-cpp-2 に全面的に移行したため、
test-run.rs の推論呼び出しが新しい API と整合していることを確認する必要がある。

先行チケット M6-12（テストコード修正）までで全ユニットテスト・結合テストの通過が
確認されていることを前提とし、本チケットは **実環境での目視動作確認** を主目的とする。

## 証拠（Investigation）

### 調査結果: ソースコード解析（2026-06-22）

**`src/bin/test-run.rs`（245行）** を全行解析した結果:

| チェック項目 | 状態 | 詳細 |
|------------|------|------|
| インポート | ✅ 適切 | `ggufrs::*`, `anyhow::Result`, `futures::StreamExt`, `std::time::Instant` |
| モデル指定 | ✅ llama-cpp-2 準拠 | モデル名 `gemma4-e2b`, `ModelConfig::gemma4_e2b()` 使用 |
| Pattern 1: Structured Output | ✅ API 一致 | `engine.generate_structured(name, prompt, params, schema)` → `InferenceEngine` トレイト定義一致（mod.rs L119-125） |
| Pattern 2: Text Generation | ✅ API 一致 | `engine.generate(name, prompt, params)` → `InferenceEngine` トレイト定義一致（mod.rs L99-104） |
| Pattern 3: Streaming Generation | ✅ API 一致 | `engine.generate_stream(name, prompt, params)` → `InferenceEngine` トレイト定義一致（mod.rs L139-144） |
| GgufConfig 構築 | ✅ 直接構築 | `GgufConfig { models, server, gpu }` — `from_code()` でも代替可能だが現状で問題なし |
| CPU-Only 指定 | ✅ | `GpuProvider::Cpu`, `cpu_only: true` |
| エラーハンドリング | ⚠️ 改善余地あり | 各パターンの `match` で `eprintln!("FAIL: {e}")` しているが、モデル不在時のエラーメッセージが「FAIL」表記のみで具体的な原因が不明瞭 |
| サマリー表示 | ✅ | 全パターンの PASS/FAIL + 経過時間を一覧表示 |
| セレクター引数 | ✅ | 引数なし＝全実行、引数あり＝指定パターンのみ実行 |
| モデル不在時の panic | ⚠️ 確認要 | `GgufEngine::new()` が `Result` を返すため panic はしない設計だが、実際にモデルファイル不在でテスト実行し確認が必要 |

**`src/config.rs` の関連API:**

| 関数 | 行 | シグネチャ |
|------|----|-----------|
| `ModelConfig::gemma4_e2b()` | L231 | `pub fn gemma4_e2b() -> Self` — モデル名 `gemma4-e2b`, UQFF Q4K, lazy_load: true |
| `GgufConfig::from_code()` | L339 | `pub fn from_code(models: Vec<ModelConfig>) -> Self` — デフォルトの ServerConfig + GpuConfig で初期化 |

**`src/inference/mod.rs` の InferenceEngine トレイト（L86-146）:**

| メソッド | シグネチャ | test-run での使用 |
|----------|-----------|------------------|
| `generate` | `(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String, GgufError>` | ✅ Pattern 2 |
| `generate_structured` | `(&self, model_name: &str, prompt: &str, params: GenerateParams, schema: Value) -> Result<Value, GgufError>` | ✅ Pattern 1 |
| `generate_stream` | `(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<...>>>, GgufError>` | ✅ Pattern 3 |

### 犯罪・スタブ点検結果

- **Malfeasance.json**: 未解決の犯罪なし（`count: 0`）✅
- **スタブ検出**: `src/consts/settings.rs:19` に `[::STUB::] dead_code 抑制の理由` のマーカーのみ — 本チケットのスコープ外（dead_code 管理は M6-14 で対応予定）

### 依存チケットの確認

- **先行必須: M6-12（テストコード修正）**: Tickets.md L861-873 に記載。`MockEngine + 結合テスト` の修正。完了が前提。
- 本チケットに後続処理はなし。M6-14（最終調整）が後続。

## Scope

### 実装スコープ

1. `src/bin/test-run.rs` の llama-cpp-2 API 適合確認（コードレビュー）
2. モデル不在時のエラーメッセージ改善（`FAIL` 表示 → 具体的な原因表示）
3. `cargo check --bin test-run` 成功確認
4. `cargo run --bin test-run` で 3/3 PASS 目視確認
5. モデル不在時の動作確認（panic しないこと）

### 非スコープ

- テストコードの追加（本チケットは目視確認バイナリの動作確認。ユニットテストは test-run バイナリ自体が統合テスト的役割）
- サーバーモードの確認（M4 マイルストーンで完了済み）
- `GgufConfig::from_code()` への書き換え（現状の直接構築で十分動作する）
- feature flags の調整（M6-14 で対応）

## Test Plan

### 検証項目

| # | 項目 | 方法 | 期待結果 |
|---|------|------|---------|
| 1 | `cargo check --bin test-run` | `make check-be` または直接 `cargo check -p ggufrs --bin test-run` | コンパイル成功、警告なし |
| 2 | 全パターン実行 | `cargo run --bin test-run` | 3/3 PASS（目視確認） |
| 3 | 単一パターン実行 | `cargo run --bin test-run -- 1` | Pattern 1 のみ実行され PASS |
| 4 | 複数パターン指定 | `cargo run --bin test-run -- 1 3` | Pattern 1 と 3 が実行され PASS |
| 5 | モデル不在時 | モデルファイルを退避して `cargo run --bin test-run` | エラーメッセージ表示、panic しない |
| 6 | 不正引数 | `cargo run --bin test-run -- 99` | Usage 表示、exit(1) |

### ユニットテスト不可能な項目（例外）

- **項目 2-6**: test-run バイナリは「目視確認用ツール」として設計されており、モデル実ファイルが必要。モデルダウンロードは build.rs が行い、build.rs はテスト実行時には動作しない。このため、実モデルファイルを用いた動作確認は手動テストが唯一の手段である。
- **項目 5（モデル不在）**: モデルファイル削除の状態はテスト環境で再現可能だが、バイナリの正常終了確認は目視が確実。

## Boy Scout Rule — 翻訳可能性計画

### 現状評価

`src/bin/test-run.rs` は既に高い翻訳可能性を持っている:

- ✅ **関数名が動詞句**: `run_pattern1`, `run_pattern2`, `run_pattern3`, `parse_patterns`, `print_separator`, `print_elapsed`
- ✅ **一関数一責務**: 各パターン関数は単一の推論パターンのみ担当
- ✅ **ハードコード値**: モデル名 `gemma4-e2b` は `ModelConfig::gemma4_e2b()` 由来の公称値のため定数化不要
- ✅ **エラーハンドリング**: `eprintln!("FAIL: {e}")` でエラー表示、`Result` 伝播で main 関数が一元管理

### 改善案（小規模）

- `run_pattern1`, `run_pattern2`, `run_pattern3` の戻り値タプル `(bool, Duration)` を名前付き構造体 `PatternResult` に抽出するとより翻訳可能性が高まるが、3つのみのパターンなので現状でも許容範囲

## Acceptance Criteria

- [ ] `make check-be` 成功（Rust コンパイル + clippy 警告0）
- [ ] `cargo run --bin test-run` で 3/3 PASS 表示（目視確認）
- [ ] 単一パターン指定・複数パターン指定が正常動作
- [ ] モデル不在時に具体的なエラーメッセージを表示し panic しない
- [ ] 不正引数で Usage 表示 + exit(1)
- [ ] 翻訳可能性の検証 — 現状維持以上

## 依存関係

| 依存方向 | チケット | 内容 |
|---------|---------|------|
| 先行必須 | M6-12（チケット未作成） | テストコード修正 — MockEngine + 結合テスト |
| 後続処理 | M6-14（チケット未作成） | feature flags 最終調整 + clippy + ドキュメント |

## Notes

- テスト実行前にモデルファイルが `target/models/` 以下にダウンロードされていることを確認（build.rs によりビルド時に自動DL）
- macOS ARM (Apple Silicon) で動作確認
- モデル Gemma4 E2B (UQFF Q4K, ~3.1GB) を使用

### 成果物

- 計画: context/0001-test-run-srcbintest-runrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0001-test-run-srcbintest-runrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0001-test-run-srcbintest-runrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
