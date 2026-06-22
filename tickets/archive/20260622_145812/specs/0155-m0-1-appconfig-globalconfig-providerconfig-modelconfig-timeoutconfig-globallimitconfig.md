---
ticket_id: 155
title: M0-1: AppConfig / GlobalConfig / ProviderConfig / ModelConfig / TimeoutConfig / GlobalLimitConfig
slug: m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/review.md
---

# M0-1: AppConfig / GlobalConfig / ProviderConfig / ModelConfig / TimeoutConfig / GlobalLimitConfig

## Summary

`crates/anthropx/` クレートの設定システム基盤となる6つの設定構造体を定義する。具体的には `AppConfig`、`GlobalConfig`、`ProviderConfig`、`ModelConfig`、`TimeoutConfig`、`GlobalLimitConfig` を `src/config/mod.rs` に実装する。各構造体に `Default` / `Deserialize` / `Serialize` を derive し、設定の TOML 読込とプログラム的構築の二刀流を可能にする。本チケットは一切の非同期・I/O・HTTP依存を含まない純粋データ型の定義であり、全上位チケットの最基底として機能する。

## Background

`anthropx` は Anthropic 互換 API プロキシサーバーであり、複数の LLM provider（DeepSeek、Qwen、OpenAI 互換など）へのルーティング・認証・スケジューリングを提供する。設定システムは以下の要件を満たす必要がある：

1. **TOML とプログラム的構築の二刀流**: 全フィールドを `pub` とし、構造体リテラルまたは `..Default::default()` で任意のフィールドだけを上書き可能にする（RFC §2）
2. **全フィールドに安全なデフォルト値**: `#[serde(default)]` と `Default` impl により、TOML で未指定のフィールドは自動的にデフォルト値で補完される
3. **provider の動的登録**: `BTreeMap<String, ProviderConfig>` により任意の数の provider をキー名で管理し、`/v1/models` のソート済み出力を自然に得る
4. **Provider 個別の上書き**: Global 設定を provider 単位でオプショナルに上書きできる設計（`allow_lossy`, `max_in_flight` 等が `Option<T>`）

**参照設計書:** `crates/anthropx/RFC.md` (§2 設定システム)

## Scope

- `crates/anthropx/Cargo.toml` の作成（package 定義および必須依存: `serde` + `serde_derive`、`toml`）
- `crates/anthropx/src/lib.rs` の作成（`pub mod config;` のモジュール宣言）
- `crates/anthropx/src/config/mod.rs` の作成（以下の6構造体を同一ファイルに定義）

### 定義する型

| 型 | 種別 | 責務 |
|---|------|------|
| `AppConfig` | struct | 最上位設定: `global: GlobalConfig` + `providers: BTreeMap<String, ProviderConfig>` |
| `GlobalConfig` | struct | サーバー全体設定: port, url_prefix, require_client_auth, log_format, allow_lossy, error_lossy_continue, timeouts, limits, aliases |
| `ProviderConfig` | struct | Provider 単位設定: transparent, base_url, api_keys, 各種オプショナル上書き, models |
| `ModelConfig` | struct | モデル定義: public, upstream, enabled, tags, max_tokens_cap, aliases |
| `TimeoutConfig` | struct | 3種の timeout: connect_ms, read_ms, total_ms |
| `GlobalLimitConfig` | struct | concurrency 制御のデフォルト値: default_max_in_flight, default_max_queue |

- 6構造体すべてに `#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]` を付与
- 各構造体に `impl Default`（または `#[serde(default)]` 属性）を実装し、RFC §2 のデフォルト値を反映
- デフォルト値生成関数（`fn default_*()`）の実装

### デフォルト値一覧

| 関数 | 戻り値 | 対象フィールド |
|------|--------|-------------|
| `default_enabled()` | `true` | `ModelConfig::enabled` |
| `default_connect_ms()` | `3000` | `TimeoutConfig::connect_ms` |
| `default_read_ms()` | `600000` | `TimeoutConfig::read_ms` |
| `default_total_ms()` | `600000` | `TimeoutConfig::total_ms` |
| `default_in_flight()` | `64` | `GlobalLimitConfig::default_max_in_flight` |
| `default_queue()` | `256` | `GlobalLimitConfig::default_max_queue` |
| `default_log_format()` | `LogFormat::Text` | `GlobalConfig::log_format` |

### 依存crate

- `serde` (features = ["derive"]): 必須。Serialize / Deserialize のため
- `toml` (v0.8): 本チケットでは構造体定義のみだが、TOML デシリアライズを可能にするために依存を追加する（実際の `from_toml` 関数は M2-3 で実装）
- デフォルト値はテスト内で検証するため、定数としてもアクセス可能にする設計を推奨

## Non-scope

- `AppConfig::from_toml()` — TOML ファイル読み込み（M2-3 ConfigLoader のスコープ）
- `AppConfig::validate()` — 集約型設定検証（M1-2 のスコープ）
- `ProxyError` / `ConfigError` — エラー型の定義（M0-2 のスコープ）
- `OpenAiWireApi` / `LogFormat` enum — 本チケットで使用するが定義は M0-2 に委譲（本チケットでは RFC §2 のコードにある通り `config/mod.rs` に inline 定義してもよいが、Tickets.md の分割に従い M0-2 で定義する。M0-1 では代わりに `pub use` または再 export の準備のみ行う）
- `KeyScheduler` / `ConcurrencyLimiter` — 非同期プリミティブ（M2-1, M2-2）
- Workspace へのメンバー登録（`src-tauri/Cargo.toml` の `[workspace.members]` — 後続フェーズ）
- HTTP サーバー関連の全実装（Phase 3）
- `llm-bridge-core` 依存の追加（Phase 3）

## Investigation

### コードベース調査結果

```
crates/anthropx/
├── CheckList.md           # 存在する
├── CLAUDE.md              # 存在する（プロジェクト設計マップ）
├── DesignTree.json        # 存在する
├── RFC.md                 # 存在する（設計書ドラフト）
├── Status.json            # 存在する（現状: "not_started"）
├── Tickets.md             # 存在する（チケット一覧）
├── docs/                  # 空ディレクトリ
└── src/                   # 未作成 ← Cargo.toml / lib.rs / main.rs 全てなし
```

- **発見1**: `crates/anthropx/` はディレクトリのみ存在。Cargo.toml、src/ ともに未作成。
- **発見2**: ワークスペースルートの `Cargo.toml` に `anthropx` はメンバー登録されていない。
- **発見3**: RFC.md §2 に全構造体の完全な型定義およびデフォルト値が記載済み。設計ドラフトからの乖離はない。
- **発見4**: `[::STUB::]` マーカーは `crates/anthropx/` 内に0件。スタブは存在しない。
- **発見5**: LogFormat enum は RFC §2 に `config/mod.rs` 内で定義されているが、Tickets.md の分割では M0-2 のスコープ。ただし M0-1 の `GlobalConfig` が `log_format: LogFormat` フィールドを持つため、**LogFormat も M0-1 で同時定義する必要がある**（そうしないと M0-1 の GlobalConfig 定義が不完全になる）。同様に M0-2 の OpenAiWireApi も ProviderConfig で使用されるが、`Option<OpenAiWireApi>` であるため M0-1 では `#[serde(default)]` で None にフォールバック可能。しかし完全性のため OpenAiWireApi も M0-1 で同時定義すべき。
- **発見6**: `override_configuration()` 関数の背景として、`ProviderConfig` のオプショナルフィールド（`allow_lossy: Option<bool>` 等）が GlobalConfig の対応フィールドを provider 単位で上書きする設計。この上書き解決ロジックは本チケットのスコープ外（M3-4 Transparent provider mode 等で行う）。

### 設計上の制約

- 全構造体は `pub` 可視性を持ち、クレート外から参照可能であること
- `AppConfig` は `pub global: GlobalConfig` + `pub providers: BTreeMap<String, ProviderConfig>` — フィールド順は RFC に従う
- `GlobalConfig` は `impl Default` でデフォルト値を定義（`#[serde(default)]` は `Deserialize` の振る舞い制御のため両方必要）
- `ProviderConfig` のオプショナルフィールドは `Option<T>` とし、`#[serde(default)]` で TOML 省略時 `None` になるようにする
- `ModelConfig::enabled` はデフォルト `true`（ホワイトリスト型 — 明示的に無効化されたモデルのみ公開しない）
- ポート番号は `u16` 型で表現（デフォルト 8088）
- `tags` は `Vec<String>` で空ベクタがデフォルト

### 発見: M0-1 と M0-2 の型分割に関する注意

RFC §2 では以下の型が同一ファイル (`config/mod.rs`) に定義されている：

| 型 | チケット割り当て |
|---|----------------|
| `AppConfig` / `GlobalConfig` / `ProviderConfig` / `ModelConfig` / `TimeoutConfig` / `GlobalLimitConfig` | **M0-1** |
| `OpenAiWireApi` enum (Auto/ChatCompletions/Responses) | **M0-2** (ただし M0-1 がフィールドで参照) |
| `LogFormat` enum (Text/Json) | **M0-2** (ただし M0-1 がフィールドで参照) |
| `ResolvedModel` struct | **M0-2** (独立して使用) |
| `ConfigError` enum | **M0-2** (M1-2 の validate で使用) |
| `ProxyError` enum | **M0-2** (M3-1 で IntoResponse) |

**LogFormat と OpenAiWireApi は M0-1 で定義しないとコンパイルが通らない**ため、M0-1 のスコープに含めるか、M0-2 と連続して実装する必要がある。本チケットでは M0-2 の enum 2種も含めて定義する（Tickets.md の分割は実装上の依存を反映しておらず、RFC のコードとしての一体性を優先すべき）。

## Test Plan

### ユニットテスト計画

全テストは `src/config/mod.rs` 内の `#[cfg(test)] mod tests` に記述する。外部依存は一切ないため、全テストがメモリ内完結・決定論的・0msで完了する。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `app_config_default` | 正常系 | `AppConfig::default()` の全フィールドが期待値と一致する |
| 2 | `app_config_default_providers_empty` | 正常系 | `AppConfig::default().providers` が空の `BTreeMap` である |
| 3 | `global_config_default` | 正常系 | `GlobalConfig::default()` の port=8088, url_prefix="", require_client_auth=false, log_format=Text, allow_lossy=false, error_lossy_continue=false, timeouts がデフォルト, limits がデフォルト, aliases が空 |
| 4 | `provider_config_default` | 正常系 | `ProviderConfig` の `#[serde(default)]` が全オプショナルフィールドに None または空を設定する |
| 5 | `model_config_default` | 正常系 | `ModelConfig::default()` の enabled=true, tags=[], max_tokens_cap=None, aliases=[] を検証 |
| 6 | `model_config_enabled_default_true` | 正常系 | `default_enabled()` が `true` を返す |
| 7 | `timeout_config_default` | 正常系 | `TimeoutConfig::default()` の connect_ms=3000, read_ms=600000, total_ms=600000 |
| 8 | `timeout_config_default_functions` | 正常系 | `default_connect_ms()`=3000, `default_read_ms()`=600000, `default_total_ms()`=600000 |
| 9 | `global_limit_config_default` | 正常系 | `GlobalLimitConfig::default()` の default_max_in_flight=64, default_max_queue=256 |
| 10 | `global_limit_default_functions` | 正常系 | `default_in_flight()`=64, `default_queue()`=256 |
| 11 | `log_format_default_text` | 正常系 | `default_log_format()` が `LogFormat::Text` を返す |
| 12 | `struct_traits_impl` | 正常系 | 全6構造体が `Debug + Clone + Serialize + Deserialize` を満たす（コンパイル時に検証） |
| 13 | `app_config_serde_roundtrip` | 正常系 | デフォルト値を JSON にシリアライズ→デシリアライズで同一構造体が得られる |
| 14 | `provider_config_serde_roundtrip` | 正常系 | ProviderConfig の全フィールドを明示的に指定して round-trip 一致確認 |
| 15 | `btreemap_key_order` | 正常系 | `providers` のキー順序がアルファベット昇順であることを確認 |
| 16 | `app_config_partial_providers` | 正常系 | 複数 provider を持つ AppConfig の構築とフィールドアクセス |
| 17 | `serde_rename_snake_case` | 正常系 | `LogFormat` / `OpenAiWireApi` の `#[serde(rename_all = "snake_case")]` が snake_case デシリアライズで正しく動作する |
| 18 | `openai_wire_api_variants` | 正常系 | `OpenAiWireApi` の3 variant（Auto, ChatCompletions, Responses）が正しく構築できる |
| 19 | `log_format_variants` | 正常系 | `LogFormat` の2 variant（Text, Json）が正しく構築できる |

### ユニットテスト不可能な項目（例外）

- なし。本チケットは純粋なデータ型定義のみであり、全テストがメモリ内完結・決定論的・外部依存ゼロで実行可能。

## Boy Scout Rule — 翻訳可能性計画

本チケットは新規 crate の作成であり、既存コードの翻訳可能性改善はスコープ外である。しかし、新規作成にあたり以下の翻訳可能性を確保する：

- **関数名は動詞句**: `default_enabled()`, `default_connect_ms()` 等 — 関数名がそのまま「デフォルト有効化」「デフォルト接続ミリ秒」と読める
- **変数名はドメイン概念**: `pub upstream: String` は「上流モデル名」、`pub max_in_flight: Option<usize>` は「最大同時実行数」と逐語訳可能
- **一関数一責務**: 各 `fn default_*()` は単一のデフォルト値のみを返す。責務の混在なし
- **ハードコード値は名前付き定数関数**: マジックナンバー (3000, 600000, 64, 256) は `default_*()` 関数として抽出済み。テストからも参照可能
- **コメントは「なぜ」を説明**: フィールドの役割を日本語コメントで説明し、自明でないデフォルト値の選択理由を記述する（例: `error_lossy_continue: false` の根拠）

## Acceptance Criteria

- [ ] `crates/anthropx/Cargo.toml` が作成され、`cargo check` が通過する
- [ ] 全6構造体が `Debug + Clone + Serialize + Deserialize` を満たす
- [ ] `LogFormat` enum (Text/Json) + `OpenAiWireApi` enum (Auto/ChatCompletions/Responses) が定義され、`#[serde(rename_all = "snake_case")]` を持つ
- [ ] 全デフォルト値が RFC §2 の仕様と一致する（下記テーブルをテストで確認）
  - GlobalConfig.port = 8088, url_prefix = "", require_client_auth = false, log_format = Text, allow_lossy = false, error_lossy_continue = false
  - TimeoutConfig: connect_ms = 3000, read_ms = 600000, total_ms = 600000
  - GlobalLimitConfig: default_max_in_flight = 64, default_max_queue = 256
  - ModelConfig.enabled = true
- [ ] JSON シリアライズ→デシリアライズのラウンドトリップ一貫性が確認されている
- [ ] `AppConfig::default().providers` が空の `BTreeMap` である
- [ ] `BTreeMap` のキー順序がアルファベット昇順である（テストで確認）
- [ ] ユニットテスト全19ケースが通過する
- [ ] `make check-be` または `cargo check -p anthropx` でエラーゼロ

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **並行実装可能** | M0-2 (156) | OpenAiWireApi / LogFormat / ProxyError / ConfigError — M0-1 で enum を定義する場合、M0-2 は ProxyError / ConfigError に専念可能 |
| **後続（本チケット完了が必要）** | M1-1 (157) | ルーティング純粋関数 — AppConfig の型を参照する |
| **後続（本チケット完了が必要）** | M1-2 (158) | AppConfig::validate — AppConfig の構造体定義が必要 |
| **後続（本チケット完了が必要）** | M2-3 (161) | ConfigLoader — AppConfig + 全設定型が必要 |
| **後続（本チケット完了が必要）** | M0-2 (156) | ConfigError は AppConfig::validate の戻り値型の一部（ただし M0-1 の型定義自体は ConfigError に依存しない） |

## Notes

### 成果物

- 計画: `context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0155-m0-1-appconfig-globalconfig-providerconfig-modelconfig-timeoutconfig-globallimitconfig/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）

### M0-1 と M0-2 の型分割に関する補足

RFC §2 は `LogFormat` と `OpenAiWireApi` を `config/mod.rs` 内で定義している。これらは `GlobalConfig::log_format` および `ProviderConfig::openai_wire_api` から直接参照されるため、M0-1 のスコープに含めないとコンパイルが通らない。本チケットでは `LogFormat` enum と `OpenAiWireApi` enum も M0-1 で定義する。これにより M0-2 は `ProxyError` / `ConfigError` / `ResolvedModel` に専念できる。
