# M3-2: 認証 Tower middleware — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/http/auth.rs` | **新規** | `authorize_client` — Bearer/x-api-key 検証 middleware（条件付き）。`filter_upstream_headers` — クライアント認証 + hop-by-hop header 除去 middleware（常時適用） |
| `src/http/mod.rs` | 修正 | `pub mod auth;` 宣言追加 + モジュール説明更新 |
| `src/http/router.rs` | 修正 | `build_router()` に `middleware::from_fn` で 2 層の auth layer 適用。適用順序: client_auth（外側）→ upstream_auth（内側）→ routes。`[::STUB::]` 除去 |
| `src/util/mod.rs` | 修正 | `HOP_BY_HOP_HEADERS` を `pub(crate)` に公開。auth.rs から参照可能に |

## 解決したスタブ

- `http/router.rs:30` — `[::STUB::] auth middleware layer の追加は M3-2 で実装する。` → auth layer 適用 + スタブコメント除去 ✅

## テスト結果

| 条件 | 単体テスト | 結果 |
|------|-----------|------|
| default features (server) | **119 passed**（+8 new auth tests, +7 前回比） | ✅ |
| --no-default-features | **95 passed** | ✅ |
| clippy | 警告ゼロ | ✅ |

## 新規テスト内訳（8 ケース）

- authorize_client (7ケース): auth disabled, valid Bearer, empty Bearer, valid x-api-key, no credentials, non-Bearer auth, empty x-api-key
- filter_upstream_headers (1統合ケース): auth/x-api-key/hop-by-hop 除去、Content-Type 維持

## 品質チェック

- run-quality-checks.js totalIssues: 14 — 全件 `util/mod.rs` の既存コード。新規ファイルに指摘なし
- `#[allow]` 抑制: auth.rs / router.rs に該当なし

## Boy Scout 改善

- `util/mod.rs` の `HOP_BY_HOP_HEADERS` を `pub(crate)` に変更（auth.rs から再利用可能に）
- `router.rs` の `[::STUB::]` を本実装に置き換え
