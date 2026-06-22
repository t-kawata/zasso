# 実装サマリ: チケット185 — integration-test feature + テスト環境整備

## 変更ファイル一覧

### 1. crates/anthropx/Cargo.toml
- `integration-test = []` feature を追加（実プロバイダーテストのfeature gate用）
- dev-dependencies の tokio に `rt-multi-thread` を追加（ConcurrencyLimiter 並行テスト用）

### 2. crates/anthropx/tests/real_provider.rs
- `deepseek_transparent_non_stream` テスト関数に `#[cfg_attr(not(feature = "integration-test"), ignore)]` を追加
- これにより `cargo test` ではテストはコンパイルのみ（ignored）され、`cargo test --features integration-test` でのみ実行可能

### 3. crates/anthropx/tests/mock_server.rs
- **Boy Scout 改善**: ハードコード値 `18910` を `MOCK_SERVER_BASE_PORT` 定数に抽出
- **新規ヘルパー**:
  - `start_mock_upstream()` — 動的ポートで実TCP mock upstream サーバーを起動
  - `mock_anthropic_response()` — Anthropic 互換の固定レスポンス
  - `make_mock_config()` — mock upstream 付き AppConfig 生成
  - `build_proxy_test_server()` — ProviderClients 込みの TestServer 構築
- **新規テスト（7テスト追加 → 計14テスト）**:
  - `transparent_non_stream_proxies_to_upstream` — 実TCP mock upstream に中継し200確認
  - `transparent_stream_proxies_sse_from_upstream` — SSE ストリーム中継の確認
  - `concurrency_limiter_rejects_queue_overflow` — max_queue=0 → 429
  - `concurrency_limiter_blocks_in_flight` — multi_thread runtime で in-flight 超過 → 429
  - `translate_non_stream_proxies_via_openai_wire` — translate ルーティング結合確認
  - `authentication_rejects_missing_credentials` — require_client_auth → 401
  - `models_endpoint_returns_models_from_all_providers` — /v1/models ソート順確認

### 4. crates/anthropx/.config/nextest.toml（新規）
- cargo nextest 用の設定ファイル（CI設定を含む）

## 検証結果
- `cargo test`（integration-test なし）: 168 unit + 14 mock_server pass, 1 real_provider ignored
- `cargo test --features integration-test`: 実プロバイダーテスト実行可能
- `cargo check --all-targets`: クリーン
- 犯罪スキャン: 0件
