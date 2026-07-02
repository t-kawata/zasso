# OMISSIONS-001

> 生成元: `/Users/kawata/shyme/zasso/crates/anthropx/OMISSIONS-001.json`

- **親RFC**: /Users/kawata/shyme/zasso/crates/anthropx/RFC-ROOT.md
- **タイトル**: LLM Bridge Proxy Server — RFC
- **生成日**: 2026-07-01
- **サマリ**: anthropx は Rust で実装された Anthropic 互換 API プロキシサーバー。Axum 0.8 ベースの HTTP ゲートウェイとして /v1/messages を公開し、transparent mode（透過転送）と translate mode（Anthropic→OpenAI 互換翻訳）の二モードで複数 LLM provider へ中継する。単一バイナリ（cargo install）と crate 埋め込み（ライブラリ利用）のデュアルモード構成を採用。設定は TOML ファイルとプログラム的構築の二刀流をサポート。API key は起動時乱択＋round-robin で分散し failover を提供。並行性制御は Semaphore-based、可観測性は tracing + metrics で実現。llm-bridge-core がプロトコル変換を担当し、本 crate はルーティング・認証・スケジューリング・並行性制御・可観測性を担当する。

## RFC 理解

### 目的

anthropx crate の設計を定義する。Anthropic 互換 API プロキシサーバーを Rust で実装し、単一バイナリとして独立稼働するだけでなく、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。外向きの API 面は Anthropic Messages API (/v1/messages) を公開し、内部では provider ごとに透過転送（transparent）または Anthropic→OpenAI 互換翻訳（translate）を切り替えて upstream LLM provider へ中継する。

### 目標

1. Claude Code が単一のエンドポイントを指すだけで複数 provider を透過的に利用できる
2. provider ごとの API key を起動時乱択＋round-robin で分散し failover を提供する
3. Anthropic と OpenAI 互換 API のプロトコル差を llm-bridge-core で吸収する
4. サーバーバイナリとしても、他の Rust プロジェクトに埋め込めるライブラリとしても動作するデュアルモードを実現する

### 成功条件

AC#1: transparent non-stream /v1/messages
AC#2: transparent stream /v1/messages
AC#3: translate non-stream /v1/messages
AC#4: translate stream /v1/messages
AC#5: non-stream key failover
AC#6: stream no-failover
AC#7: /v1/models sorted
AC#8: provider/model split
AC#9: queue overflow → 429
AC#10: /metrics, /healthz available

### 非スコープ

モデル推論は行わない / 外部 DB/Redis/永続ジョブキューは使用しない / 単一プロセスメモリ内状態のみで動作する

### アーキテクチャ概要

デュアルモード構成: 同一 Cargo パッケージ内に [lib] と [[bin]] を両方定義。server feature（デフォルト有効）が Axum 以下の HTTP 依存を有効化する。server feature 無効時は設定型とメモリ内完結ロジックのみの軽量ライブラリとして動作する。モジュール構成は config/（設定型定義・パース・検証）、routing/（provider/model 解決・alias 解決・key スケジューラ）、provider/（transparent/translate 分岐・並行性制御）、http/（Router 組立・認証ミドルウェア・エラー型）、lifecycle（ServerHandle 起動停止）、observability/（tracing/metrics 出力）、util/（ヘッダフィルタ・ID生成）に分割される。

### コンポーネント間関係

config/ は全モジュールから参照される（設定情報の単一 source of truth）。http/ のルーターが外部リクエストを受け付け provider/ に処理を委譲。provider/ は routing/ で解決された model 情報と key を使用して upstream へリクエスト送信。observability/ は全モジュールから metrics と tracing 出力を受け付ける。lifecycle がサーバー起動・停止を一元管理。llm-bridge-core は外部 crate として translate mode のプロトコル変換を担当し provider/translate.rs が薄いアダプタ層として結合する。

### 設計判断

1. Axum 0.8 採用 - server feature でゲート制御
2. Semaphore-based 並行性制御 - try_acquire 優先＋queue フォールバック
3. Feature flag による lib/bin 分離 - unconditional 依存最小化
4. TOML 設定＋プログラム的構築の二刀流 - 全フィールド pub + Default
5. Key failover: non-stream のみ（最大3回） stream は failover しない
6. 集約型バリデーション - 全エラー収集後一度に報告
7. Lossy 3段階制御（Error/Warn/Info） allow_lossy + error_lossy_continue フラグ
8. metrics 登録は OnceLock で冪等性確保
9. クライアント認証＋upstream 認証は独立した Tower Layer
10. url_prefix 正規化（先頭/付与＋末尾/除去）

### 型定義

AppConfig（global: GlobalConfig + providers: BTreeMap<String,ProviderConfig>）, GlobalConfig（port/u16, url_prefix/String, require_client_auth/bool, log_format/LogFormat, allow_lossy/bool, error_lossy_continue/bool, timeouts/TimeoutConfig, limits/GlobalLimitConfig, aliases/BTreeMap）, ProviderConfig（transparent/bool, base_url/String, api_keys/Vec<String>, allow_lossy/Option<bool>, error_lossy_continue/Option<bool>, openai_wire_api/Option<OpenAiWireApi>, max_in_flight/Option<usize>, max_queue/Option<usize>, model_aliases/BTreeMap, models/Vec<ModelConfig>）, ModelConfig（public/String, upstream/String, enabled/bool, tags/Vec<String>, max_tokens_cap/Option<u32>, aliases/Vec<String>）, TimeoutConfig（connect_ms/u64, read_ms/u64, total_ms/u64）, GlobalLimitConfig（default_max_in_flight/usize, default_max_queue/usize）, AppState（cfg feature server; config/AppConfig, http_clients/HashMap, schedulers/HashMap, limiters/HashMap）, ProxyError enum（UnknownProvider, InvalidModel, MissingField, Unauthorized, Forbidden, QueueFull, Upstream, UpstreamError, TransformLossy, Timeout, Internal, Config）, LossyLevel enum（Error, Warn, Info）, KeyScheduler（keys/Vec<String>, current/AtomicUsize）, ConcurrencyLimiter（semaphore/Arc<Semaphore>, max_queue/usize, current_queue/AtomicUsize）, ServerHandle（cancel/CancellationToken, join_handle/JoinHandle）, OpenAiWireApi enum（Auto, ChatCompletions, Responses）, LogFormat enum（Text, Json）, ResolvedModel（public/String, upstream/String）

### APIシグネチャ

ProxyServer::start(config: AppConfig) -> Result<ServerHandle>; ServerHandle::shutdown(self) async; ServerHandle::join(self) -> Result<()>; AppConfig::from_toml(path: &Path) -> Result<Self, ConfigError>; AppConfig::validate(&self) -> Result<(), Vec<ConfigError>>; KeyScheduler::new(keys: Vec<String>) -> Self; KeyScheduler::select_key(&self) -> &str; KeyScheduler::key_count(&self) -> usize; ConcurrencyLimiter::new(max_in_flight: usize, max_queue: usize) -> Self; ConcurrencyLimiter::acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError>; parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError>; resolve_model(provider_name, model_name, provider_config, global_aliases) -> Result<ResolvedModel, ProxyError>; build_upstream_headers(client_headers: &HeaderMap, provider_api_key: &str) -> HeaderMap; handle_messages(State<Arc<AppState>>, Json<Value>) -> Result<Response, ProxyError>; list_models(State<Arc<AppState>>) -> Json<Value>; handle_transparent(state, provider, resolved, api_key, body, is_stream) -> Result<Response, ProxyError>; handle_translate(state, provider, resolved, api_key, body, is_stream, cancel) -> Result<Response, ProxyError>; proxy_sse_stream(upstream_stream, client_disconnected) -> Response; translate_stream(upstream_response, stream_state, cancel) -> Result<Response, ProxyError>; register_metrics(); record_request(provider, mode, stream, status, latency_ms); execute_with_failover(client, scheduler, request) -> Result<Response, ProxyError>; execute_stream(client, scheduler, request) -> Result<Response, ProxyError>; generate_request_id() -> String

### 依存関係グラフ

lib.rs -> lifecycle::ProxyServer（pub use）; main.rs -> cli.rs（parse_args）, lifecycle.rs（ProxyServer::start）; config/mod.rs（型定義） -> config/parse.rs（from_toml）, config/validate.rs（validate）; http/mod.rs（build_router） -> http/routes.rs（handle_messages, list_models, healthz, metrics_handler）, http/auth.rs（client_auth_layer, upstream_auth_layer）, http/errors.rs（ProxyError, IntoResponse）; routing/mod.rs（parse_provider_model, resolve_model） -> routing/scheduler.rs（KeyScheduler）; provider/mod.rs（ProviderClient） -> provider/transparent.rs（handle_transparent）, provider/translate.rs（handle_translate, translate_stream）, provider/limiter.rs（ConcurrencyLimiter）; lifecycle.rs（ProxyServer, ServerHandle） -> app_state.rs（AppState）, http/mod.rs（build_router）, observability/metrics.rs（register_metrics）; observability/mod.rs -> observability/metrics.rs（register_metrics, record_*）; util/mod.rs -> util/headers.rs（build_upstream_headers, HOP_BY_HOP_HEADERS）, util/ids.rs（generate_request_id）

### 外部依存

serde/serde_json（設定・API シリアライズ, unconditional）, toml（設定ファイルパース, unconditional）, thiserror（エラー型導出, unconditional）, tracing（構造化ログ, unconditional）, metrics（メトリクスカウンタ, unconditional）, reqwest（HTTP クライアント, unconditional だが server feature で本格利用）, tokio（非同期ランタイム, unconditional だが server feature で full 利用）, axum（HTTP サーバー, server feature）, clap（CLI, server feature）, tokio-util（CancellationToken, server feature）, tokio-stream（Stream 拡張, server feature）, futures（Stream トレイト, server feature）, tracing-subscriber（ログ出力設定, server feature）, metrics-exporter-prometheus（Prometheus 形式出力, server feature）, llm-bridge-core（プロトコル変換, unconditional）, axum-test（テスト用 mock, dev-dependency）, uuid（ID 生成, unconditional）

### テスト要件

二層構成: (1) axum::test を用いた mock HTTP server テスト - CI で常時実行、(2) 環境変数から API key を読み込む実 provider 結合テスト（feature=integration-test 必須）。全 10 個の AC（Acceptance Criteria）に対応するテスト必須。transparent non-stream/stream, translate non-stream/stream, non-stream key failover, stream no-failover, /v1/models sorted, provider/model split, queue overflow→429, /metrics+/healthz available の各テスト。axum-test crate を使用した mock upstream の setup_mock_upstream() を共通テストヘルパーとする。

### エラー処理

単一の ProxyError enum ですべてのエラーを表現。IntoResponse を実装して Axum handler から Result<T, ProxyError> を返すだけで適切な HTTP 応答に変換。HTTP ステータス: 400（UnknownProvider/InvalidModel/MissingField/TransformLossy）, 401（Unauthorized）, 403（Forbidden）, 429（QueueFull）, 502（Upstream/UpstreamError）, 504（Timeout）, 500（Internal/Config）。Anthropic 互換エラーレスポンス形式（type + error.type + error.message JSON）。集約型バリデーション（全エラー収集後一度に報告）。3段階 Lossy 制御（Error/Warn/Info）+ allow_lossy/error_lossy_continue フラグ。

### 設定

TOML ファイルによる設定（AppConfig::from_toml）とプログラム的構築（構造体リテラル + Default）の二刀流。全フィールド pub + serde Deserialize/Serialize。起動時バリデーション（集約型）: provider 名一意性, api_keys 1件以上, models.public の provider内一意性, url_prefix 正規化, alias key 衝突チェック, port 範囲, timeout 値整合性。設定ファイルパスは -c または --config 引数（clap）。デフォルト設定: port=8088, connect_ms=3000, read_ms=600000, total_ms=600000, default_max_in_flight=64, default_max_queue=256

## 漏れ・矛盾・不足 (6件)

### O-001 !! [実装漏れ] §§F.1, §F.6

build_provider_clients() が reqwest::Client::builder() を使用せず connect_timeout / pool_max_idle_per_host / tcp_keepalive / default_headers(User-Agent) を適用していない


**該当ファイル**:
- `src/lifecycle.rs`

**解決方法**: reqwest::Client::builder() で .connect_timeout(Duration::from_millis(connect_ms)), .pool_max_idle_per_host(...), .tcp_keepalive(...), .default_headers() に User-Agent anthropx/{version} を設定する。設定値は TimeoutConfig から取得する。
---

### O-002 !! [実装漏れ] §§F.1

non-stream リクエスト送信に reqwest::RequestBuilder::timeout() が適用されていない


**該当ファイル**:
- `src/provider/transparent.rs`
- `src/provider/translate.rs`

**解決方法**: execute_with_failover および translate_non_stream 内で .timeout(Duration::from_millis(total_ms)) を追加。timeout 値は provider.config.timeouts.total_ms または GlobalConfig のデフォルトから取得。
---

### O-003 ! [実装漏れ] §§F.1

streaming 時のチャンク間 idle timeout（tokio::time::timeout）が実装されていない


**該当ファイル**:
- `src/provider/transparent.rs`
- `src/provider/translate.rs`

**解決方法**: proxy_sse_stream および translate_stream の select! ループで chunk 受信待機を tokio::time::timeout(read_ms) でラップし、タイムアウト時にストリームを切断する。
---

### O-004 ! [実装漏れ] §§F.2

register_metrics() が OnceLock でガードされておらず複数回呼び出し時に metrics crate の describe_*! が重複警告を発生させる可能性がある


**該当ファイル**:
- `src/observability/metrics.rs`

**解決方法**: std::sync::OnceLock または std::sync::Once で register_metrics() の初回実行のみ describe_*! を呼び出すようにガードを追加する。
---

### O-005 ! [実装漏れ] §§10.4

handle_messages の後処理で record_request() が呼ばれておらずリクエストメトリクスが記録されていない


**該当ファイル**:
- `src/http/routes.rs`

**解決方法**: handle_messages 内の transparent/translate 分岐後、レスポンス送信前に provider_name / mode / is_stream / status_code / latency_ms を収集し record_request() を呼び出す。
---

### O-006 ! [実装不足] §§1.1, §6.2

llm-bridge-core のバージョンが 0.2.6 に固定されており、最新版 0.3.0（2026-06-26 リリース）に更新されていない。v0.2.6 から v0.3.0 は minor bump（breaking change）のため API 互換性の検証が必要。また RFC §6.2 の lossy-tolerant 変換 API（TransformResult）が v0.3.0 で提供されているか確認し、提供されている場合は RFC §6.3 の実装を再検討する必要がある。


**該当ファイル**:
- `Cargo.toml`

**解決方法**: cargo add llm-bridge-core@0.3.0 で更新し全テストを実行して breaking change の影響を確認する。v0.3.0 は Rust 2024 エディション対応版のため、anthropx 側の edition 移行計画（RFC §F.5）と合わせて対応時期を判断する。
---

## 漏れ・矛盾・不足の発見作業の進捗

| Step | 状態 |
|------|------|
| 1: スケルトン生成 | ✅ done |
|   1a: OMISSIONS番号採番 | ✅ done |
|   1b: 雛形JSON書き出し | ✅ done |
| 2: RFC理解 | ✅ done |
|   2a-1: 目的とゴールの把握 | ✅ done |
|   2a-2: メタ情報の記録 | ✅ done |
|   2b: アーキテクチャ把握 | ✅ done |
|   2c-1: 実装詳細（型・API・依存） | ✅ done |
|   2c-2: 実装詳細（テスト・エラー処理・設定） | ✅ done |
|   2-review: RFC理解の全体確認 | ✅ done |
| 3: ソースコード比較分析 | ✅ done |
|   3a: 目的とゴールの実装反映確認 | ✅ done |
|   3b: アーキテクチャの実装一致確認 | ✅ done |
|   3c-1: 型・API・依存関係の確認 | ✅ done |
|   3c-2: テスト・エラー処理・設定の確認 | ✅ done |
| 4: 機械的フィルタリング | ✅ done |
| 5: 発見漏れ確認 | ✅ done |
| 6: 最終検証 | ✅ done |
|   6a: スキーマ検証 | ✅ done |
|   6b: 犯罪点検 | ✅ done |
| 7: 完了報告 | ✅ done |
