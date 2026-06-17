# ggufrs — Rust による GGUF モデル推論エンジンクレート — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/ggufrs/RFC.md
> **生成日:** 2026-06-17

## 目的とスコープ

ggufrs は mistralrs をバックエンドとして GGUF 形式の量子化言語モデルを推論実行する Rust クレート。
同一プロセス内でライブラリ API（直接推論）と OpenAI/Anthropic 互換 HTTP サーバーの両方を提供し、
ロードされたモデルインスタンスはスレッドセーフに共有される。
Qwen3.5-0.8B-Q4_K_M / Qwen3.5-2B-Q4_K_M をビルトイン対象としつつ、任意の mistralrs 対応モデルに差し替え可能。
モデルファイルは build.rs により自動ダウンロードされる。

## アーキテクチャ概要

```
GgufEngine (lib.rs) — 統合公開API
├── ModelRegistry (registry.rs)
│   └── RwLock<Vec<ModelInfo>> — スレッドセーフなモデル管理
│       └── ModelInfo: name, model_path, lazy_load, mistralrs設定, Arc<Model>
├── InferenceEngine トレイト (inference/mod.rs)
│   ├── generate() — 通常テキスト生成
│   ├── generate_structured() — JSON Schema 拘束生成
│   ├── generate_stream() — ストリーミング生成
│   └── send_raw() — mistralrs RequestBuilder パススルー
├── Server (server/)
│   ├── Axum ルーター + OpenAI/Anthropic 互換エンドポイント
│   └── start_server() → JoinHandle<Result<()>>
├── Config (config.rs)
│   ├── GgufConfig: models + server + gpu
│   ├── ModelConfig / ServerConfig / GpuConfig
│   └── 3層マージ: ファイルパス > 埋め込みJSON > コード
├── Error (error.rs)
│   └── GgufError: 6 variants + From impls
├── Constants (consts/settings.rs)
│   └── 静的定数（ポート番号・デフォルトパス・タイムアウト）
└── build.rs
    └── curl/powershell でモデル自動ダウンロード
```

## 主要な型とデータ構造

| 型 | 定義場所 | 責務 | Layer |
|-----|---------|------|-------|
| `GgufEngine` | lib.rs | 統合公開API構造体 | L2-3 |
| `ModelRegistry` | registry.rs | モデル一元管理（RwLock） | L1-2 |
| `ModelInfo` | registry.rs | ランタイムモデル状態（設定 + Arc\<Model\>） | L0 |
| `ModelConfig` | config.rs | 静的モデル設定（入力） | L0 |
| `ServerConfig` | config.rs | サーバー設定（bind, auto_start_server） | L0 |
| `GpuConfig` | config.rs | GPU設定（provider, cpu_only） | L0 |
| `GgufConfig` | config.rs | 統合設定（models + server + gpu） | L0 |
| `GenerateParams` | inference/mod.rs | 推論パラメータ | L0 |
| `ConfigLayer` | config.rs | マージ層の種類（Code / JsonStr / File） | L0 |
| `InferenceEngine` | inference/mod.rs | 推論抽象トレイト（4メソッド） | L2 |
| `GgufError` | error.rs | エラー型（6バリアント） | L0 |
| `GpuProvider` | config.rs | GPUプロバイダー列挙型 | L0 |
| `AppState` | server/router.rs | Arc\<dyn InferenceEngine + Send + Sync\> | L2 |
| `AppError` | server/router.rs | (StatusCode, Json\<Value\>) | L2 |

## モジュール／コンポーネント間の関係

```
Cargo.toml → 全モジュールの依存解決
consts/settings.rs → 全モジュール（定数参照）
error.rs → 全モジュール（エラー伝搬）
config.rs → lib.rs, registry.rs（設定注入）
registry.rs → inference/, server/（モデル解決）
inference/ → lib.rs（トレイト実装提供）
server/ → lib.rs（ルーター + 起動制御）
build.rs → Cargoビルド時（モデルDL、独立）
tests/ → 全モジュール（結合テスト）
src/bin/test-run.rs → lib.rs（目視確認）
```

### 依存方向（実装順序）

```
settings.rs → error.rs → config.rs → registry.rs → inference/ → server/ → lib.rs
                                                                  → build.rs（並行可能）
                                                                  → test-run.rs
                                                                  → tests/
```

## スタブ一覧と解決計画

| スタブ箇所 | 内容 | 解決チケット |
|-----------|------|-------------|
| InferenceEngine トレイト未実装メソッド | トレイト定義のみ、実装なし | M3-2, M3-3, M3-4 |
| ModelRegistry::get() 未実装 | GgufModelBuilder を使用した実際のモデルロード | M2-2（async宣言のみ）、M3-2（実I/O実装） |
| GgufConfig::build() 未実装 | 3層マージロジック | M1-4（from_code + merge_overlay）、M3-1（build + merge + ファイルI/O） |
| GgufConfig::merge() 未実装 | ConfigLayer 配列による一般化マージ | M3-1 |
| GgufEngine::start_server() 未実装 | Axumサーバー起動 | M4-2 |
| server/router.rs ハンドラ未実装 | OpenAI/Anthropic エンドポイント | M4-1 |
| build.rs 未実装 | モデル自動ダウンロード | M5-1 |
| test-run バイナリ未実装 | 目視確認用バイナリ | M5-2 |
