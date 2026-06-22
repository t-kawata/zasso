---
ticket_id: 156
title: M0-2: LossyLevel / ProxyError / ResolvedModel / ConfigError
slug: m0-2-lossylevel-proxyerror-resolvedmodel-configerror
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/review.md
---

# M0-2: LossyLevel / ProxyError / ResolvedModel / ConfigError

## Summary

`anthropx` クレートで共有される列挙型（`LossyLevel`, `ProxyError`, `ConfigError`）と構造体（`ResolvedModel`）を定義する。`ProxyError` はこのチケットでは enum 定義と `Display` / `thiserror::Error` のみに留め、`IntoResponse` 実装は M3-1 で行う。`ConfigError` は M1-2（`AppConfig::validate`）の戻り値型として使用される。

**注記**: `OpenAiWireApi` / `LogFormat` は M0-1 (ticket #155) で既に定義済みのため、本チケットのスコープから除外する。

## Background

`anthropx` のエラー処理と Lossy Translation 制御は以下の要件を持つ：

1. **ProxyError**: Axum handler から一貫したエラーレスポンスを返すための単一エラー型。Anthropic 互換エラースキーマに 1:1 対応する（RFC §11）
2. **ConfigError**: 設定読み込み・検証時のエラー型。集約型バリデーション（全エラーを収集してから報告）の戻り値として使用（RFC §2）
3. **LossyLevel**: non-Anthropic→Anthropic 変換時の情報欠落（Lossy Translation）の重大度を3段階で分類する（RFC §6）
4. **ResolvedModel**: model 名解決結果を保持する単純な値オブジェクト

**参照設計書:** `crates/anthropx/RFC.md` (§2 設定システム, §6 Lossy Translation, §11 エラー型)

## Scope

- `LossyLevel` enum（Error / Warn / Info）— pure data、should_reject ロジックは M1-1
- `ProxyError` enum（12 variant）— `thiserror::Error` derive、`Display` impl
  - `UnknownProvider(String)`, `InvalidModel(String)`, `MissingField(&'static str)`
  - `Unauthorized`, `Forbidden`, `QueueFull`
  - `Upstream(StatusCode)`, `UpstreamError(String)`
  - `TransformLossy(String)`, `Timeout`
  - `Internal(String)`, `Config(String)`
- `ConfigError` enum（6 variant）— `thiserror::Error` derive
  - `Io(String, io::Error)` — ファイル読み込み失敗
  - `Parse(String, toml::de::Error)` — TOML パース失敗
  - `EmptyApiKeys(String)` — provider の api_keys が空
  - `DuplicateModel(String)` — provider 内で model.public が重複
  - `DuplicateAlias(String, String)` — エイリアスが既存の公開名と衝突
  - `ValidationFailed(Vec<ConfigError>)` — 集約型バリデーションのラッパー
- `ResolvedModel` struct（`public: String`, `upstream: String`）— `Clone + Debug`

### このチケットで実装しないこと

- `LogFormat` / `OpenAiWireApi` — 既に M0-1 で定義済み
- `ProxyError::IntoResponse` — M3-1 (ticket TBD) のスコープ
- `LossyLevel::should_reject()` — M1-1 (ticket TBD) のスコープ
- `ConfigError` の `PartialEq` — テストでの比較に不要（`Display` で十分）
- `serde::Serialize` / `serde::Deserialize` — エラー型は通常シリアライズしない

## Investigation

### コードベース調査結果

- **発見1**: `crates/anthropx/src/config/mod.rs` に M0-1 の型定義（LogFormat, OpenAiWireApi, 6構造体）が存在する。本チケットの型も同ファイルに追加する。
- **発見2**: RFC §11 では `ProxyError` が `http/errors.rs` に定義されることを想定している。しかし実際のモジュール分割は Tickets.md のフェーズ設計（M3-1 で errors.rs への分離）に従う。本チケットでは `config/mod.rs` の末尾に追加し、M3-1 で `http/errors.rs` に分割する。
- **発見3**: RFC §6 に `LossyLevel` の完全な定義が記載済み。`should_reject()` の論理は `matches!(self, LossyLevel::Error) && !allow_lossy && !error_lossy_continue`。
- **発見4**: ConfigError の `ValidationFailed` は `Vec<ConfigError>` を保持するが、`Display` 実装で再帰を適切に処理すれば問題なし。
- **発見5**: `ProxyError::Upstream(StatusCode)` は `http::StatusCode` に依存。`http` crate は `thiserror` が既に依存しているため追加依存にならない。

### 必要な依存関係の追加

| クレート | 理由 | 備考 |
|---------|------|------|
| `thiserror` (v2) | ProxyError / ConfigError の `#[derive(Error)]` | `Cargo.toml` に追加 |
| `http` (v1) | `StatusCode` 型（`ProxyError::Upstream`） | `thiserror` が依存済みだが明示的に追加 |

## Test Plan

### ユニットテスト計画

全テストは `src/config/mod.rs` 内の既存 `#[cfg(test)] mod tests` に追記する。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `lossy_level_variant_count` | 正常系 | `LossyLevel` の variant 数が 3 |
| 2 | `lossy_level_debug_clone` | 正常系 | 全 variant が Debug + Clone を満たす |
| 3 | `proxy_error_unknown_provider` | 正常系 | Display: "invalid provider: x" |
| 4 | `proxy_error_invalid_model` | 正常系 | Display: "invalid model: m" |
| 5 | `proxy_error_missing_field` | 正常系 | Display: "missing required field: model" |
| 6 | `proxy_error_unauthorized` | 正常系 | Display: "authentication failed" |
| 7 | `proxy_error_forbidden` | 正常系 | Display: "forbidden" |
| 8 | `proxy_error_queue_full` | 正常系 | Display: "queue is full" |
| 9 | `proxy_error_upstream` | 正常系 | Display にステータスコードが含まれる |
| 10 | `proxy_error_upstream_error` | 正常系 | Display: "upstream unreachable: timeout" |
| 11 | `proxy_error_transform_lossy` | 正常系 | Display に変換エラー内容が含まれる |
| 12 | `proxy_error_timeout` | 正常系 | Display: "request timed out" |
| 13 | `proxy_error_internal` | 正常系 | Display: "internal error: unexpected" |
| 14 | `proxy_error_config` | 正常系 | Display: "config error: bad config" |
| 15 | `proxy_error_all_variants_display` | 正常系 | 全12 variant がパニックなく Display 文字列を生成 |
| 16 | `proxy_error_is_std_error` | 正常系 | ProxyError: std::error::Error を満たす |
| 17 | `config_error_io` | 正常系 | Display にパスと IO エラー内容が含まれる |
| 18 | `config_error_parse` | 正常系 | Display にパスとパースエラー内容が含まれる |
| 19 | `config_error_empty_api_keys` | 正常系 | Display: "empty api_keys for provider" |
| 20 | `config_error_duplicate_model` | 正常系 | Display に重複モデル名が含まれる |
| 21 | `config_error_duplicate_alias` | 正常系 | Display にエイリアス名と衝突先が含まれる |
| 22 | `config_error_validation_failed` | 正常系 | Display に全エラーの集約が含まれる |
| 23 | `config_error_is_std_error` | 正常系 | ConfigError: std::error::Error を満たす |
| 24 | `resolved_model_fields` | 正常系 | `public` / `upstream` フィールドアクセス確認 |
| 25 | `resolved_model_debug_clone` | 正常系 | ResolvedModel が Debug + Clone を満たす |

### ユニットテスト不可能な項目（例外）

- `ProxyError` が HTTP レスポンスに変換できること → M3-1 で `IntoResponse` 実装後に統合テスト
- `ConfigError` が `AppConfig::validate()` から正しく返されること → M1-2 で統合テスト
- `LossyLevel::should_reject()` → M1-1 でテスト

## Boy Scout Rule — 翻訳可能性計画

- **エラーメッセージは英語で記述**（CLAUDE.md 言語プロトコルに従い、ログ・エラーは英語）
- **enum variant 名はドメイン概念を正確に表現**: `EmptyApiKeys`, `DuplicateModel`, `TransformLossy` はそのまま日本語で翻訳可能
- **`#[error("...")]` のメッセージは「何が」「なぜ」失敗したかを一文で説明
- 既存の M0-1 コードには修正を加えない（Boy Scout 対象は新規追加コードのみ）

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存19 + 新規25 = 44）通過する
- [ ] `LossyLevel` の3 variant（Error, Warn, Info）が定義され、`Debug + Clone` を満たす
- [ ] `ProxyError` の全12 variant が `Display` で意味のあるメッセージを出力する
- [ ] `ProxyError` が `std::error::Error` を満たす
- [ ] `ConfigError` の全6 variant が `Display` で意味のあるメッセージを出力する
- [ ] `ConfigError` が `std::error::Error` を満たす
- [ ] `ResolvedModel` が `Clone + Debug` を満たし、`public` / `upstream` フィールドにアクセス可能

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (done)** | M0-1 (#155) | 設定構造体・LogFormat・OpenAiWireApi の定義 |
| **後続（本チケット完了が必要）** | M1-1 (#157) | LossyLevel::should_reject, ResolvedModel を使用 |
| **後続（本チケット完了が必要）** | M1-2 (#158) | ConfigError を AppConfig::validate の戻り値に使用 |
| **後続（本チケット完了が必要）** | M3-1 (#TBD) | ProxyError::IntoResponse 実装 |

## Notes

### ファイル配置

本チケットの型は以下の配置とする：

| 型 | 配置ファイル | 備考 |
|---|-------------|------|
| LossyLevel | `src/config/mod.rs` | config ドメインの一部 |
| ResolvedModel | `src/config/mod.rs` | 設定解決結果 |
| ProxyError | `src/config/mod.rs` | M3-1 で http/errors.rs に移動予定 |
| ConfigError | `src/config/mod.rs` | config ドメインのエラー型 |

### 成果物

- 計画: `context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/plan.md`（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: `context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/implementation.md`（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: `context/0156-m0-2-lossylevel-proxyerror-resolvedmodel-configerror/review.md`（未作成、`/review-ticket` 全チェック通過後に作成）
