---
ticket_id: 157
title: "M1-1: ルーティング純粋関数 — parse_provider_model / resolve_model / resolve_api_format / build_upstream_headers / LossyLevel::should_reject"
slug: m1-1-parse-provider-model-resolve-model-resolve-api-format-build-upstream-headers-lossylevelshould-reject
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0157-m1-1-parse-provider-model-resolve-model-resolve-api-format-build-upstream-headers-lossylevelshould-reject/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0157-m1-1-parse-provider-model-resolve-model-resolve-api-format-build-upstream-headers-lossylevelshould-reject/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0157-m1-1-parse-provider-model-resolve-model-resolve-api-format-build-upstream-headers-lossylevelshould-reject/review.md
---

# M1-1: ルーティング純粋関数 — parse_provider_model / resolve_model / resolve_api_format / build_upstream_headers / LossyLevel::should_reject

## Summary

全く外部I/Oや非同期実行を必要としない純粋関数群を実装する。文字列処理・マップルックアップ・条件分岐のみで構成され、単体テストで完全に検証可能。ルーティング処理（`parse_provider_model`, `resolve_model`）、プロトコル解決（`resolve_api_format`）、ヘッダフィルタリング（`build_upstream_headers`）、Lossy制御（`LossyLevel::should_reject`）の5機能を含む。

## Background

`anthropx` のリクエストルーティングは以下の流れで動作する：

1. クライアントが `POST /v1/messages` に `{ "model": "deepseek/deepseek-v4" }` を送信
2. `parse_provider_model` で `"deepseek"` と `"deepseek-v4"` に分割
3. `resolve_model` でエイリアス・公開名を解決し、上流の実際のモデル名を特定
4. 該当 provider にリクエストを転送（transparent）または変換（translate）
5. `build_upstream_headers` でクライアント由来の危険なヘッダを除去し、API key を注入

これらの処理のうち、Step 2〜3 の純粋ロジック部分と、Step 5 のヘッダフィルタリング、および Lossy Translation の判定を本チケットで実装する。

**参照設計書:** `crates/anthropx/RFC.md` (§4.1 model 解析・alias 解決, §1.3 システム境界, §3.2 header policy, §6 Lossy Translation)

## Scope

### 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/routing/mod.rs` | `parse_provider_model`, `resolve_model`, `resolve_api_format`, 内部ヘルパー, `mod tests` |
| `src/util/mod.rs` | `build_upstream_headers`, `HOP_BY_HOP_HEADERS` 定数, `mod tests` |

### 変更ファイル

| ファイル | 内容 |
|---------|------|
| `src/lib.rs` | `pub mod routing;` と `pub mod util;` のモジュール宣言追加 |
| `src/config/mod.rs` | `impl LossyLevel { fn should_reject(...) }` を追加 |

### 実装する関数

#### `fn parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError>`
- `"deepseek/deepseek-v4-pro"` → `Ok(("deepseek", "deepseek-v4-pro"))`
- `"litellm/openai/gpt-4.1"` → `Ok(("litellm", "openai/gpt-4.1"))`（最初の `/` のみで split）
- `"no-slash"` → `Err(ProxyError::InvalidModel(...))`
- `""` → `Err(ProxyError::InvalidModel(...))`

#### `fn resolve_model(...) -> Result<ResolvedModel, ProxyError>`
シグネチャ:
```rust
fn resolve_model(
    model_name: &str,
    provider_config: &ProviderConfig,
    global_aliases: &BTreeMap<String, String>,
) -> Result<ResolvedModel, ProxyError>
```
解決順序:
1. **Provider alias**: `provider_config.model_aliases` に一致 → `find_by_upstream` でモデル検索
2. **Global alias**: `global_aliases` に一致 → 値が `provider/model` 形式なら再帰的に解決。それ以外は `find_by_upstream` で検索
3. **Public model match**: `provider_config.models` から `model.public == model_name` を検索 → `ResolvedModel { public, upstream }`
4. **Allow-list empty fallback**: `provider_config.models` が空なら任意の model_name を許可 → `ResolvedModel { public: model_name, upstream: model_name }`
5. **Not found**: `Err(ProxyError::InvalidModel(...))`

内部ヘルパー:
- `fn find_by_upstream(provider_config: &ProviderConfig, upstream_name: &str) -> Result<ResolvedModel, ProxyError>` — models から upstream が一致する最初のエントリを返す。`ResolvedModel { public: model.public, upstream: upstream_name }`
- `fn resolve_full(target: &str, global_aliases: &BTreeMap<String, String>) -> Result<ResolvedModel, ProxyError>` — `target` を `provider/model` として parse し、再帰的に解決。`ResolvedModel { public: model_name, upstream: model_name }` を返す（上流プロバイダー名を upstream として保持）

#### `fn resolve_api_format(wire_api: &OpenAiWireApi, base_url: &str) -> ApiFormat`
- `OpenAiWireApi::ChatCompletions` → `ApiFormat::OpenaiChat`
- `OpenAiWireApi::Responses` → `ApiFormat::OpenaiResponses`
- `OpenAiWireApi::Auto` → base_url のパス末尾で判定
  - `"/v1/chat/completions"` または `"/chat/completions"` を含む → `ApiFormat::OpenaiChat`
  - `"/v1/responses"` または `"/responses"` を含む → `ApiFormat::OpenaiResponses`
  - デフォルト → `ApiFormat::OpenaiChat`

`ApiFormat` enum は本チケットで `routing/mod.rs` 内にローカル定義する。M3-5 (Translate) で `llm-bridge-core` の `ApiFormat` と統合する。

#### `fn build_upstream_headers(client_headers: &HeaderMap, api_key: &str) -> HeaderMap`
- `HOP_BY_HOP_HEADERS` 定数（8種）に含まれるヘッダを除去
- `authorization` / `x-api-key` を除去
- `Authorization: Bearer {api_key}` で上書き

#### `impl LossyLevel { fn should_reject(self, allow_lossy: bool, error_lossy_continue: bool) -> bool }`
真理値表（RFC §6）:
| allow_lossy | error_lossy_continue | Error | Warn | Info |
|-------------|---------------------|-------|------|------|
| false | false | **true** (reject) | false | false |
| false | true | false | false | false |
| true | false | false | false | false |
| true | true | false | false | false |

実装: `matches!(self, LossyLevel::Error) && !allow_lossy && !error_lossy_continue`

### このチケットで実装しないこと

- `llm-bridge-core` 依存の追加（Phase 3）
- `resolve_api_format` の `ApiFormat` を `llm-bridge-core` の型と統合（Phase 3）
- M2-1 の KeyScheduler / M2-2 の ConcurrencyLimiter
- M3-1 以降の HTTP サーバー関連

## Investigation

### コードベース調査結果

- **発見1**: M0-1 (#155) で `ProviderConfig`, `GlobalConfig`, `OpenAiWireApi`, `ModelConfig` が定義済み。`ProviderConfig.model_aliases` は `BTreeMap<String, String>`、`provider_config.models` は `Vec<ModelConfig>`。
- **発見2**: M0-2 (#156) で `LossyLevel`, `ProxyError`, `ResolvedModel` が定義済み。
- **発見3**: 現状の Cargo.toml には `serde`, `toml`, `thiserror`, `http`, `serde_json(dev)` のみ。`llm-bridge-core` は未追加。
- **発見4**: RFC §4.1 に `parse_provider_model` / `resolve_model` の実装コードが記載済み。`resolve_full` と `find_by_upstream` の実装は RFC に明示されていないため、Tickets.md の仕様から推論して実装する。
- **発見5**: RFC §3.2 に `build_upstream_headers` と `HOP_BY_HOP_HEADERS` の実装コードが記載済み。
- **発見6**: RFC §6 に `LossyLevel::should_reject` の実装コードが記載済み。
- **発見7**: `llm-bridge-core::ApiFormat` に相当する型は現状存在しない。本チケットでは `routing/mod.rs` 内に簡易 `ApiFormat` enum を定義し、Phase 3 で置き換える予定。
- **発見8**: `src/lib.rs` は現在 `pub mod config;` のみ。`pub mod routing;` と `pub mod util;` を追加する必要がある。

### 依存関係の充足確認

| 先行チケット | ステータス | 備考 |
|------------|-----------|------|
| M0-1 (#155) | ✅ reviewed | ProviderConfig, ModelConfig, OpenAiWireApi 必須 |
| M0-2 (#156) | ✅ reviewed | LossyLevel, ProxyError, ResolvedModel 必須 |

## Test Plan

### ユニットテスト計画

全てのテストは各モジュール内の `#[cfg(test)] mod tests` に記述する。全テストメモリ内完結・決定論的・外部依存なし。

#### `routing/mod.rs` のテスト（12ケース）

| # | テストケース | 関数 | 種別 | 検証内容 |
|---|------------|------|------|---------|
| 1 | `parse_provider_model_normal` | parse | 正常系 | `"deepseek/deepseek-v4"` → `("deepseek", "deepseek-v4")` |
| 2 | `parse_provider_model_multi_slash` | parse | 正常系 | `"litellm/openai/gpt-4.1"` → `("litellm", "openai/gpt-4.1")` |
| 3 | `parse_provider_model_no_slash` | parse | 異常系 | `"no-slash"` → Err(InvalidModel) |
| 4 | `parse_provider_model_empty` | parse | 境界値 | `""` → Err(InvalidModel) |
| 5 | `resolve_model_provider_alias` | resolve | 正常系 | provider.model_aliases に一致するケース |
| 6 | `resolve_model_global_alias` | resolve | 正常系 | global_aliases に一致するケース |
| 7 | `resolve_model_global_alias_recursive` | resolve | 正常系 | global alias 値が `provider/model` 形式のケース |
| 8 | `resolve_model_allow_list_empty` | resolve | 正常系 | models=[] で任意の model_name を許可 |
| 9 | `resolve_model_not_found` | resolve | 異常系 | 未登録 model + 非空 allow-list → Err(InvalidModel) |
| 10 | `resolve_model_public_match` | resolve | 正常系 | model.public に一致するケース |
| 11 | `resolve_api_format_auto_chat` | api_format | 正常系 | Auto + chat/completions URL → OpenaiChat |
| 12 | `resolve_api_format_auto_responses` | api_format | 正常系 | Auto + responses URL → OpenaiResponses |

#### `util/mod.rs` のテスト（4ケース）

| # | テストケース | 関数 | 種別 | 検証内容 |
|---|------------|------|------|---------|
| 13 | `build_upstream_headers_filters_auth` | headers | 正常系 | client_headers の Authorization が除去される |
| 14 | `build_upstream_headers_filters_hop_by_hop` | headers | 正常系 | connection / keep-alive 等が除去される |
| 15 | `build_upstream_headers_sets_bearer` | headers | 正常系 | Bearer + api_key で上書きされる |
| 16 | `build_upstream_headers_preserves_other` | headers | 正常系 | content-type 等の安全なヘッダは維持される |

#### `config/mod.rs` への追加テスト（3ケース）

| # | テストケース | 関数 | 種別 | 検証内容 |
|---|------------|------|------|---------|
| 17 | `lossy_level_error_reject` | should_reject | 正常系 | Error + !allow_lossy + !error_lossy_continue → true |
| 18 | `lossy_level_error_continue` | should_reject | 正常系 | Error + !allow_lossy + error_lossy_continue → false |
| 19 | `lossy_level_warn_no_reject` | should_reject | 正常系 | Warn → 常に false |

### ユニットテスト不可能な項目（例外）

- `resolve_model` が `AppConfig` 全体を参照したクロスプロバイダー解決 — 本チケットでは単一 ProviderConfig のみを引数に取る純粋関数。クロスプロバイダー解決は M3-1 の AppState コンテキストで行う。
- `build_upstream_headers` の実際の HTTP リクエストへの影響 — M3-4 の integration test で検証。
- `resolve_api_format` の `llm-bridge-core` 統合 — Phase 3 で行う。

## Boy Scout Rule — 翻訳可能性計画

既存コードに対する改善:
- `src/config/mod.rs` に `impl LossyLevel` ブロックを追加 — 既存 enum にメソッドを追加するのみで、既存コードの修正は行わない。

新規コードの翻訳可能性:
- **関数名は動詞句**: `parse_provider_model`, `resolve_model`, `resolve_api_format`, `build_upstream_headers`
- **変数名はドメイン概念**: `provider_name`, `model_name`, `spec`, `allow_lossy`, `error_lossy_continue`
- **定数は意味のある名前**: `HOP_BY_HOP_HEADERS` で8種のヘッダ名を列挙
- **一関数一責務**: 5つの関数はそれぞれ単一の責務に特化
- **コメントは「なぜ」**: RFC の設計判断（なぜ最初の `/` のみで split するか、なぜ特定のヘッダを除外するか）をコードコメントで説明

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存44 + 新規19 = 63）通過する
- [ ] `parse_provider_model` が RFC §4.1 の仕様通り動作する
- [ ] `resolve_model` が4段階の解決順序を正しく実装している
- [ ] `build_upstream_headers` が hop-by-hop header / auth header を除去し、Bearer で上書きする
- [ ] `LossyLevel::should_reject` が RFC §6 の真理値表と一致する
- [ ] `resolve_api_format` が `ApiFormat` enum を返す

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (reviewed)** | M0-1 (#155) | ProviderConfig, ModelConfig, OpenAiWireApi, LogFormat |
| **先行実装必須 (reviewed)** | M0-2 (#156) | LossyLevel, ProxyError, ResolvedModel |
| **後続** | M1-2 (#158) | AppConfig::validate — 本チケットの型を利用する |
| **後続** | M3-1 (#TBD) | AppState + Router — 本チケットの routing 関数を利用 |
| **後続** | M3-5 (#TBD) | Translate mode — resolve_api_format の結果を利用 |
