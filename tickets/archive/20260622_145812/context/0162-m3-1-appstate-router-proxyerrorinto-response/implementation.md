# M3-1: AppState + Router + ProxyError::into_response — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `Cargo.toml` | 修正 | `[features]` 導入（default = ["server"], server = axum/reqwest/uuid/tokio-full）。axum 0.8 / reqwest 0.13 / uuid 1.23 / serde_json / axum-test 追加 |
| `src/lib.rs` | 修正 | app_state / http モジュールを `#[cfg(feature = "server")]` で条件付き宣言。pub use を複数行＋コメントに改善 |
| `src/app_state.rs` | **新規** | AppState struct（config, http_clients, schedulers, limiters）。`#[cfg(feature = "server")]` ガード |
| `src/http/mod.rs` | **新規** | サブモジュール宣言のみ（errors / router / routes）。実装ロジックは各子モジュールに委譲 |
| `src/http/router.rs` | **新規** | build_router() — 4 エンドポイント（healthz/metrics/v1/models/v1/messages）+ url_prefix nest |
| `src/http/errors.rs` | **新規** | impl IntoResponse for ProxyError — 12 variant の Anthropic 互換エラースキーマ変換 |
| `src/http/routes.rs` | **新規** | 4 handler スタブ（`[::STUB::]` マーカー付き）。M3-3 で本実装予定 |
| `src/util/mod.rs` | 修正 | ids サブモジュール宣言追加 |
| `src/util/ids.rs` | **新規** | generate_request_id() — UUID v4（server feature 有効時）/ タイムスタンプ＋カウンタ（無効時） |

## テスト結果

- デフォルト feature: **112 passed**（111 unit + 1 doc-test）
- --no-default-features: **96 passed**（95 unit + 1 doc-test）
- 新規テスト: ProxyError 全 12 variant × IntoResponse 検証（status / error_type / Content-Type / JSON schema）、build_router 3 テスト（4 endpoints / 404 / url_prefix）、generate_request_id 3 テスト（non-empty / unique / UUID v4 format）

## 品質チェック

- run-quality-checks.js totalIssues: 18（全件 テストコード内 または 既存コード。スコープ内の mod.rs 実装ロジック問題は router.rs 抽出で解決済み）

## スタブ

- `http/routes.rs` の 4 handler に `[::STUB::]` マーカー付与
- 既存ソース内の `[::STUB::]` は Tickets.md に設計上の言及のみで、実装上のスタブはなし
