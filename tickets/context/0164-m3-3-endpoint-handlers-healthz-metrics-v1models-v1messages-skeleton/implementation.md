# M3-3: Endpoint handlers skeleton — 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/observability/metrics.rs` | **新規** | register_metrics / record_request / format_metrics — AtomicU64 ベース簡易カウンタ |
| `src/observability/mod.rs` | **新規** | モジュール宣言 |
| `src/http/routes.rs` | 修正 | 4 handler をスタブから本実装に置き換え。healthz/list_models/metrics_handler/handle_messages(routing) |
| `src/lib.rs` | 修正 | pub mod observability 追加 |
| `src/http/router.rs` | 修正 | /v1/messages テスト用に provider 付き AppState で統合テスト |

## 解決したスタブ

| スタブ | 状態 |
|--------|------|
| routes.rs:17 healthz → StatusCode::OK | ✅ 解決 → Json({"status":"ok"}) |
| routes.rs:25 metrics_handler → {"metrics":{}} | ✅ 解決 → format_metrics() text/plain |
| routes.rs:35 list_models → {"data":[]} | ✅ 解決 → 全provider走査＋ソート列挙 |
| routes.rs:48 handle_messages → 固定JSON | ✅ 解決 → routing解決＋[::STUB::]委譲 |

## 残存スタブ（M3-4/M3-5 待ち）

- routes.rs:93,125 — handle_messages の provider 処理 (handle_transparent / handle_translate)

## テスト結果

| 条件 | 単体テスト | 結果 |
|------|-----------|------|
| default features | **135 passed**（+16 from M3-2） | ✅ |
| --no-default-features | **95 passed** | ✅ |
| clippy | 警告ゼロ | ✅ |
| make check-be | 通過 | ✅ |

## 新規テスト内訳（16 ケース）

- healthz (1): {"status":"ok"}
- list_models (5): 空/単一/ソート/disabled除外/全フィールド
- handle_messages (5): 正常/model欠落/不明provider/解決失敗/request_id
- metrics (5): 初期値/200/400/500/3xx

## 品質チェック

- run-quality-checks.js: 8 issues（全件テストコード内の .unwrap() — 許容範囲）
- 翻訳可能性: 全項目問題なし

## Boy Scout 改善

- モジュール文章をスタブから本実装の説明に更新
- 4 つの [::STUB::] マーカーを解決
