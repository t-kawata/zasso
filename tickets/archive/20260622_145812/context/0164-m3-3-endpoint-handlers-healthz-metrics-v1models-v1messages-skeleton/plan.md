# M3-3: Endpoint handlers skeleton — 実装計画

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/observability/mod.rs` | 新規 | モジュール宣言 |
| `src/observability/metrics.rs` | 新規 | register_metrics / record_request / format_metrics |
| `src/http/routes.rs` | 修正 | 4 handler 本実装 + 4つの[::STUB::]解決 |
| `src/lib.rs` | 修正 | pub mod observability; 追加 |
| `src/http/router.rs` | 修正 | 統合テスト追加 |

## テスト計画（4グループ 15ケース）

1. healthz (1): 200 + {"status":"ok"}
2. list_models (5): 空/単一/ソート/disabled除外/全フィールド
3. handle_messages (5): 正常/欠落/不明provider/解決失敗/request_id
4. metrics (4): 初期値/200/400/500

## 実装手順

Phase 1: observability/metrics.rs
Phase 2: observability/mod.rs
Phase 3: http/routes.rs (4 handler 書き換え)
Phase 4: lib.rs (モジュール宣言)
Phase 5: http/router.rs (テスト追加)
Phase 6: compile + test
