---
ticket_id: 164
title: M3-3: Endpoint handlers — healthz / metrics / v1/models / v1/messages skeleton
slug: m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/review.md
---
# M3-3: Endpoint handlers — healthz / metrics / v1/models / v1/messages skeleton

> **参照設計書:** crates/anthropx/RFC.md (§3.3 エンドポイント一覧, §10 可観測性)
> **生成元:** Tickets.md L326-358

## Summary

4 つのエンドポイント handler をスタブから実際の実装に置き換える。M3-1, M3-2 で整った Router + Auth + IntoResponse の上に、実際のリクエスト処理ロジックを載せる。`/v1/messages` の provider 処理部分は `[::STUB::]` として M3-4/M3-5 に委譲する。

## Background

M3-1/M3-2 までで以下の基盤が整い、http/routes.rs には 4 つの `[::STUB::]` handler が残されている：

| スタブ | ファイル | 行 | 状態 |
|-------|---------|----|------|
| healthz → `StatusCode::OK` のみ | routes.rs:17 | 🔴 スタブ |
| metrics_handler → `{"metrics":{}}` | routes.rs:25 | 🔴 スタブ |
| list_models → `{"data":[]}` | routes.rs:35 | 🔴 スタブ |
| handle_messages → 固定 JSON | routes.rs:48 | 🔴 スタブ |

また、既存の `routing/mod.rs` には `parse_provider_model()` / `resolve_model()` が実装済みであり、handler から利用可能。

本チケットではこれら 4 つのスタブを実装に置き換え、`register_metrics()` / `record_request()` による簡易メトリクス収集の骨格を追加する。

## Scope

### 実装対象

1. **`http/routes.rs`** (修正)
   - `healthz` → `Json(serde_json::json!({"status": "ok"}))` を返す
   - `metrics_handler` → サーバー情報＋リクエストカウンタを返す（簡易テキスト形式）
   - `list_models` → 全 provider の enabled model をソート済みで列挙（Anthropic 互換 + 拡張フィールド）
   - `handle_messages` → request_id 生成 → model 抽出 → `parse_provider_model` → provider 解決 → model 解決 → `[::STUB::]` provider 処理委譲
   - 4 つの `[::STUB::]` マーカーを解決 (handle_messages の provider 処理部分は新たな `[::STUB::]` として維持)

2. **`observability/mod.rs`** (新規)
   - モジュール宣言のみ
   - server feature で条件付きコンパイル

3. **`observability/metrics.rs`** (新規)
   - `register_metrics()` — メトリクスカウンタの初期化（AtomicU64 のグローバル変数）
   - `record_request(status: u16)` — リクエスト完了時に呼び出し、カウンタを更新
   - `format_metrics() -> String` — カウンタ値を文字列化（Prometheus 互換形式）
   - server feature で条件付きコンパイル

4. **`lib.rs`** (修正)
   - `pub mod observability;`（`#[cfg(feature = "server")]`）追加

5. **tests/router.rs のテスト** (修正)
   - `router.rs` の統合テストに list_models / handle_messages の検証を追加

### 非対象（別チケット）

- handle_messages の provider 処理（handle_transparent / handle_translate）→ M3-4, M3-5
- Prometheus exporter の本格実装（本チケットでは AtomicU64 ベースの簡易カウンタ）
- バックエンドのレスポンスストリーミング処理
- ServerHandle や ProxyServer::start の起動シーケンス

## Investigation

### 既存コードの状態

```
crates/anthropx/src/
├── lib.rs               ✅ モジュール宣言（cli/config/provider/routing/util/app_state/http）
├── app_state.rs         ✅ AppState { config, http_clients, schedulers, limiters }
├── config/mod.rs        ✅ AppConfig, GlobalConfig, ProviderConfig, ModelConfig 等
├── routing/
│   ├── mod.rs           ✅ parse_provider_model(), resolve_model(), resolve_api_format()
│   └── scheduler.rs     ✅ KeyScheduler
├── http/
│   ├── auth.rs          ✅ authorize_client, filter_upstream_headers
│   ├── errors.rs        ✅ ProxyError::into_response
│   ├── router.rs        ✅ build_router() + tests
│   └── routes.rs        🔴 4 handler スタブ（本チケットの実装対象）
└── util/
    ├── mod.rs           ✅ build_upstream_headers() + HOP_BY_HOP_HEADERS
    └── ids.rs           ✅ generate_request_id()
```

### 既存スタブ（routes.rs）

```rust
// [::STUB::] M3-3 で本実装に置き換える。現状は固定 JSON を返す。
pub async fn healthz() -> StatusCode { StatusCode::OK }
pub async fn metrics_handler() -> Json<Value> { json!({"metrics": {}}) }
pub async fn list_models(State(_state): State<Arc<AppState>>) -> Json<Value> { json!({"object":"list","data":[]}) }
pub async fn handle_messages(State(_state), Json(_body)) -> Json<Value> { /* fixed stub */ }
```

### 既存 routing 関数（利用可能）

`routing/mod.rs` には以下の関数が実装済み：
- `parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError>` — `"provider/model"` 分割
- `resolve_model(model_name, provider_config, global_aliases) -> Result<ResolvedModel, ProxyError>` — 4段階 alias 解決

### 既存 util 関数（利用可能）

`util/ids.rs`:
- `generate_request_id() -> String` — UUID v4（server feature 有効時）

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M3-1 (ticket 162) | 先行実装必須: Router + State + IntoResponse | ✅ reviewed |
| M3-2 (ticket 163) | 先行実装必須: Auth middleware + build_router | ✅ reviewed |
| M3-4 (ticket 165) | 後続: Transparent provider mode（本チケット完了後に着手） | ⏳ 未着手 |
| M3-5 (ticket 166) | 後続: Translate provider mode | ⏳ 未着手 |

## Test Plan

### ユニットテスト計画

#### 1. healthz — 固定 JSON 応答

テスト対象: `http/routes.rs` の `healthz()`

| # | ケース | 期待結果 |
|---|--------|---------|
| 1 | GET /healthz → 200 + `{"status":"ok"}` | Content-Type: application/json |

#### 2. list_models — model 列挙

テスト対象: `http/routes.rs` の `list_models()`

| # | ケース | 条件 | 期待結果 |
|---|--------|------|---------|
| 1 | 空の providers | providers なし | `{"object":"list","data":[]}` |
| 2 | 単一 provider + 1 model | enabled=true | data に 1 件の model が含まれる |
| 3 | 複数 provider + 複数 model | ソート確認 | provider/public 昇順でソートされている |
| 4 | disabled model は除外 | enabled=false の model | data に含まれない |
| 5 | 全6フィールド確認 | 1 model のレスポンス | id / object / owned_by / display_name / upstream / enabled が存在 |

#### 3. handle_messages — routing

テスト対象: `http/routes.rs` の `handle_messages()`

| # | ケース | 条件 | 期待結果 |
|---|--------|------|---------|
| 1 | 有効な provider/model | `{"model":"test-provider/gpt-4"}` | 200 OK |
| 2 | model フィールドなし | `{}` | 400 + `invalid_request_error` |
| 3 | 不明な provider | `{"model":"unknown/gpt-4"}` | 400 + `UnknownProvider` |
| 4 | model 解決失敗 | `{"model":"test-provider/unknown-model"}`（空の allow-list 以外） | 400 + `InvalidModel` |
| 5 | response に request_id 由来の ID が含まれる | 正常系 | レスポンスの `id` フィールドが空でない |

#### 4. metrics — カウンタ動作

テスト対象: `observability/metrics.rs`

| # | ケース | 期待結果 |
|---|--------|---------|
| 1 | 初期状態で全カウンタが 0 | format_metrics() にカウンタ行が含まれる |
| 2 | record_request(200) で total/success 増加 | 数値が反映される |
| 3 | record_request(400) で total/4xx 増加 | 数値が反映される |
| 4 | record_request(500) で total/5xx 増加 | 数値が反映される |

### ユニットテスト不可能な項目（例外）

なし。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの翻訳可能性設計

1. **handler 関数名**: healthz / metrics_handler / list_models / handle_messages — 全て動詞句または役割を明示
2. **list_models**: 「全 provider の有効なモデルを収集し、ソートして返す」という逐語訳可能な流れ
3. **handle_messages**: 「request_id を生成し → model を抽出し → provider/model を解析し → provider を解決し → model を解決し → provider 処理に委譲する」という一文で読める

### 既存コードの改善

- `routes.rs` の `[::STUB::]` 4 件を解決（handle_messages の provider 処理部分は新たな `[::STUB::]` に）
- モジュール文章をスタブから本実装の説明に更新

## Acceptance Criteria

- [ ] `GET /healthz` → 200 + `{"status":"ok"}`
- [ ] `GET /v1/models` → 200 + ソート済み model 一覧（標準フィールド + 拡張フィールド）
- [ ] disabled model は `/v1/models` に含まれない
- [ ] `POST /v1/messages` に不正な model → 400 + `invalid_request_error`
- [ ] 存在しない provider → 400 + `UnknownProvider`
- [ ] handle_messages が request_id を生成する
- [ ] register_metrics / record_request が実装され、カウンタが動作する
- [ ] 残った `[::STUB::]` は handle_messages の provider 処理のみ
- [ ] `make check-be` が通過する
- [ ] 全テストが通過する
- [ ] clippy 警告がゼロ
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存・関連チケット ID の点検結果

- M3-1 (ticket 162): ✅ reviewed — Router + State + IntoResponse 利用可能
- M3-2 (ticket 163): ✅ reviewed — Auth middleware + build_router 利用可能
- M3-4 (ticket 165): 後続 — handle_messages の provider 処理を実装
- M3-5 (ticket 166): 後続 — Translate provider mode
- 循環依存: なし
- Tickets.md の依存関係記述と整合

### スタブの点検

`find-all-stubs.js` 結果（http モジュール内）:
- `routes.rs:17,25,35,48` → 4 handler（本チケットで解決 ✅ → provider 処理部分のみ新 `[::STUB::]` に）
- 未マークのスタブ: なし

### 成果物

- 計画: context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/plan.md（未作成）
- 実装サマリ: context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/implementation.md（未作成）
- レビュー報告書: context/0164-m3-3-endpoint-handlers-healthz-metrics-v1models-v1messages-skeleton/review.md（未作成）
