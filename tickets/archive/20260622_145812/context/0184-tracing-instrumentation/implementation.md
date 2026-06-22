# 実装サマリ

## 変更内容

### Phase 1: 基盤変更

1. **`observability/metrics.rs`** — Failover カウンタ追加
   - `FAILOVER_COUNT` 静的カウンタ + `record_failover()` / `record_failover_count()` 関数
   - `format_metrics()` に `anthropx_requests_failover_total` 行追加
   - テスト3件追加: `record_failover_increments_counter`, `format_metrics_includes_failover`, `failover_independent_from_request_counters`

2. **`config/mod.rs`** — `ProxyError::status_code()` メソッド追加
   - 全12 variant に対応する HTTP ステータスコードを返す
   - テスト12件追加（各 variant の status_code 検証）

3. **`app_state.rs`** — `CancellationToken` フィールド追加
   - `pub cancel: CancellationToken` フィールド
   - `new(config, providers, cancel)` の3引数シグネチャ

### Phase 2: 配線

4. **`lifecycle.rs`** — メトリクス初期化 + CancellationToken 伝播
   - `start()` 先頭で `metrics::register_metrics()` 呼び出し
   - `AppState::new(config, providers, cancel.clone())` で token 伝播

5. **`routes.rs`** — record_request + tracing instrumentation
   - `handle_messages` 内で `tracing::info_span!("handle_messages", request_id, provider, model, stream)` 生成
   - 全処理を `async move { ... }.instrument(span).await` でラップ
   - 成功時 `record_request(200)`、失敗時 `record_request(e.status_code())` + `tracing::warn!` 出力

6. **`provider/transparent.rs`** — 3点改修
   - `execute_with_failover`: 5xx/network error 時に `metrics::record_failover()` 呼び出し
   - CancellationToken 伝播: `handle_transparent` → `stream_response` → `proxy_sse_stream` 経路で `state.cancel.clone()` を伝播。`proxy_sse_stream` 内で `tokio::select!` により cancel 監視
   - `filter_response_headers`: 非UTF-8 header 値を `tracing::warn!` 出力後にドロップ
   - テスト1件追加: `filter_response_drops_non_utf8_with_warning`

7. **`provider/translate.rs`** — CancellationToken 伝播
   - `handle_translate(state)` → `translate_stream` → `collect_and_transform_stream` 経路で `state.cancel.clone()` を伝播
   - `collect_and_transform_stream` 内で `tokio::select!` により cancel 監視
   - 不要な `_api_format` 引数を削除（clippy too_many_arguments 対応）

### テストファイル修正

- `routes.rs`, `router.rs`, `auth.rs`: テスト用 AppState 構築に `CancellationToken::new()` 追加
- `mock_server.rs`, `real_provider.rs`: 同上

## 検証結果

- `cargo check --tests` — ✅ 通過
- `cargo clippy -- -D warnings` — ✅ 通過（auth.rs doc indentation 修正含む）
- `cargo test` — ✅ 168 tests passed (from 152, +16 new), 7 mock server, 1 real provider
- `make check-be` — ✅ 通過
- `scan-crimes.sh` — ✅ 0 crimes
- `run-quality-checks.js` — ✅ 全 issues は既存コード由来
- 不完全実装 grep — ✅ 新規混入なし
