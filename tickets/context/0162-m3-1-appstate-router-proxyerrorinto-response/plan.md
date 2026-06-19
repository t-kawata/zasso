# M3-1: AppState + Router + ProxyError::into_response — 実装計画

## 要件の再確認

HTTP サーバーに必要な3要素を実装する：
1. **AppState** — サーバー実行時状態（config, http_clients, schedulers, limiters）を Arc で共有
2. **ProxyError::into_response** — 全12 variant を Anthropic 互換エラースキーマの JSON に変換
3. **build_router** — 4 エンドポイントを Axum Router として組み立て、url_prefix 対応

handler は `[::STUB::]` 付きスタブ。認証 middleware はプレースホルダ（M3-2 で実装）。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `Cargo.toml` | 修正 | `[features]` 導入: server / axum / reqwest / uuid |
| `src/lib.rs` | 修正 | app_state / http モジュール宣言追加 |
| `src/app_state.rs` | 新規 | AppState struct + new() コンストラクタ |
| `src/http/mod.rs` | 新規 | build_router() + 子モジュール宣言 |
| `src/http/errors.rs` | 新規 | impl IntoResponse for ProxyError |
| `src/http/routes.rs` | 新規 | 4 handler スタブ + `[::STUB::]` |
| `src/util/ids.rs` | 新規 | generate_request_id() |

## Boy Scout 改善
- lib.rs の `pub use` 行を複数行に分割しコメント付与

## テスト計画

1. ProxyError::into_response — 全12 variant の status = error_type = message = Content-Type 検証
2. build_router — 4 エンドポイント登録 + 404 + url_prefix 確認
3. generate_request_id — UUID v4 形式・一意性検証

## 実装手順

Phase 1: Cargo.toml 修正（features + dependencies）
Phase 2: util/ids.rs 作成
Phase 3: app_state.rs 作成
Phase 4: http/errors.rs 作成
Phase 5: http/routes.rs 作成
Phase 6: http/mod.rs 作成
Phase 7: lib.rs 修正
Phase 8: ビルド検証 (make check-be)
Phase 9: テスト実装 + 実行 (make test)
Phase 10: 品質チェック

## リスク

- axum 0.8 バージョン競合 → cargo add で解決
- server feature 無効時のコンパイル → `--no-default-features` で確認
