# OMISSIONS-002

> 生成元: `/Users/kawata/shyme/zasso/crates/anthropx/OMISSIONS-002.json`

- **親RFC**: /Users/kawata/shyme/zasso/crates/anthropx/RFC-ROOT.md
- **タイトル**: LLM Bridge Proxy Server — RFC
- **生成日**: 2026-07-01
- **サマリ**: anthropx は Rust で実装された Anthropic 互換 API プロキシサーバー。デュアルモード構成（サーバーバイナリ＋ライブラリ）を採用し、外向きに Anthropic Messages API (/v1/messages) を公開。内部では provider ごとに transparent（透過転送）と translate（Anthropic→OpenAI 互換翻訳）を切り替え、複数 LLM provider への同時接続を単一エンドポイントで実現する。llm-bridge-core によるプロトコル変換、起動時乱択＋round-robin の key スケジューラ、Semaphore ベースの並行性制御、metrics/tracing による可観測性を備える。設定は TOML ファイルとプログラム的構築の二刀流をサポート。単一プロセス・メモリ内状態のみで動作し、外部 DB やジョブキューに依存しない。

## RFC 理解

### 目的

Anthropic 互換 API プロキシサーバーの設計を定義する。Rust で実装された anthropx crate は、単一バイナリとして独立稼働するだけでなく、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。外向きの API 面は Anthropic Messages API (/v1/messages) を公開し、内部では provider ごとに透過転送（transparent）または Anthropic→OpenAI 互換翻訳（translate）を切り替えて upstream LLM provider へ中継する。

### 目標

1. Claude Code が単一のエンドポイントを指すだけで複数 provider を透過的に利用できるようにする
2. provider ごとの API key を起動時乱択＋round-robin で分散し、failover を提供する
3. Anthropic と OpenAI 互換 API のプロトコル差を llm-bridge-core で吸収する
4. サーバーバイナリとしても、他の Rust プロジェクトに埋め込めるライブラリとしても動作するデュアルモード構成を実現する

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
AC#10: /metrics, /healthz 利用可能
加えて: サーバーバイナリとしての独立起動、crate としての埋め込み利用、全 provider モードの正しい動作

### 非スコープ

- モデル推論そのものは行わない
- 外部 DB・Redis・永続ジョブキューは使用しない
- 単一プロセス・メモリ内状態のみで動作する

### アーキテクチャ概要

デュアルモード構成: 同一 Cargo パッケージ内に [lib] と [[bin]] を両方定義。server feature（デフォルト有効）が Axum 以下の HTTP 依存を有効化する。server feature 無効時は設定型とメモリ内完結ロジックのみの軽量ライブラリとして動作する。

モジュール構成:
- config/（設定型定義・パース・検証）: AppConfig, GlobalConfig, ProviderConfig, TimeoutConfig, GlobalLimitConfig 等の型定義と TOML パース・集約型バリデーション
- routing/（ProviderResolver による provider/model 解決・alias 解決・KeyScheduler による key スケジューラ）
- provider/（transparent/translate 分岐・Semaphore ベース並行性制御）: provider/mod.rs が分岐、transparent.rs が透過転送、translate.rs が llm-bridge-core 経由のプロトコル変換
- http/（Router 組立・認証ミドルウェア・エラー型）: server feature でのみ有効
- lifecycle.rs（ServerHandle 起動停止）: server feature でのみ有効
- observability/（tracing/metrics 出力）: metrics カウンタ定義と register_metrics
- util/（ヘッダフィルタ・ID生成）: hop-by-hop header フィルタ、request_id 生成

クロスカッティング関心事:
- Lossy Translation 制御: allow_lossy / error_lossy_continue フラグによる段階的制御
- Streaming SSE: tokio::sync::broadcast による subscriber 管理、CancellationToken による切断
- エラー型: ProxyError（ConfigError, HttpError, UpstreamError, StreamError の4系統）

### コンポーネント間関係

lib.rs → lifecycle.rs::ProxyServer → config/, http/, routing/, provider/, observability/, util/
main.rs (server feature) → cli.rs → lifecycle.rs::ProxyServer

データフロー（リクエスト）:
HTTP Request → http/routes.rs → http/auth.rs (client auth + upstream auth) → routing/mod.rs (provider resolver) → routing/scheduler.rs (key scheduler) → provider/mod.rs (mode dispatch) → { provider/transparent.rs | provider/translate.rs } → upstream LLM provider

データフロー（ストリーム応答）:
upstream SSE stream → provider/transparent.rs::proxy_sse_stream() or provider/translate.rs::translate_stream() → tokio::sync::broadcast → http/routes.rs → HTTP Response (SSE)

llm-bridge-core 連携:
translate mode でのみ利用。provider/translate.rs が llm_bridge_core::transform::* 関数を呼び出し、Anthropic request → OpenAI request、OpenAI response → Anthropic response、SSE event 変換を実行する。

### 設計判断

1. Dual-mode構成: [lib] + [[bin]] の同一パッケージ。server feature gate で Axum 依存を分離。
2. 集約型バリデーション: 全エラー収集後一括報告（early return せず検証を継続）
3. reqwest::Client builder: .connect_timeout(), .pool_max_idle_per_host(usize::MAX), .tcp_keepalive(Some(Duration::from_secs(30))), .default_headers(User-Agent) を設定
4. リクエストレベルタイムアウト: non-stream は .timeout(total_ms)、stream は tokio::time::timeout(read_ms) によるチャンク間 idle timeout、切断時は即時切断（partial response は無効扱い）
5. register_metrics(): OnceLock<()> による冪等性ガード
6. KeyScheduler: 起動時乱択 + round-robin、non-stream は failover あり、stream は failover なし
7. Semaphore ベース並行性制御: max_in_flight + max_queue、queue overflow 時は 429
8. Tower middleware による認証: クライアント認証 + upstream 認証
9. Lossy Translation: allow_lossy=true + error_lossy_continue=true の完全実装は将来対応。現在は allow_lossy のみ有効
10. tokio::sync::broadcast による SSE subscriber 管理、CancellationToken による切断シグナル

### 型定義

主要構造体:
- AppConfig { global: GlobalConfig, providers: BTreeMap<String, ProviderConfig> }
- GlobalConfig { port: u16, url_prefix: String, require_client_auth: bool, log_format: LogFormat, allow_lossy: bool, error_lossy_continue: bool, timeouts: TimeoutConfig, limits: GlobalLimitConfig, aliases: BTreeMap<String, String> }
- ProviderConfig { transparent: bool, base_url: String, api_keys: Vec<String>, allow_lossy: Option<bool>, error_lossy_continue: Option<bool>, openai_wire_api: Option<OpenAiWireApi>, max_in_flight: Option<usize>, max_queue: Option<usize>, model_aliases: BTreeMap<String, String>, models: Vec<ModelConfig> }
- ModelConfig { public: String, upstream: String, enabled: bool, tags: Vec<String>, max_tokens_cap: Option<u32>, aliases: Vec<String> }
- TimeoutConfig { connect_ms: u64, read_ms: u64, total_ms: u64 }
- GlobalLimitConfig { default_max_in_flight: usize, default_max_queue: usize }

列挙型:
- OpenAiWireApi { Auto, ChatCompletions, Responses }
- LogFormat { Text, Json }
- ProxyError { ConfigError(種類別), HttpError(status, body), UpstreamError(status, body), StreamError(reason) }
- CategorizedError { Transient, NonTransient }

トレイト:
- IntoResponse (for ProxyError) — Axum 統合
- ProviderCommand (内部) — provider 分岐
- BodyStream (内部利用) — SSE 変換

ライフサイクル型:
- ServerHandle { shutdown_tx: tokio::sync::oneshot::Sender<()>, addr: SocketAddr }

### APIシグネチャ

ライブラリ公開API (lib.rs 再公開):
- pub use lifecycle::ProxyServer;
- pub AppConfig, ProxyConfig (各 config 型)

ProxyServer::start(config: AppConfig) -> Result<ServerHandle, ProxyError> — サーバー起動
ServerHandle::shutdown(self) -> Result<(), ProxyError> — グレースフルシャットダウン

HTTP エンドポイント (server feature):
- POST /v1/messages — メイン推論エンドポイント（non-stream / stream）
- GET /v1/models — 利用可能モデル一覧（public名でソート済み）
- GET /healthz — ヘルスチェック
- GET /metrics — Prometheus metrics 公開

内部関数:
- AppConfig::from_toml(path) -> Result<Self, ConfigError> — TOML 読込
- AppConfig::validate() -> Result<(), Vec<ConfigError>> — 集約型バリデーション
- ProviderResolver::resolve(model_name, &providers) -> (&ProviderConfig, &str) — provider/model 解決
- KeyScheduler::new(keys) -> Self — 起動時乱択
- KeyScheduler::next() -> &str — round-robin
- build_upstream_headers(base_headers, api_key, headers_to_add) -> HeaderMap — upstream ヘッダ構築
- build_provider_clients(config) -> HashMap<String, Client> — provider 別 Client 生成
- register_metrics() — metrics カウンタ登録（OnceLock ガード）
- proxy_sse_stream() — transparent stream 中継
- translate_non_stream() — 非ストリーム翻訳
- translate_stream() — ストリーム翻訳

### 依存関係グラフ

lib.rs → { config, routing, provider, util, observability }
lib.rs → lifecycle.rs (server feature)
main.rs → cli.rs → lifecycle.rs
http/ → { routing, provider, auth, errors }
provider/ → { routing/scheduler, config, util, observability }
routing/mod.rs → { config, scheduler }
observability/ → metrics crate

lib.rs はトップレベル再公開のみ。
app_state.rs (server feature) → { config, routing, provider } の集約状態保持

llm-bridge-core 連携:
provider/translate.rs → llm_bridge_core::transform::{anthropic_to_openai, openai_to_anthropic, transform_stream}

### 外部依存

常時依存:
- serde/serde_json (設定・API シリアライズ)
- toml (設定ファイルパース)
- thiserror (エラー型導出)
- tracing (構造化ログ)
- metrics (metrics カウンタ)
- reqwest 0.12 + json,stream feat (HTTP クライアント)
- tokio + sync,macros feat (非同期ランタイム)
- uuid (request_id 生成)
- llm-bridge-core 0.3 (プロトコル変換) — optional

server feature 依存:
- clap 4 (CLI 引数パース)
- axum 0.8 (HTTP サーバー)
- futures 0.3 (Stream 拡張)
- tokio-util 0.7 (CancellationToken)
- tokio-stream 0.1 (Stream アダプタ)
- tracing-subscriber + json,env-filter feat (ログ出力)
- metrics-exporter-prometheus 0.16 (metrics 公開)
- http 1.x (ヘッダ型)

開発依存:
- axum-test 16 (mock HTTP server)

### テスト要件

受け入れ基準 (AC#1〜AC#10) に対応するテストが必要:
- AC#1: transparent non-stream /v1/messages — axum-test mock upstream
- AC#2: transparent stream /v1/messages — axum-test mock upstream + SSE
- AC#3: translate non-stream /v1/messages — axum-test + llm-bridge-core 変換検証
- AC#4: translate stream /v1/messages — axum-test + llm-bridge-core SSE 変換検証
- AC#5: non-stream key failover — axum-test + 503 returning mock
- AC#6: stream no-failover — axum-test + 503 returning mock
- AC#7: /v1/models sorted — axum-test 応答検証
- AC#8: provider/model split — ユニットテスト
- AC#9: queue overflow → 429 — axum-test + limit=0 config
- AC#10: /metrics, /healthz 利用可能 — axum-test

テストツール: axum-test 16 (integration tests)
テスト場所: tests/ ディレクトリ（integration tests）

テストスコープ:
- HTTP 層: axum-test による mock upstream 結合テスト
- provider 層: reqwest::Client を mock したユニットテスト
- routing 層: 純粋関数としてのユニットテスト
- config 層: パース・バリデーションのユニットテスト
- scheduler: 動作検証のユニットテスト
- util: ヘッダフィルタ・ID生成のユニットテスト

### エラー処理

ProxyError 型で一元管理:
- ConfigError: Io(path, io_error), Parse(path, parse_error), Validation( Vec<ValidationError> )
- HttpError: status_code, response_body
- UpstreamError: provider_name, status_code, response_body
- StreamError: reason 文字列

エラーハンドリング方針:
- 設定エラー: 起動時に全エラー収集後一括報告（集約型バリデーション）
- upstream エラー: non-stream は failover 試行後、全滅時は最終エラーをクライアントに返す
- stream エラー: failover なし、即座にストリーム切断（partial response は無効）
- 認証エラー: 401 Unauthorized
- queue overflow: 429 Too Many Requests
- 内部エラー: 500 Internal Server Error（詳細はログのみ）
- timeout: ストリーム切断（Anthropic 標準 API と同一体感）

Lossy Translation エラー:
- allow_lossy=true: 変換不能フィールドを警告ログに記録してスキップ
- allow_lossy=false: 変換不能時はエラーレスポンスを返す
- error_lossy_continue=true: Error 級 lossy でも処理継続（将来対応）

### 設定

設定形式: TOML ファイル + プログラム的構築の二刀流
設定ファイルパス: CLI 引数 -c/--config または環境変数 ANTHROPX_CONFIG

グローバル設定:
- port: u16 (default: 8088)
- url_prefix: String (default: "")
- require_client_auth: bool (default: false)
- log_format: LogFormat (default: Text)
- allow_lossy: bool (default: false)
- error_lossy_continue: bool (default: false)
- timeouts.connect_ms: u64 (default: 3000ms)
- timeouts.read_ms: u64 (default: 600000ms)
- timeouts.total_ms: u64 (default: 600000ms)
- limits.default_max_in_flight: usize (default: 64)
- limits.default_max_queue: usize (default: 256)
- aliases: BTreeMap<String, String>

provider 設定:
- transparent: bool
- base_url: String
- api_keys: Vec<String>
- allow_lossy, error_lossy_continue: Option<bool> (global フォールバック)
- openai_wire_api: Option<OpenAiWireApi> (translate mode のみ)
- max_in_flight, max_queue: Option<usize> (global フォールバック)
- model_aliases: BTreeMap<String, String>
- models: Vec<ModelConfig> (public, upstream, enabled, tags, max_tokens_cap, aliases)

完全な設定例が Appendix A に記載。

クライアント認証: Authorization: Bearer <token> による API key 認証
upstream 認証: provider 設定の api_keys から KeyScheduler が選択・設定

## 漏れ・矛盾・不足 (3件)

### O-001 ! [テスト欠落] §§5.2 (O-003), §F.1

translate stream の idle timeout に対する統合テストが存在しない。transparent stream では transparent_stream_times_out_on_slow_chunks と transparent_stream_succeeds_when_chunks_fast_enough が実装されているが、translate_stream では同様のテストがない。実装（tokio::time::timeout + select!）は存在するが、回帰テストがない状態。


**該当ファイル**:
- `tests/mock_server.rs`

**解決方法**: translate_stream の idle timeout テストを追加する。transparent stream のテストパターン（slow_chunks / fast_chunks の2ケース）と同様の構成で、translate handler 経由の SSE stream が read_ms 超過時に切断されることを検証する。
---

### O-002  [不整合] §§5.1, §F.4

util/headers.rs:53-54 で HeaderValue::from_str().expect() を使用。format!("Bearer {}", key) は静的に有効なヘッダ値であることが保証されるため実害はないが、プロジェクトのコーディング規約（unwrap/expect プロダクションコード禁止）に違反する。


**該当ファイル**:
- `src/util/headers.rs`

**解決方法**: expect() を ? 演算子によるエラー伝播に置き換える。build_upstream_headers の戻り値型を Result<HeaderMap, ConfigError> に変更するか、FromStr エラーが発生しないことをコメントで明記した上で expect を維持する判断を明示する。
---

### O-003  [実装不足] §§F.5

RFC §F.5 で Rust 2024 Edition 移行計画の策定が要求されているが、lib.rs に #[warn(rust_2024_compatibility)] を設定したのみで、影響範囲調査と移行計画の策定は未実施。tokio::select! 内のテンポラリドロップ順の影響確認も未実施。


**該当ファイル**:
- `src/lib.rs`
- `src/provider/translate.rs`

**解決方法**: Rust 2024 Edition への移行計画を策定する。具体的には (1) cargo fix --edition の試験実行、(2) tail_expr_drop_order の影響確認（特に translate.rs の select! マクロ展開後のドロップ順）、(3) 移行可否の判断とスケジュール策定。
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
| 5: 発見漏れ確認 | ⬜ todo |
| 6: 最終検証 | ✅ done |
|   6a: スキーマ検証 | ✅ done |
|   6b: 犯罪点検 | ✅ done |
| 7: 完了報告 | ✅ done |
