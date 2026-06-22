---
ticket_id: 134
title: M0-5: 設定構造体定義 (config.rs)
slug: m0-5-configrs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0134-m0-5-configrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0134-m0-5-configrs/review.md
---

# M0-5: 設定構造体定義 (config.rs)

## Summary

GGUF 推論エンジンの設定構造体 `ModelConfig` / `ServerConfig` / `GgufConfig` / `ConfigLayer` を `config.rs` に定義する。既存の `GpuProvider` / `GpuConfig`（M0-3実装済み）に追加する形で実装する。

## Background

crate 全体の設定体系を確立する。この段階では構造体定義と JSON 入出力のみ。実際のマージロジックやビルダーメソッドは M1 で実装する。構造体定義を先行させることで、M0-6（ModelInfo）以降のチケットが型に依存できるようになる。

依存関係: M0-1（crate骨格）、M0-2（静的定数 → `DEFAULT_RT_PORT` 使用）、M0-3（GpuProvider → フィールドに含む）

## Scope

- `config.rs` に以下を追加:
  - **`ModelConfig`** 構造体:
    - `name: String`, `model_path: PathBuf`, `lazy_load: bool`
    - `context_size: Option<u32>`, `gpu_layers: Option<u32>`, `batch_size: Option<u32>`, `chat_template: Option<String>`
    - derive: `Debug, Clone, PartialEq, Serialize, Deserialize`
  - **`ServerConfig`** 構造体:
    - `bind: SocketAddr`, `models: Vec<String>`, `auto_start_server: bool`
    - derive: `Debug, Clone, PartialEq, Serialize, Deserialize`
    - `impl Default` 手動: `([127,0,0,1]:DEFAULT_RT_PORT)`, `models=vec![]`, `auto_start_server=false`
  - **`GgufConfig`** 構造体:
    - `models: Vec<ModelConfig>`, `server: ServerConfig`, `gpu: GpuConfig`
    - derive: `Debug, Clone, PartialEq, Serialize, Deserialize`
  - **`ConfigLayer`** 列挙型:
    - `Code(GgufConfig)`, `JsonStr(String)`, `File(PathBuf)`
    - derive: `Debug, Clone, PartialEq, Serialize, Deserialize`

## Non-scope

- マージロジック (`merge_overlay` / `build`) → M1-4 / M3-1
- `ModelConfig` のビルトインコンストラクタ → M1-1
- `GpuProvider` のメソッド実装 → M1-2

## Investigation

### 証拠 1: config.rs の現状

`config.rs` は M0-3 で `GpuProvider` / `GpuConfig` が実装済み。以下の STUB が残っている:

```rust
//! # [::STUB::] M0-5 で GgufConfig / ModelConfig / ServerConfig / ConfigLayer を実装
//! # [::STUB::] M1-1, M1-2, M1-4 でメソッド・マージロジックを実装
```

本チケットで最初の STUB を解決する。

### 証拠 2: 依存関係の充足

| チケット | ステータス | 関係 |
|---------|-----------|------|
| M0-1 (#130) | reviewed ✅ | crate 骨格 |
| M0-2 (#131) | reviewed ✅ | `DEFAULT_RT_PORT` 使用 |
| M0-3 (#132) | reviewed ✅ | `GpuProvider` / `GpuConfig` |

### 証拠 3: 定数参照の確認

`ServerConfig::default()` は `crate::consts::DEFAULT_RT_PORT` を参照する。M0-2 で定義済みのため利用可能。

### 証拠 4: GpuConfig 再利用

`GpuConfig` は M0-3 で定義済み。`GgufConfig.gpu` フィールドでそのまま使用する。`Default` も実装済み。

## Test Plan

### ユニットテスト計画

**テスト対象**: `config.rs` の新規4構造体/列挙型

| テストケース | 種別 | 検証内容 |
|-------------|------|---------|
| `model_config_roundtrip_json` | 正常系 | 全フィールド設定→JSON→復元で同一 |
| `model_config_default_lazy_load_is_false` | 正常系 | lazy_load のデフォルト |
| `model_config_default_context_size_is_none` | 正常系 | context_size のデフォルト |
| `server_config_default_uses_loopback_and_default_rt_port` | 正常系 | bind が 127.0.0.1:DEFAULT_RT_PORT |
| `server_config_default_auto_start_is_false` | 正常系 | auto_start_server が false |
| `server_config_roundtrip_json` | 正常系 | JSON ラウンドトリップ |
| `gguf_config_roundtrip_json` | 正常系 | 全サブ構造体含む JSON ラウンドトリップ |
| `config_layer_code_roundtrip_json` | 正常系 | Code(GgufConfig) の JSON |
| `config_layer_json_str_roundtrip` | 正常系 | JsonStr の JSON |
| `config_layer_file_roundtrip` | 正常系 | File(PathBuf) の JSON |

**カバレッジ目標**: 100%
**モック/スタブ**: 不要

### ユニットテスト不可能な項目（例外）

なし。全テストケースが純粋な値の検証。

## Boy Scout Rule — 翻訳可能性計画

### スコープ内（config.rs 追加部分）

- フィールド名は全てドメイン概念を正確に表現（`model_path`, `context_size`, `auto_start_server` 等）
- `ConfigLayer` のバリアント名は目的を直截に表現（`Code`=コード内設定, `JsonStr`=JSON文字列, `File`=ファイルパス）
- 各フィールド・バリアントに「なぜ存在するか」を日本語コメントで記述
- `SocketAddr` の `Default` 非対応問題を適切にハンドリング（手動 impl で対応）

### スコープ外の改善

既存の `GpuProvider::Cpu` のコメントに `Auto が先頭バリアントのため` とあるが、実際は `#[default]` が `Auto` にある。これは M0-3 の既存コードで動作上問題ないため本チケットでは修正不要。

## Acceptance Criteria

- [ ] `ModelConfig` 構造体が7フィールドで定義されている（serde derive 含む）
- [ ] `ServerConfig` 構造体が3フィールドで定義され、`Default` 手動実装が `([127,0,0,1]:DEFAULT_RT_PORT, vec![], false)` を返す
- [ ] `GgufConfig` 構造体が3フィールド（models, server, gpu）で定義されている
- [ ] `ConfigLayer` 列挙型が3バリアント（Code, JsonStr, File）で定義されている
- [ ] 全構造体が JSON ラウンドトリップ可能
- [ ] `make check-ggufrs` が成功する
- [ ] 既存テスト（M0-2, M0-3 の33テスト）+ 新規テストが全て通過する

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M0-1 (#130) | 先行実装必須（reviewed ✅） |
| M0-2 (#131) | 先行実装必須 — `DEFAULT_RT_PORT` 参照（reviewed ✅） |
| M0-3 (#132) | 先行実装必須 — `GpuProvider` / `GpuConfig`（reviewed ✅） |
| M1-1 (未作成) | 後続 — ModelConfig コンストラクタ |
| M1-4 (未作成) | 後続 — GgufConfig merge_overlay |
| M3-1 (未作成) | 後続 — GgufConfig::build |

### STUB 解決

本チケットは `config.rs` の `[::STUB::] M0-5 で GgufConfig / ModelConfig / ServerConfig / ConfigLayer を実装` を解決する。M0-5 部分完了後、M1-1/M1-2/M1-4 の STUB のみ残る。

### 成果物

- 計画: context/0134-m0-5-configrs/plan.md（未作成）
- 実装サマリ: context/0134-m0-5-configrs/implementation.md（未作成）
- レビュー報告書: context/0134-m0-5-configrs/review.md（未作成）
