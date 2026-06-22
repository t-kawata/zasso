---
ticket_id: 137
title: M1-2: GpuProvider メソッド実装 (config.rs)
slug: m1-2-gpuprovider-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0137-m1-2-gpuprovider-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0137-m1-2-gpuprovider-configrs/review.md
---

# M1-2: GpuProvider メソッド実装 (config.rs)

## Summary

`GpuProvider` 列挙型に3つのメソッドを実装する: `detect()`（OS自動検出＋環境変数上書き）、`from_str()`（文字列パース）、`mistralrs_feature()`（mistralrs feature flag 名解決）。

## Background

環境変数によるランタイム上書きとコンパイル時デフォルトのハイブリッド方式。`GGUFRS_GPU_PROVIDER` 環境変数が設定されていればそれを優先し、未設定なら OS から自動検出する。これによりユーザーはビルドオプションと実行時設定の両方で GPU プロバイダーを制御できる。

依存関係: M0-3（GpuProvider 列挙型）reviewed ✅

## Scope

- `GpuProvider::detect() -> Self`:
  - `GGUFRS_GPU_PROVIDER` 環境変数をチェック → 設定されていれば `from_str()` でパース
  - 環境変数未設定 → OS 自動検出: macOS→Metal, Windows→DirectML, その他→Cpu
- `GpuProvider::from_str(s: &str) -> Option<Self>`:
  - 大文字小文字を区別せずパース
  - 未知の値には `None` を返す
- `GpuProvider::mistralrs_feature(&self) -> &'static str`:
  - Metal→"metal", Cuda→"cuda", Cpu/Auto→"", DirectML→""

## Non-scope

- GpuConfig の変更 → なし（既存の Default で十分）
- mistralrs::Error との統合 → M3-2 以降

## Investigation

### 証拠 1: GpuProvider の現状確認

`GpuProvider` は M0-3 で定義済み。5バリアント（Auto, Metal, DirectML, Cuda, Cpu）、`Default` derive で `Auto`。関連メソッドは未実装。

**ソース**: `src/config.rs` GpuProvider enum（直接読み取り）

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-3 (#132) | reviewed ✅ | GpuProvider 列挙型 |

### 証拠 3: 環境変数定数の確認

`GPU_PROVIDER_ENV_VAR` = `"GGUFRS_GPU_PROVIDER"` が M0-2 で定義済み。`crate::consts::GPU_PROVIDER_ENV_VAR` で参照可能。

**ソース**: `src/consts/settings.rs`

## Test Plan

### ユニットテスト計画

**テスト対象**: `config.rs` の `GpuProvider` メソッド3種

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `from_str_lowercase_metal` | 正常系 | `"metal"` → `Some(Metal)` |
| `from_str_uppercase_metal` | 正常系 | `"METAL"` → `Some(Metal)` |
| `from_str_mixed_case_cuda` | 正常系 | `"CuDa"` → `Some(Cuda)` |
| `from_str_cpu` | 正常系 | `"cpu"` → `Some(Cpu)` |
| `from_str_auto` | 正常系 | `"auto"` → `Some(Auto)` |
| `from_str_unknown_returns_none` | 異常系 | `"unknown"` → `None` |
| `from_str_empty_returns_none` | 境界値 | `""` → `None` |
| `mistralrs_feature_metal` | 正常系 | Metal → `"metal"` |
| `mistralrs_feature_cuda` | 正常系 | Cuda → `"cuda"` |
| `mistralrs_feature_cpu_auto_empty` | 正常系 | Cpu/Auto → `""` |
| `mistralrs_feature_directml_empty` | 正常系 | DirectML → `""` |
| `detect_respects_env_var` | 正常系 | 環境変数設定時はその値が優先 |
| `detect_auto_on_unset_unknown_os` | 正常系 | 環境変数未設定+不明OS→Auto（cfg 注釈付き） |

**カバレッジ目標**: 90%以上（`detect()` のプラットフォーム分岐は特定環境でのみテスト可能）

**モック/スタブ**: 不要（純粋関数＋環境変数の一時設定で検証可能）

### ユニットテスト不可能な項目（例外）

- `detect()` の macOS/Metal 検出は macOS 実機でのみテスト可能。他環境では `#[cfg(target_os = "macos")]` で注釈

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（config.rs GpuProvider impl）

- メソッド名は動詞句: `detect`（検出する）, `from_str`（文字列から変換）, `mistralrs_feature`（feature名を取得）
- `detect()` のロジックは「環境変数→OS自動検出」の2段階で読みやすい

### スコープ外の改善

特になし。

## Acceptance Criteria

- [ ] `GpuProvider::detect()` が環境変数優先＋OS自動検出で実装されている
- [ ] `GpuProvider::from_str()` が大文字小文字不問でパースし、未知の値に `None` を返す
- [ ] `GpuProvider::mistralrs_feature()` が正しい feature flag 名を返す
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-3 (#132) | 先行実装必須 — GpuProvider 列挙型（reviewed ✅） |
| M3-2 (未作成) | 後続 — InferenceEngine 実装時に feature 解決 |

### STUB 解決

本チケットは config.rs の M1-2 の STUB 部分を解決する。

### 成果物

- 計画: context/0137-m1-2-gpuprovider-configrs/plan.md（未作成）
- 実装サマリ: context/0137-m1-2-gpuprovider-configrs/implementation.md（未作成）
- レビュー報告書: context/0137-m1-2-gpuprovider-configrs/review.md（未作成）
