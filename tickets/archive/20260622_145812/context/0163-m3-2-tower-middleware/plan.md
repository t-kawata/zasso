# M3-2: 認証 Tower middleware — 実装計画

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/http/auth.rs` | 新規 | authorize_client / filter_upstream_headers の 2 つの middleware 関数 |
| `src/http/mod.rs` | 修正 | pub mod auth; 追加 |
| `src/http/router.rs` | 修正 | build_router で auth layer 適用 + `[::STUB::]` 除去 |
| `src/util/mod.rs` | 修正 | HOP_BY_HOP_HEADERS を pub(crate) に変更 |

## テスト計画（3 グループ 14 ケース）

1. authorize_client (7ケース): require_auth false/true, Bearer, x-api-key, 401条件
2. filter_upstream_headers (4ケース): Authorization/x-api-key除去, Content-Type維持, hop-by-hop除去
3. build_router統合 (3ケース): auth off→200, auth on→401, auth on+Bearer→200

## 実装手順

Phase 1: util/mod.rs — HOP_BY_HOP_HEADERS を pub(crate) に
Phase 2: http/auth.rs — middleware 関数実装
Phase 3: http/mod.rs — auth 宣言追加
Phase 4: http/router.rs — layer 適用 + スタブ除去
Phase 5: cargo check / cargo test
