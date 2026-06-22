---
ticket_id: 172
title: ProviderClient 導入 + ConcurrencyLimiter 接続
slug: providerclient-concurrencylimiter
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0172-providerclient-concurrencylimiter/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0172-providerclient-concurrencylimiter/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0172-providerclient-concurrencylimiter/review.md
---

# チケット #172: ProviderClient 導入 + ConcurrencyLimiter 接続

## Summary

現在 `AppState` が別々に保持する3つの `HashMap`（`http_clients`、`schedulers`、`limiters`）を `ProviderClient` 構造体に統合する。ConcurrencyLimiter を各ハンドラの先頭で呼び出すよう接続する。これにより handler の引数と内部参照が単純化され、並行性制御が機能する状態になる。

## Background

現在の `AppState` は4フィールドを持つ:
- `config: AppConfig`
- `http_clients: HashMap<String, reqwest::Client>`
- `schedulers: HashMap<String, KeyScheduler>`
- `limiters: HashMap<String, ConcurrencyLimiter>`

各ハンドラ（`handle_transparent`、`handle_translate`）はこの3つの HashMap から同一 provider 名で個別に値を取得している。これは:
- **重複コード**: 毎回3回の lookup が必要
- **ConcurrencyLimiter が未接続**: `limiter.acquire()` がどこからも呼ばれていない
- **拡張性の低下**: 新しい per-provider リソースが増えるたびに HashMap が増える

`ProviderClient` に統合することで、1回の lookup ですべての per-provider リソースにアクセスできる。

## Scope

### 実装するもの

1. **`provider/mod.rs`**: `ProviderClient` 構造体を定義
   - `config: ProviderConfig`（clone）
   - `http_client: reqwest::Client`
   - `scheduler: KeyScheduler`
   - `limiter: ConcurrencyLimiter`

2. **`app_state.rs`**: AppState の再構成
   - `providers: HashMap<String, ProviderClient>` に統合
   - `resolve_provider(name) -> Result<&ProviderClient, ProxyError>` を追加
   - `AppState::new()` の引数を `(AppConfig, HashMap<String, ProviderClient>)` に変更

3. **`lifecycle.rs`**: Builder 関数の再編
   - `build_http_clients()`、`build_schedulers()`、`build_limiters()` → `build_provider_clients()` に統合
   - `ProxyServer::start()` で統合関数を呼ぶ

4. **`provider/transparent.rs`**: `handle_transparent()` の引数・内部参照を ProviderClient 経由に変更
   - `state.resolve_provider()` で取得
   - `provider.limiter.acquire().await?` を先頭で呼び出す

5. **`provider/translate.rs`**: 同上

6. **`http/routes.rs`**: `handle_messages()` の修正（必要な場合）

7. **`config/mod.rs` または `config/errors.rs`**: `impl From<LimiterError> for ProxyError` を追加
   - `LimiterError::QueueFull` → `ProxyError::QueueFull`
   - `LimiterError::Closed` → `ProxyError::Internal`

8. **`app_state.rs` または lifecycle.rs**: テスト fixtures の更新

### スコープ外

- `config/parse.rs` と `config/validate.rs` への分割（RFC のモジュール構造に追従するものの、本チケットの目的と直接関係しないため M5-3 以降に先送り）
- `observability/metrics.rs` の配線（M5-3）
- integration-test feature（M5-4）
- routing/mod.rs の `ApiFormat` → llm-bridge-core `ApiFormat` への完全置き換え
  （`[::STUB::]` は本チケットで解決するが、`routing::ApiFormat` 自体は `resolve_api_format()` の戻り値として残す）

## Investigation

### 現在のコード構成

**`app_state.rs`**:
```rust
pub struct AppState {
    pub config: AppConfig,
    pub http_clients: HashMap<String, reqwest::Client>,
    pub schedulers: HashMap<String, KeyScheduler>,
    pub limiters: HashMap<String, ConcurrencyLimiter>,
}
```

**`provider/transparent.rs`**: 先頭で3回の lookup:
```rust
let client = state.http_clients.get(provider_name)?;
let scheduler = state.schedulers.get(provider_name)?;
let provider_config = state.config.providers.get(provider_name)?;
```

**`provider/translate.rs`**: 同様に3回の lookup（M5-1 で実装済み）:
```rust
let provider_config = state.config.providers.get(provider_name)?;
let client = state.http_clients.get(provider_name)?;
let scheduler = state.schedulers.get(provider_name)?;
```

**`lifecycle.rs`**: 3つの独立した builder 関数:
```rust
let http_clients = build_http_clients(&config);
let schedulers = build_schedulers(&config);
let limiters = build_limiters(&config);
```

**`ConcurrencyLimiter::acquire()`**: どこからも呼ばれていない。

**`LimiterError`**: `From<LimiterError> for ProxyError` 未実装。

### `routing/mod.rs` のスタブ

M5-1 で追加した `[::STUB::]`:
```rust
/// [::STUB::] M5-2 で llm_bridge_core::model::ApiFormat に完全置き換え予定。
```
→ 本チケットでは解決しない（routing::ApiFormat を削除せず、`to_llm_api_format()` 変換の存在を維持する）。

### スタブ検出結果

- `routing/mod.rs:24`: `[::STUB::] M5-2 で llm_bridge_core::model::ApiFormat に完全置き換え予定。` → **保留妥当**（routing::ApiFormat の完全削除は別チケット）

新たなスタブは必要なし。

## Test Plan

### ユニットテスト計画（カバレッジ目標: 85%）

| # | テストケース | 種類 | 検証内容 |
|---|------------|------|---------|
| 1 | ProviderClient が全フィールドを保持する | 正常系 | 各フィールドに正しくアクセスできる |
| 2 | resolve_provider が存在する provider 名で Ok | 正常系 | 正しい ProviderClient が返る |
| 3 | resolve_provider が存在しない名で UnknownProvider | 異常系 | 適切なエラーが返る |
| 4 | build_provider_clients が全 provider を生成 | 正常系 | provider 数分のクライアントが生成される |
| 5 | acquire → permit drop → 再 acquire（既存 limiter テスト） | 正常系 | 並行性制御が動作する |
| 6 | LimiterError → ProxyError マッピング | 正常系 | QueueFull → QueueFull, Closed → Internal |
| 7 | handle_transparent 先頭で acquire が呼ばれる | 正常系 | acquire 後の permit が正しく解放される（型検証） |
| 8 | handle_translate 先頭で acquire が呼ばれる | 正常系 | 同上 |

### ユニットテスト不可能な項目（例外）

- なし（全項目がユニットテストで検証可能）

## Acceptance Criteria

- [ ] `ProviderClient` が config / http_client / scheduler / limiter を束ねる単一構造体として定義される
- [ ] `AppState` の3つの HashMap が `providers: HashMap<String, ProviderClient>` に統合される
- [ ] `state.resolve_provider(name)` が `Result<&ProviderClient, ProxyError>` を返す
- [ ] `build_provider_clients()` が3つの builder 関数を統合する
- [ ] LimiterError → ProxyError の `From` 実装が追加される
- [ ] `handle_transparent()` と `handle_translate()` が `resolve_provider()` を使用し、先頭で `limiter.acquire()` を呼ぶ
- [ ] 全ユニットテストが `cargo test` でパスする
- [ ] 既存テストに回帰がない
- [ ] コンパイル警告0
- [ ] 翻訳可能性の検証が通っている

## Notes

- `ProviderClient` への `ProviderConfig` の格納は clone とする。`AppState` の `config.providers` との二重持ちになるが、`resolve_provider()` の戻り値で config も一緒に返せる利点が勝る。設定値は起動後に変更されないため clone のコストは無視できる。
- `handle_transparent` / `handle_translate` のシグネチャは `state: Arc<AppState>` のまま変更しない（`resolve_provider()` を内部で呼ぶ）。
- `AppState::new()` の引数が変更になるため、全テストファイルの `AppState::new()` 呼び出しを修正する必要がある。

### 成果物

- 計画: context/0172-providerclient-concurrencylimiter/plan.md（未作成）
- 実装サマリ: context/0172-providerclient-concurrencylimiter/implementation.md（未作成）
- レビュー報告書: context/0172-providerclient-concurrencylimiter/review.md（未作成）
