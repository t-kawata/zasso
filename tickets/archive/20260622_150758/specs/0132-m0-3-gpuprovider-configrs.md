---
ticket_id: 132
title: M0-3: GpuProvider 列挙型 (config.rs)
slug: m0-3-gpuprovider-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0132-m0-3-gpuprovider-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0132-m0-3-gpuprovider-configrs/review.md
---

# M0-3: GpuProvider 列挙型 (config.rs)

## Summary

GGUF 推論エンジンの GPU プロバイダー選択を表現する `GpuProvider` 列挙型と、GPU 設定を保持する `GpuConfig` 構造体を `config.rs` に定義する。この段階では型定義のみでメソッド実装は含まない。

## Background

GPU プロバイダーの選択は GGUF 推論設定の一部であり、JSON config での指定や環境変数からの読み取りが必要。`GpuProvider` + `GpuConfig` を先に定義することで、後続チケット（M0-5: 設定構造体、M1-2: GpuProvider メソッド）がこれらを参照できるようになる。

依存関係: M0-1（crate 骨格）reviewed ✅、M0-2（静的定数）reviewed ✅

## Scope

- `config.rs` に以下を追記:
  - `GpuProvider` 列挙型: `Auto`, `Metal`, `DirectML`, `Cuda`, `Cpu`
    - `#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]`
    - `Auto` が先頭のため `Default` は `Auto` を返す
  - `GpuConfig` 構造体:
    - `provider: GpuProvider`
    - `cpu_only: bool`
    - `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]`
    - `Default` は手動 impl: `GpuProvider::Auto`, `cpu_only: false`

## Non-scope

- `GpuProvider` のメソッド実装（環境変数からの読み取り等）→ M1-2
- 他の設定構造体（`GgufConfig`, `ModelConfig`, `ServerConfig`）→ M0-5
- `ConfigLayer` 列挙型 → M0-5
- `serde` 以外のトレイト実装

## Investigation

### 証拠 1: config.rs の現状

`config.rs` はモジュールレベルのドキュメントコメントと STUB コメントのみで、型定義は一切含まれていない：

```rust
//! 設定構造体定義
//!
//! GgufConfig / ModelConfig / ServerConfig / GpuConfig / ConfigLayer を定義する。
//!
//! # [::STUB::] M0-3, M0-5 で各構造体を実装
//! # [::STUB::] M1-1, M1-2, M1-4 でメソッド・マージロジックを実装
```

本チケット（M0-3）と M0-5 は同一ファイル `config.rs` に実装するため、STUB は段階的に解決される。

**ソース**: `src/config.rs` 1-7行目の直接読み取り

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-1 (#130) | reviewed ✅ | 先行実装必須 — crate 骨格 |
| M0-2 (#131) | reviewed ✅ | 先行実装必須 — 静的定数（GPU_PROVIDER_ENV_VAR 参照の準備） |

### 証拠 3: GpuProvider のバリアント設計根拠

RFC §5 に基づく5バリアント:

| バリアント | 対応環境 | 備考 |
|-----------|---------|------|
| `Auto` | 全環境 | システム自動検出。デフォルト値 |
| `Metal` | macOS | Apple GPU (MPS) |
| `DirectML` | Windows | DirectML 経由（mistralrs v0.8.1 では未対応だが、将来の拡張として定義） |
| `Cuda` | Linux/Windows | NVIDIA GPU |
| `Cpu` | 全環境 | CPU のみ。フォールバック用 |

## Test Plan

### ユニットテスト計画

**テスト対象**: `config.rs` の `GpuProvider` 列挙型 + `GpuConfig` 構造体

| テストケース | 分類 | 検証内容 |
|-------------|------|---------|
| `gpu_provider_default_is_auto` | 正常系 | `GpuProvider::default()` が `Auto` を返す |
| `gpu_provider_all_variants_roundtrip_json` | 正常系 | 全5バリアントが JSON シリアライズ→デシリアライズで元の値に戻る |
| `gpu_provider_auto_serializes_to_auto` | 正常系 | `Auto` → `"Auto"` としてシリアライズ |
| `gpu_provider_metal_serializes_to_metal` | 正常系 | `Metal` → `"Metal"` |
| `gpu_provider_directml_serializes_to_directml` | 正常系 | `DirectML` → `"DirectML"` |
| `gpu_provider_cuda_serializes_to_cuda` | 正常系 | `Cuda` → `"Cuda"` |
| `gpu_provider_cpu_serializes_to_cpu` | 正常系 | `Cpu` → `"Cpu"` |
| `gpu_provider_deserialize_invalid_variant` | 異常系 | 不明な文字列 → デシリアライズエラー |
| `gpu_config_default_returns_auto_and_cpu_only_false` | 正常系 | `GpuConfig::default()` が `provider: Auto`, `cpu_only: false` |
| `gpu_config_roundtrip_json` | 正常系 | `GpuConfig` が JSON ラウンドトリップ可能 |
| `gpu_config_all_fields_serialize` | 正常系 | シリアライズ結果に `provider` と `cpu_only` 両方含まれる |

**カバレッジ目標**: 100%（純粋な型定義 + derive + 手動 impl、外部依存なし）

**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。全テストケースが純粋な値の検証であり実機不要。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（config.rs）

- `GpuProvider` の各バリアント名は `PascalCase` + 一般的なGPU技術名（`Metal`, `Cuda` 等）であり、名詞として適切
- `GpuConfig` のフィールド名はドメイン概念を正確に表現（`provider` = プロバイダー種別, `cpu_only` = CPU限定フラグ）
- 各バリアント・フィールドに「なぜ存在するか」を日本語コメントで記述
- `cpu_only` の命名は「CPU only か？」という真偽値問い合わせとして読み取れるため適切

### スコープ外の改善

`config.rs` の既存コードは STUB コメントのみで改善対象なし。

## Acceptance Criteria

- [ ] `GpuProvider` 列挙型が5バリアント（`Auto`, `Metal`, `DirectML`, `Cuda`, `Cpu`）で定義されている
- [ ] `GpuProvider` に `#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]` が付与されている
- [ ] `GpuConfig` 構造体が `provider: GpuProvider`, `cpu_only: bool` で定義されている
- [ ] `GpuConfig` に `#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]` が付与されている
- [ ] `GpuConfig::default()` が手動 impl され、`GpuProvider::Auto`, `cpu_only: false` を返す
- [ ] 各バリアント・フィールドに日本語コメントで意図が説明されている
- [ ] `make check-ggufrs` が成功する
- [ ] 全ユニットテストが通過する（JSON ラウンドトリップ含む）

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-1 (#130) | 先行実装必須（reviewed ✅） |
| M0-2 (#131) | 先行実装必須（reviewed ✅） |
| M1-2 (未作成) | 後続 — GpuProvider のメソッド実装 |
| M0-5 (未作成) | 後続 — 同一ファイルに GgufConfig 等を追加 |

### STUB 解決

本チケットは `config.rs` の `[::STUB::] M0-3, M0-5 で各構造体を実装` のうち M0-3 相当部分を解決する（M0-5 部分は残る）。

### 成果物

- 計画: context/0132-m0-3-gpuprovider-configrs/plan.md（未作成）
- 実装サマリ: context/0132-m0-3-gpuprovider-configrs/implementation.md（未作成）
- レビュー報告書: context/0132-m0-3-gpuprovider-configrs/review.md（未作成）
