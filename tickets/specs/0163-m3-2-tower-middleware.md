---
ticket_id: 163
title: M3-2: 認証 Tower middleware
slug: m3-2-tower-middleware
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0163-m3-2-tower-middleware/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0163-m3-2-tower-middleware/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0163-m3-2-tower-middleware/review.md
---
# M3-2: 認証 Tower middleware

> **参照設計書:** crates/anthropx/RFC.md (§3.2 クライアント認証 + upstream 認証)
> **生成元:** Tickets.md L299-324

## Summary

クライアント→proxy 方向の認証（client_auth_layer）と proxy→upstream 方向の認証情報処理（upstream_auth_layer）の 2 つの Tower Layer を実装する。また、M3-1 の build_router に残された `[::STUB::]`（auth middleware 追加）を解決する。

## Background

HTTP プロキシサーバーには、クライアントからのリクエストを検証する認証レイヤーと、upstream プロバイダーへの認証情報を安全に注入するレイヤーの 2 つが必要である。

M3-1 で build_router の骨格は整ったが、auth middleware の追加はスタブとして保留されていた：

```
router.rs:30: /// [::STUB::] auth middleware layer の追加は M3-2 で実装する。
```

また、既存の `build_upstream_headers()`（M1-1, util/mod.rs）は header フィルタリングの純粋ロジックを提供済みだが、実際の Tower Layer としての適用は未実装である。

## Scope

### 実装対象

1. **`http/auth.rs`** (新規)
   - `client_auth_layer(config: &GlobalConfig) -> Option<Layer>` — クライアント認証（条件付き適用）
     - `require_client_auth` が `false` → `None`（Layer を積まない）
     - 認証検証: `Authorization: Bearer <token>` または `x-api-key: <key>` の存在と非妥当性を検証
     - トークンが空または欠如 → `ProxyError::Unauthorized`（401）
     - トークン形式の基本検証（空文字列でないこと）
   - `upstream_auth_layer() -> Layer` — upstream 認証（常時適用）
     - クライアント由来の `Authorization` / `x-api-key` header を削除
     - upstream への認証は reqwest::Client の default header 経由で行うため、本 Layer での注入は不要
     - 透過転送時に hop-by-hop header を除去するため内部で `build_upstream_headers()` を利用

2. **`http/mod.rs`** (修正)
   - `pub mod auth;` 宣言追加

3. **`http/router.rs`** (修正)
   - `build_router()` 内で auth middleware layer を適用
   - 適用順序: `client_auth_layer`（外側）→ `upstream_auth_layer`（内側）→ routes
   - `[::STUB::]` コメントを除去

### 非対象（別チケット）

- handler の本実装（M3-3）
- Transparent / Translate モード（M3-4, M3-5）
- 本番向け API key ホワイトリスト検証（本チケットでは存在確認 + 非空チェックに留める）

## Investigation

### 既存コードの状態

```
crates/anthropx/src/
├── config/mod.rs       ✅ GlobalConfig.require_client_auth: bool（デフォルト false）
├── util/mod.rs         ✅ build_upstream_headers()（hop-by-hop フィルタ + Bearer 注入）
├── http/
│   ├── mod.rs          ✅ サブモジュール宣言（errors / router / routes） — auth 未宣言
│   ├── router.rs       ✅ build_router() — 🔴 auth middleware 未適用（[::STUB::]）
│   ├── errors.rs       ✅ ProxyError::into_response（Unauthorized→401, Forbidden→403）
│   └── routes.rs       ✅ 4 handler スタブ（M3-3 で本実装）
└── app_state.rs        ✅ AppState（config, http_clients, schedulers, limiters）
```

### キーコード: router.rs のスタブ

`crates/anthropx/src/http/router.rs:30`:
```rust
/// [::STUB::] auth middleware layer の追加は M3-2 で実装する。
pub fn build_router(state: Arc<AppState>) -> Router {
    // ...
    let api_routes = Router::new()
        .route(...)
        .route(...)
        .with_state(state);
    // auth layers はまだ適用されていない
}
```

### キーコード: build_upstream_headers（util/mod.rs）

```rust
pub fn build_upstream_headers(client_headers: &HeaderMap, provider_api_key: &str) -> HeaderMap {
    // hop-by-hop 除外、client auth 除外、provider Bearer 注入
}
```

この関数は upstream_auth_layer 内で呼び出して使用する。

### キーコード: ProxyError（config/mod.rs）

```rust
pub enum ProxyError {
    Unauthorized,  // 401 + authentication_error
    Forbidden,     // 403 + permission_error
    // ...
}
```

認証失敗時のエラー応答は M3-1 で既に IntoResponse 実装済み。

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M3-1 (ticket 162) | **先行実装必須**: Router + AppState + ProxyError::into_response | ✅ reviewed |
| M3-3 (ticket 164) | 後続: handler 本実装。認証 Layer が整った後に着手 | ⏳ 未着手 |

### 注意点: client_auth_layer のトークン検証

本チケットでは API key ホワイトリストによる検証は行わない。`require_client_auth=true` の場合にクライアントが何らかの非空の認証情報を提示したことのみを確認する。これにより:
- 開発環境での即座の利用開始
- プロダクション環境ではリバースプロキシ（nginx 等）の前段認証と併用可能

将来的に `GlobalConfig` に `allowed_client_keys` フィールドを追加してホワイトリスト検証を実装する場合、本 Layer の拡張で対応可能。

## Test Plan

### ユニットテスト計画

#### 1. client_auth_layer — Layer の有無と認証動作

テスト対象: `http/auth.rs` の `client_auth_layer()`

| # | ケース | 条件 | 期待結果 |
|---|-------|------|---------|
| 1 | 条件付きスキップ | `require_client_auth=false` | `None` が返る |
| 2 | 有効な Bearer 通過 | `require_client_auth=true` + `Authorization: Bearer valid-token` | 200（handler 通過） |
| 3 | 無効な Bearer | `require_client_auth=true` + `Authorization: Bearer `（空） | 401 |
| 4 | 有効な x-api-key 通過 | `require_client_auth=true` + `x-api-key: valid-key` | 200 |
| 5 | 認証 header なし | `require_client_auth=true` + 認証 header なし | 401 |
| 6 | 不正な Bearer 形式 | `require_client_auth=true` + `Authorization: Basic xyz` | 401（Bearer 以外は却下） |
| 7 | 空の x-api-key | `require_client_auth=true` + `x-api-key: `（空） | 401 |

#### 2. upstream_auth_layer — 認証ヘッダ除去

テスト対象: `http/auth.rs` の `upstream_auth_layer()`

| # | ケース | 入力 | 期待結果 |
|---|-------|------|---------|
| 1 | Authorization 除去 | Bearer token 付きリクエスト | upstream に到達時は Authorization が除去されている |
| 2 | x-api-key 除去 | x-api-key 付きリクエスト | upstream に到達時は x-api-key が除去されている |
| 3 | 通常 header 維持 | Content-Type 付きリクエスト | Content-Type は維持される |
| 4 | hop-by-hop header 除去 | Connection などの hop-by-hop header | upstream に到達時は除去されている |

#### 3. build_router 統合

テスト対象: `http/router.rs` の `build_router()`（auth layer 適用後）

| # | ケース | 条件 | 期待結果 |
|---|-------|------|---------|
| 1 | auth=off + 認証なしで OK | `require_client_auth=false` | 全エンドポイント 200 |
| 2 | auth=on + 認証なしで 401 | `require_client_auth=true` + 認証 header なし | 401 |
| 3 | auth=on + Bearer で OK | `require_client_auth=true` + Bearer token | 200 |

### ユニットテスト不可能な項目（例外）

なし。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの翻訳可能性設計

1. **`client_auth_layer`**: 「クライアント認証が必須なら Layer を返し、そうでなければ None を返す」と逐語訳可能
2. **`upstream_auth_layer`**: 「上流認証 Layer を返す」— 関数名自体が目的を宣言
3. **auth middleware 関数**: `authorize_client` / `filter_upstream_headers` のように、処理内容を動詞句で命名

### 既存コードの改善

- `router.rs` の `[::STUB::]` を実際の auth layer 適用に置き換える（コメント除去）

## Acceptance Criteria

- [ ] `client_auth_layer()` が `require_client_auth=false` で `None` を返す
- [ ] `client_auth_layer()` が `require_client_auth=true` で認証検証 Layer を返す
- [ ] 有効な Bearer token / x-api-key でリクエストが通過する
- [ ] 認証情報がない場合に 401 が返る
- [ ] `upstream_auth_layer()` がクライアント由来の Authorization / x-api-key を除去する
- [ ] `upstream_auth_layer()` が hop-by-hop header を除去する
- [ ] `build_router()` に auth layer が適用され、`[::STUB::]` が除去されている
- [ ] `make check-be` が通過する
- [ ] 全テストが通過する（`make test`）
- [ ] clippy 警告がゼロ
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存・関連チケット ID の点検結果

- M3-1 (ticket 162): ✅ reviewed。Router + errors が利用可能
- M3-3 (ticket 164): 後続。本チケット完了後に着手。Tickets.md の依存関係記述と整合
- 循環依存: なし

### スタブの点検

`crates/anthropx/src/http/router.rs:30` に auth middleware 追加の `[::STUB::]` あり。
本チケットで解決（auth.rs 実装 + router.rs での layer 適用 + `[::STUB::]` 除去）。
既存ソースに未マークのスタブはなし。

### 成果物

- 計画: context/0163-m3-2-tower-middleware/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0163-m3-2-tower-middleware/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0163-m3-2-tower-middleware/review.md（未作成、/review-ticket 全チェック通過後に作成）
