# anthropx: LLM Bridge Proxy Server — 実装チケット分解設計書

> **生成元:** crates/anthropx/RFC.md
> **生成日:** 2026-06-19
> **分析済みセクション:** §1(アーキテクチャ), §2(設定システム), §3(HTTP), §4(ルーティング), §5(Provider), §6(Lossy), §7(並行性), §8(SSE), §9(ライフサイクル), §10(可観測性), §11(エラー型), §12(テスト)

---

## フェーズ1: 純粋ロジック・型定義基盤

> **外部依存:** serde (derive), serde_json, thiserror
> **特徴:** 全チケットがメモリ内完結・決定論的・非同期I/Oゼロ

このフェーズでは `server` feature を必要としない。設定型のみの軽量ライブラリとして独立してコンパイル・テスト可能。

### M0: 型定義基盤 — 設定構造体

> **DB:** メモリ内完結

#### チケット M0-1: AppConfig / GlobalConfig / ProviderConfig / ModelConfig / TimeoutConfig / GlobalLimitConfig

* **参照設計書:** crates/anthropx/RFC.md (§2 設定システム, §5 Provider モード)
* **依存・関連チケットID:** なし（全チケット中最先行）
* **対象不変条件 / 規範:**
  - `AppConfig` は TOML とプログラム的構築の二刀流を pub フィールドで実現する（RFC §2）
  - `provider.api_keys` は 1 件以上（RFC §2.1）
  - `models.public` は provider 内で一意（RFC §2.1）
  - `BTreeMap` 採用により `/v1/models` のソート済み出力を得る（RFC §2）
* **実装の背景と目的:** 全上位チケットの依存先となる最基底の型定義。設計書ドラフトの Rust 主要型をそのまま実装に落とす。全フィールドを `pub` とし、`Default` / `Deserialize` を derive する。
* **実装スコープ:**
  - `AppConfig` struct（global, providers: BTreeMap<String, ProviderConfig>）
  - `GlobalConfig` struct（port, url_prefix, require_client_auth, log_format, allow_lossy, error_lossy_continue, timeouts, limits, aliases）
  - `ProviderConfig` struct（transparent, base_url, api_keys, allow_lossy, error_lossy_continue, openai_wire_api, max_in_flight, max_queue, model_aliases, models）
  - `ModelConfig` struct（public, upstream, enabled, tags, max_tokens_cap, aliases）
  - `TimeoutConfig` struct（connect_ms, read_ms, total_ms）
  - `GlobalLimitConfig` struct（default_max_in_flight, default_max_queue）
  - 各 struct に `Default` impl / `#[serde(default)]` 属性（design draft の TOML デフォルト値を反映）
  - `fn default_enabled()` → `true`
  - `fn default_connect_ms()` → `3000`
  - `fn default_read_ms()` → `600000`
  - `fn default_total_ms()` → `600000`
  - `fn default_in_flight()` → `64`
  - `fn default_queue()` → `256`
* **テストコードによる検証:**
  1. `AppConfig::default()` の全フィールドが期待値と一致する
  2. `ProviderConfig` の `#[serde(default)]` が TOML 省略時に正しく適用される
  3. `BTreeMap` のキー順序がアルファベット昇順である
  4. 各 struct が `Debug + Clone + Serialize + Deserialize` を満たす
  5. `ModelConfig` の `enabled` がデフォルト `true`
* **計装方法・観測対象:** 構造体サイズ（メモリフットプリント）、シリアライズ/デシリアライズのラウンドトリップ一貫性

#### チケット M0-2: OpenAiWireApi / LogFormat / LossyLevel / ProxyError / ResolvedModel / ConfigError

* **参照設計書:** crates/anthropx/RFC.md (§2 設定システム, §6 Lossy Translation, §11 エラー型)
* **依存・関連チケットID:** M0-1 に依存（ConfigError は AppConfig::validate の戻り値型の一部）
* **対象不変条件 / 規範:**
  - `ProxyError` の全バリアントは Anthropic 互換エラースキーマに 1:1 対応する（RFC §11）
  - `LossyLevel` の3段階分類は `allow_lossy` + `error_lossy_continue` の真理値表で決定される（RFC §6）
  - `OpenAiWireApi::Auto` は base_url パスから `ApiFormat` を自動判定する（RFC §1.3）
* **実装の背景と目的:** 設定・エラー・lossy の各ドメインで共有される列挙型とエラー型を定義する。`ProxyError` はこのチケットでは enum 定義のみ（`IntoResponse` 実装は M3-1 で行う）。
* **実装スコープ:**
  - `OpenAiWireApi` enum（Auto, ChatCompletions, Responses） + `serde::Deserialize`
  - `LogFormat` enum（Text, Json） + `fn default_log_format()`
  - `LossyLevel` enum（Error, Warn, Info） — 実装ロジックなし、pure data
  - `ProxyError` enum（UnknownProvider, InvalidModel, MissingField, Unauthorized, Forbidden, QueueFull, Upstream, UpstreamError, TransformLossy, Timeout, Internal, Config） + `thiserror::Error` derive
  - `ResolvedModel` struct（public: String, upstream: String）
  - `ConfigError` enum（Io, Parse, EmptyApiKeys, DuplicateModel, DuplicateAlias, ValidationFailed） + `thiserror::Error` derive
* **テストコードによる検証:**
  1. `ProxyError` の全バリアントが `Display` で意味のあるメッセージを出力する
  2. `ConfigError` の各バリアントがエラー文言を正しく保持する
  3. `LossyLevel` の variant カウントが期待値と一致する（3）
  4. `OpenAiWireApi` の `Deserialize` が snake_case で正しく動作する
  5. `ResolvedModel` のフィールドアクセスが期待通り
* **計装方法・観測対象:** enum ディスクリミナントバイト数、Display 実装のカバレッジ

---

### M1: 純粋ロジック関数

> **DB:** メモリ内完結

#### チケット M1-1: ルーティング純粋関数 — parse_provider_model / resolve_model / resolve_api_format / build_upstream_headers / LossyLevel::should_reject

* **参照設計書:** crates/anthropx/RFC.md (§4.1 model 解析・alias 解決, §1.3 システム境界, §3.2 header policy, §6 Lossy Translation)
* **依存・関連チケットID:** 先行実装必須: M0-1, M0-2
* **対象不変条件 / 規範:**
  - model 解析は `最初の / のみ` で split（RFC §4.1）
  - alias 解決順序: provider alias → global alias → public model 名（RFC §4.1）
  - global alias が `provider/model` 形式の場合は再帰的に解決（RFC §4.1）
  - allow-list が空なら全 model 許可（RFC §4.1）
  - hop-by-hop header は転送禁止（RFC §3.2）
  - クライアント由来 Authorization は常に除外（RFC §3.2）
  - `LossyLevel::should_reject` の真理値表（RFC §6）
* **実装の背景と目的:** 全く外部I/Oや非同期実行を必要としない純粋関数群。文字列処理・マップルックアップ・条件分岐のみで構成され、単体テストで完全に検証可能。
* **実装スコープ:**
  - `fn parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError>`
    - `spec.find('/')` が None なら `ProxyError::InvalidModel`
    - `"litellm/openai/gpt-4.1"` → `("litellm", "openai/gpt-4.1")`
  - `fn resolve_model(provider_name, model_name, provider_config, global_aliases) -> Result<ResolvedModel, ProxyError>`
    - Step 1: provider 単位 alias 解決（`provider_config.model_aliases`）
    - Step 2: global alias 解決（`global_aliases`、値が `provider/model` 形式なら再帰）
    - Step 3: 登録済み public model 名で検索
    - Step 4: allow-list が空なら任意の文字列を許可
    - 該当なし → `ProxyError::InvalidModel`
  - `fn resolve_api_format(wire_api: &OpenAiWireApi, base_url: &str) -> ApiFormat`（core crate の型を意識した純粋マッピング）
  - `fn build_upstream_headers(client_headers: &HeaderMap, api_key: &str) -> HeaderMap`
    - HOP_BY_HOP_HEADERS 定数（connection, keep-alive, proxy-authenticate, proxy-authorization, te, trailers, transfer-encoding, upgrade）
    - authorization / x-api-key を client_headers から除去
    - Bearer {api_key} で上書き
  - `impl LossyLevel { fn should_reject(self, allow_lossy: bool, error_lossy_continue: bool) -> bool }`
    - Error 級 かつ `!allow_lossy` かつ `!error_lossy_continue` の場合のみ true
* **テストコードによる検証:**
  1. `parse_provider_model("deepseek/deepseek-v4-pro")` → `Ok(("deepseek", "deepseek-v4-pro"))`
  2. `parse_provider_model("litellm/openai/gpt-4.1")` → `Ok(("litellm", "openai/gpt-4.1"))`
  3. `parse_provider_model("no-slash")` → `Err(ProxyError::InvalidModel(...))`
  4. `parse_provider_model("")` → `Err`
  5. `resolve_model` が provider alias を正しく解決する
  6. `resolve_model` が global alias を正しく解決する
  7. `resolve_model` が global alias の `provider/model` 再帰解決を行う
  8. `resolve_model` が allow-list 空のときに任意 model を許可する
  9. `resolve_model` が未登録 model + 非空 allow-list でエラーを返す
  10. `build_upstream_headers` が Authorization header を除去する
  11. `build_upstream_headers` が hop-by-hop header を除去する
  12. `build_upstream_headers` が Bearer + api_key で上書きする
  13. `LossyLevel::Error.should_reject(false, false)` → `true`
  14. `LossyLevel::Error.should_reject(false, true)` → `false`
  15. `LossyLevel::Warn.should_reject(false, false)` → `false`
  16. `resolve_api_format(Auto, "http://host/v1/chat/completions")` → `OpenaiChat`
  17. `resolve_api_format(Auto, "http://host/v1/responses")` → `OpenaiResponses`
* **計装方法・観測対象:** 関数カバレッジ（全分岐パス網羅）、文字列処理のメモリアロケーション回数

#### チケット M1-2: AppConfig::validate — 集約型設定検証

* **参照設計書:** crates/anthropx/RFC.md (§2.1 設定検証ルール)
* **依存・関連チケットID:** 先行実装必須: M0-1, M0-2
* **対象不変条件 / 規範:**
  - provider 名は一意（BTreeMap が保証）（RFC §2.1）
  - `api_keys` は 1 件以上（RFC §2.1）
  - `models.public` は provider 内で一意（RFC §2.1）
  - `aliases` は同一 provider 内で衝突禁止（RFC §2.1）
  - global alias と provider alias の競合は許容（provider 優先）（RFC §2.1）
  - `max_queue=0` は queue 無効として許容（RFC §2.1）
  - `url_prefix` は先頭 `/` を正規化、末尾 `/` を除去（RFC §2.1）
  - 全エラーを収集してから一度に報告（集約型）（RFC §2.1）
* **実装の背景と目的:** 起動シーケンスの一部として呼ばれる設定検証。全エラーを収集してから報告することで、ユーザーが起動を繰り返すことなく全修正を一度に行える。
* **実装スコープ:**
  - `impl AppConfig { pub fn validate(&self) -> Result<(), Vec<ConfigError>> }`
  - チェック項目:
    1. 各 provider の `api_keys` が空でない
    2. 各 provider 内の `models.public` に重複がない
    3. 各 provider 内の `aliases` に重複がない
    4. global alias と provider alias の競合（許容、ログのみ）
    5. `max_queue=0` の許容（警告なし）
    6. `url_prefix` の正規化（先頭 `/` 付与、末尾 `/` 除去）
    7. ポート番号が `1..=65535` の範囲内
    8. timeout 値の非零チェック
* **テストコードによる検証:**
  1. 正常な AppConfig → `Ok(())`
  2. 空の `api_keys` を持つ provider → `Err(vec![ConfigError::EmptyApiKeys(..)])`
  3. 重複した `models.public` → `Err`
  4. 重複した provider alias → `Err`
  5. 複数の設定ミス → 全エラーが `Vec` に含まれる（集約確認）
  6. `max_queue=0` → 許容（`Ok(())`）
  7. ポート番号 0 → エラー
* **計装方法・観測対象:** エラー収集数、検証の分岐カバレッジ

---

## フェーズ2: Mock/Fake による制御実行の導入

> **外部依存:** tokio (sync), toml, clap, std::time
> **特徴:** 非同期ランタイムプリミティブを導入するが、実I/Oは後段で追加、ここでは Fake で代用可能な単位に限定

### M2: 非同期プリミティブ

> **DB:** メモリ内完結

#### チケット M2-1: KeyScheduler — 起動時乱択 + round-robin key 管理

* **参照設計書:** crates/anthropx/RFC.md (§4.2 API key スケジューラ)
* **依存・関連チケットID:** 先行実装必須: M0-1
* **対象不変条件 / 規範:**
  - 起動時に provider ごとに開始 index を乱択（RFC §4.2）
  - 以後は atomic な round-robin（RFC §4.2）
  - non-stream: failover 可能、最大3回（RFC §4.2）
  - stream: failover 禁止、最初のエラーで終端（RFC §4.2）
  - Relaxed ordering: 正確な順序よりパフォーマンス優先（RFC §4.2）
* **実装の背景と目的:** API key の選択と failover 戦略を司る。`std::sync::atomic` のみを使用し、tokio 非依存。起動時の乱数シードは `SystemTime::now()` のナノ秒を使用するが、テストでは固定シードで上書き可能にする。
* **実装スコープ:**
  - `KeyScheduler` struct（keys: Vec<String>, current: AtomicUsize, provider_name: String）
  - `KeyScheduler::new(keys, provider_name) → Self`
    - 起動時乱択: `SystemTime::now().duration_since(UNIX_EPOCH).as_nanos() % keys.len()`
  - `KeyScheduler::select_key() → &str`
    - `current.fetch_add(1, Relaxed) % keys.len()`
  - `KeyScheduler::key_count() → usize`
  - `KeyScheduler::provider_name() → &str`
  - `KeyScheduler::with_seed(keys, name, seed) -> Self`（テスト用、固定シード）
* **注記:** `execute_with_failover` および `execute_stream` 関数は `reqwest::Client` に依存するため、このチケットでは実装せず M3-4（Transparent mode）で実装する。本チケットでは KeyScheduler の単体機能に集中する。
* **テストコードによる検証:**
  1. 固定シードで初期化したスケジューラが期待値と一致する開始位置を持つ
  2. `select_key()` を N 回呼ぶと全 key が均等に選択される（N=keys.len()*100 の統計的検証）
  3. `select_key()` が `AtomicUsize` のラップアラウンド後も正しく動作する
  4. `key_count()` が key 配列長と一致する
* **計装方法・観測対象:** 選択分布の一様性（カイ二乗検定）、failover 試行回数のカウント

#### チケット M2-2: ConcurrencyLimiter — Semaphore-based backpressure

* **参照設計書:** crates/anthropx/RFC.md (§7 並行性制御)
* **依存・関連チケットID:** 先行実装必須: M0-1 (GlobalLimitConfig)
* **対象不変条件 / 規範:**
  - in-flight 上限到達時は bounded queue で待機（RFC §7）
  - queue 満杯時は 429 エラー（RFC §7）
  - `Semaphore::acquire_owned` で非同期待機（RFC §7）
  - `permit` は drop 時に自動解放（RFC §7）
  - クライアント切断時は Future drop で自動返却（RFC §7）
* **実装の背景と目的:** Provider ごとの最大同時実行数を制御する。`tokio::sync::Semaphore` をラップし、queue 長の楽観的カウンタを `AtomicUsize` で管理する。
* **実装スコープ:**
  - `ConcurrencyLimiter` struct（semaphore: Arc<Semaphore>, max_queue: usize, current_queue: AtomicUsize）
  - `ConcurrencyLimiter::new(max_in_flight, max_queue) → Self`
  - `ConcurrencyLimiter::acquire() → Result<OwnedSemaphorePermit, LimiterError>`
    - queue 残容量チェック（楽観的: `current_queue.load(Acquire) >= max_queue` → `Err(LimiterError::QueueFull)`）
    - `current_queue.fetch_add(1, Release)`
    - `semaphore.acquire_owned().await`（非同期待機）
    - `current_queue.fetch_sub(1, Release)`
  - `LimiterError` enum（QueueFull, Closed）
* **テストコードによる検証:**
  1. `max_in_flight=1` で 2つの acquire → 1つ目即取得、2つ目は待機
  2. `max_in_flight=1, max_queue=0` で 2つの acquire → 1つ目即取得、2つ目は `Err(QueueFull)`
  3. permit が drop されると in-flight カウントが減少する（`try_acquire` で確認）
  4. 同時 `max_in_flight` 并发で全件が期限内に acquire 可能
  5. 1000回の acquire/release サイクルでカウンタのリークがない
* **計装方法・観測対象:** acquire のレイテンシ分布、queue depth の時間推移、permit の自動解放検証（ドロップカウンタ）

#### チケット M2-3: ConfigLoader — TOML 読込 + CLI

* **参照設計書:** crates/anthropx/RFC.md (§2 設定システム, Appendix A)
* **依存・関連チケットID:** 先行実装必須: M0-1, M1-2。後続: 全チケット
* **対象不変条件 / 規範:**
  - TOML 読み込み後に `validate()` を自動呼び出し（RFC §2）
  - CLI は `-t <path>` のみ（RFC §2）
  - `from_toml` とプログラム的構築の二刀流（RFC §2）
* **実装の背景と目的:** ファイル I/O を含む最初のチケット。`toom` クレートで TOML をパースし、`AppConfig::validate()` で検証する。CLI は `clap` で実装。
* **実装スコープ:**
  - `impl AppConfig { pub fn from_toml(path: &Path) -> Result<Self, ConfigError> }`
    - `std::fs::read_to_string` → `toml::from_str` → `validate()`
  - `cli::parse_args() -> PathBuf`（clap: `-t <path>` 必須引数）
  - Validate エラー発生時のエラーメッセージ整形（全エラーを表示）
* **テストコードによる検証:**
  1. 正常な TOML → `Ok(AppConfig)` （全フィールド期待値一致）
  2. 存在しないファイル → `Err(ConfigError::Io)`
  3. 不正な TOML 構文 → `Err(ConfigError::Parse)`
  4. 無効な値（port=0）→ `Err(ConfigError::ValidationFailed)`（中身に該当エラーを含む）
  5. 空の `api_keys` → 複数エラー集約
  6. CLI: `-t` なし → clap がエラー終了（テストは `debug_assert` または `assert!(clap_result.is_err())`）
* **計装方法・観測対象:** パースエラーの種類分布、ファイル読み込みのレイテンシ、検証エラー数の平均

---

## フェーズ3: HTTPサーバー — ライフサイクル・エラー処理の統合

> **外部依存:** axum, reqwest, tokio (full), futures, tokio-util (CancellationToken)
> **特徴:** `server` feature を有効化。このフェーズで初めて実際の HTTP サーバーとして動作する

### M3: HTTPサーバー構築

> **DB:** メモリ内完結

#### チケット M3-1: AppState + Router + ProxyError::into_response

* **参照設計書:** crates/anthropx/RFC.md (§3.1 AppState, §3.3 Router, §11 ProxyError IntoResponse)
* **依存・関連チケットID:** 先行実装必須: M0-1, M0-2, M2-1, M2-2
* **対象不変条件 / 規範:**
  - `AppState` は全リクエストで `Arc` 共有（RFC §3.1）
  - `ProxyError` → `IntoResponse` で Anthropic 互換エラースキーマに変換（RFC §11）
  - Router は 4 つの endpoint を持つ（RFC §3.3）
  - `url_prefix` 対応（RFC §3.3）
* **実装の背景と目的:** サーバーの実行時状態を保持する `AppState` と、全エラー型を HTTP 応答に変換する `IntoResponse` 実装、および Router の骨格を構築する。このチケットでは handler はスタブでよい。
* **実装スコープ:**
  - `AppState` struct（config: AppConfig, http_clients, schedulers, limiters の HashMap）
  - `impl ProxyError { fn into_response(self) -> Response }`（状態コードと Anthropic 互換 JSON body のマッピング）
    - `UnknownProvider / InvalidModel / MissingField / TransformLossy` → 400 + `invalid_request_error`
    - `Unauthorized` → 401 + `authentication_error`
    - `Forbidden` → 403 + `permission_error`
    - `QueueFull` → 429 + `rate_limit_error`
    - `Upstream / UpstreamError` → 502 + `upstream_error`
    - `Timeout` → 504 + `timeout_error`
    - `Internal / Config` → 500 + `internal_error`
  - `build_router(state: Arc<AppState>) → Router`
    - `/healthz` (GET), `/metrics` (GET), `/v1/models` (GET), `/v1/messages` (POST)
    - `url_prefix` 対応（Router::nest）
  - `fn generate_request_id() -> String`（UUID v4 または ulid）
* **テストコードによる検証:**
  1. `ProxyError` 全バリアントの HTTP ステータスコードと error_type が期待値と一致する
  2. `ProxyError::into_response()` の JSON body が Anthropic 互換スキーマに準拠
  3. `build_router` が 4 endpoint 全てを登録する
  4. エラーレスポンスの Content-Type が `application/json`
* **計装方法・観測対象:** エラーレスポンスの JSON バリデーション、ステータスコードとエラー型の一致率

#### チケット M3-2: 認証 Tower middleware

* **参照設計書:** crates/anthropx/RFC.md (§3.2 クライアント認証 + upstream 認証)
* **依存・関連チケットID:** 先行実装必須: M3-1（Router が必要）
* **対象不変条件 / 規範:**
  - クライアント認証 Layer は `require_client_auth=false` ならスキップ（RFC §3.2）
  - Bearer Token / x-api-key 両対応（RFC §3.2）
  - upstream 認証 Layer はクライアント由来 Authorization を常にブロック（RFC §3.2）
* **実装の背景と目的:** クライアント→proxy 方向の認証と proxy→upstream 方向の認証注入の2つの Tower Layer を実装する。M1-1 の `build_upstream_headers` を内部で利用。
* **実装スコープ:**
  - `client_auth_layer(config: &GlobalConfig) -> Option<Layer>`（条件付き適用）
    - `require_client_auth` が false → `None`（Layer を積まない）
    - 認証検証: `Authorization: Bearer <token>` または `x-api-key: <key>` を検証
    - 認証不備 → 401 / 403
  - `upstream_auth_layer() -> Layer`
    - クライアント由来の Authorization / x-api-key header を削除
    - upstream への認証は reqwest::Client の default header 経由
  - M1-1 の `build_upstream_headers()` を内部で利用
* **テストコードによる検証:**
  1. `require_client_auth=false` → Layer が None
  2. `require_client_auth=true` + 有効な Bearer → 通過
  3. `require_client_auth=true` + 無効な Bearer → 401
  4. `require_client_auth=true` + 有効な x-api-key → 通過
  5. `require_client_auth=true` + 認証 header なし → 401
  6. upstream Layer がクライアント認証 header を正しく除去する
* **計装方法・観測対象:** 認証成功/失敗のカウント、認証ヘッダの種類分布

#### チケット M3-3: Endpoint handlers — healthz / metrics / v1/models / v1/messages skeleton

* **参照設計書:** crates/anthropx/RFC.md (§3.3 エンドポイント一覧, §10 可観測性)
* **依存・関連チケットID:** 先行実装必須: M3-1, M3-2。後続: M3-4, M3-5（具体的な provider 処理を実装）
* **対象不変条件 / 規範:**
  - `/healthz` は liveness 簡易検査（RFC §3.3）
  - `/metrics` は Prometheus text exposition format（RFC §3.3, §10）
  - `/v1/models` は全 provider の enabled model をソートして返す（RFC §3.3）
  - `/v1/messages` は request_id 生成 + model 解析 + provider 解決 + handler 分岐の骨格（RFC §3.3）
* **実装の背景と目的:** 4つの endpoint handler の骨格を実装する。このチケットでは `/v1/messages` の handle_messages は routing 解決までを行い、実際の provider 処理は M3-4 / M3-5 で実装する。
* **実装スコープ:**
  - `async fn healthz(State) -> Json` — `{"status": "ok"}` を返す
  - `async fn metrics_handler(State) -> String` — Prometheus 形式のメトリクス文字列
  - `async fn list_models(State(state): State<Arc<AppState>>) -> Json<Value>`
    - 全 provider の enabled model を走査
    - `id: provider/public`, `object: "model"`, `owned_by: provider_name` の標準フィールド
    - `display_name`, `upstream`, `enabled`, `tags`, `aliases`, `max_tokens_cap` の拡張フィールド
    - `provider名 → public model名` 昇順ソート
  - `async fn handle_messages(State(state), Json(body)) -> Result<Response, ProxyError>`
    - request_id 生成（spawn または即時）
    - `model` フィールド抽出 → `parse_provider_model`
    - provider 解決（`state.config.providers.get(provider_name)`）
    - `[::STUB::]` provider 処理は M3-4 で実装。現時点では `handle_transparent` / `handle_translate` を呼ぶ骨格のみ
  - `register_metrics()` — metrics カウンタの初期登録
  - `record_request()` — リクエスト完了時のメトリクス記録関数
* **テストコードによる検証:**
  1. `GET /healthz` → 200 + `{"status":"ok"}`
  2. `GET /v1/models` → 200 + ソート済み model 一覧（全6フィールド確認）
  3. `GET /v1/models` → extended fields が含まれる
  4. `POST /v1/messages` に不正な model → 400 + `invalid_request_error`
  5. 存在しない provider → 400 + `UnknownProvider`
  6. メトリクスカウンタが正しく増加する
* **計装方法・観測対象:** 各 endpoint の応答ステータス分布、レスポンスタイム、list_models の model 数

#### チケット M3-4: Transparent provider mode

* **参照設計書:** crates/anthropx/RFC.md (§5.1 Transparent mode, §8 Streaming SSE proxy)
* **依存・関連チケットID:** 先行実装必須: M3-3（handle_messages の routing 解決が必要）。後続: M3-5（Translate は Transparent と同じインターフェースを共有）
* **対象不変条件 / 規範:**
  - transparent = true の provider は HTTP 的に透過中継（RFC §5.1）
  - upstream 認証は provider api_keys で上書き（RFC §5.1）
  - hop-by-hop header は除外（RFC §3.2）
  - streaming は `axum::body::Stream` + `tokio::select!`（RFC §8）
  - client disconnect 時は upstream Future を drop（RFC §8）
  - non-stream は key failover 可能、stream は failover 禁止（RFC §4.2）
* **実装の背景と目的:** 最もシンプルな provider mode。upstream が Anthropic 互換 API の場合の透過中継を実装する。SSE streaming の proxy 処理を含む。
* **実装スコープ:**
  - `async fn handle_transparent(state, provider, resolved, api_key, body, is_stream) -> Result<Response, ProxyError>`
    - upstream URL 構築: `{base_url}/v1/messages`
    - model 名を upstream 名に書き換え
    - non-stream: `execute_with_failover` → JSON 応答
    - stream: `execute_stream` → `proxy_sse_stream`
  - `async fn execute_with_failover(client, scheduler, request) -> Result<Response, ProxyError>`（M2-1 の設計を reqwest 実装で具体化）
    - KeyScheduler から key 選択、request 送信
    - 5xx 応答時のみ failover（最大3回の他 key 再試行）
    - 4xx 応答時は即座に返す
    - `llm_bridge_key_failover_total` メトリクスをインクリメント
  - `async fn execute_stream(client, scheduler, request) -> Result<Response, ProxyError>`（stream failover 禁止）
    - 最初の key で送信、5xx でも failover せずエラー終端
  - `async fn proxy_sse_stream(upstream_stream, cancel) -> Response<Body>`
    - `Body::new_channel()` で tx/rx ペア作成
    - `tokio::spawn` 内で `tokio::select!` ループ
    - client disconnect → `tx.send()` が `Err` → break
    - upstream error → break（log 出力）
    - SSE header: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
  - `async fn stream_response(upstream_resp) -> Response`（transparent stream 応答構築）
  - `async fn json_response(upstream_resp) -> Response`（transparent non-stream 応答構築）
* **テストコードによる検証:**
  1. **Non-stream**: axum::test mock upstream からの正常応答を中継
  2. **Stream**: axum::test mock upstream からの SSE ストリームを中継
  3. **model 名書き換え**: リクエスト body の model が upstream 名に置き換わる
  4. **Client disconnect**: クライアント切断時に upstream へのリクエストが中断される
  5. **Header**: hop-by-hop header が除去される
  6. **Failover (non-stream)**: 503 → 別 key で再試行 → 成功
  7. **Failover禁止 (stream)**: 503 → 即時エラー終端
* **計装方法・観測対象:** ストリーム中継のレイテンシ、転送バイト数、failover 発火率、client disconnect の検出レイテンシ

#### チケット M3-5: Translate provider mode

* **参照設計書:** crates/anthropx/RFC.md (§5.2 Translate mode, §1.3 bridge interface, §6 Lossy Translation)
* **依存・関連チケットID:** 先行実装必須: M3-4（transparent と同じインターフェースパターン）。外部依存: `llm-bridge-core` crate
* **対象不変条件 / 規範:**
  - `llm-bridge-core` の関数を直接呼ぶ薄いアダプタ層（RFC §1.3）
  - `OpenAiWireApi` → `ApiFormat` 対応（RFC §1.3）
  - non-stream: `anthropic_to_openai` → upstream → `openai_to_anthropic`（RFC §5.2）
  - stream: `anthropic_to_openai` → upstream + `transform_stream`（RFC §5.2）
  - Lossy 発生時は `allow_lossy` + `error_lossy_continue` で動作決定（RFC §6）
* **実装の背景と目的:** llm-bridge-core のプロトコル変換能力を活用し、Anthropic ↔ OpenAI 間の翻訳を行う。このチケットで anthropx の全機能が揃う。
* **実装スコープ:**
  - `async fn handle_translate(state, provider, resolved, api_key, body, is_stream) -> Result<Response, ProxyError>`
    - `resolve_api_format()` で `ApiFormat` を決定
    - **non-stream path 3-step**:
      1. `anthropic_to_openai(TransformRequest)` または `anthropic_to_openai_responses()`
      2. `provider.http_client.post(transformed.path).body(transformed.body).send()`
      3. `openai_to_anthropic(TransformResponse)` または `responses_to_anthropic()`
    - **stream path 3-step**:
      1. `anthropic_to_openai()` で request 変換
      2. upstream に stream リクエスト送信
      3. `transform_stream()` で SSE 変換 + `translate_stream()` で Axum SSE 応答
  - `async fn translate_stream(upstream_resp, stream_state) -> Response<Body>`
    - `upstream_resp.bytes_stream()` で chunk 受信
    - 各 chunk → `transform_stream()` → Anthropic SSE event → チャネル送信
  - Lossy 検出時の metrics/log 出力（`llm_bridge_lossy_total` カウンタ）
* **テストコードによる検証:**
  1. **Non-stream**: `anthropic_to_openai()` + mock upstream + `openai_to_anthropic()` の 3step が成立
  2. **Stream**: `anthropic_to_openai()` + mock SSE upstream + `transform_stream()` が成立
  3. **OpenAiWireApi**: ChatCompletions / Responses / Auto の3モード全てで正しく分岐
  4. **Lossy**: `allow_lossy=false` で lossy 発生 → `TransformLossy` エラー
  5. **Lossy続行**: `allow_lossy=true + error_lossy_continue=true` で続行 + metrics
* **計装方法・観測対象:** 変換レイテンシ、lossy 発火率（`llm_bridge_lossy_total`）、変換エラー率

---

## フェーズ4: 統合・E2E

> **外部依存:** （既存のものの組み合わせ。新規外部依存なし）
> **特徴:** 全コンポーネントを結合し、バイナリとしての起動・停止・テストを完了する

### M4: ライフサイクル管理・テスト

> **DB:** メモリ内完結（またはテスト用 SQLite :memory:）

#### チケット M4-1: ProxyServer::start — 起動シーケンス + ServerHandle

* **参照設計書:** crates/anthropx/RFC.md (§9 ライフサイクル管理, §1.1 デュアルモード)
* **依存・関連チケットID:** 先行実装必須: M3-1, M3-2, M3-3, M3-4, M3-5
* **対象不変条件 / 規範:**
  - `ProxyServer::start(config)` → `ServerHandle`（RFC §9）
  - `ServerHandle.shutdown()` で graceful shutdown（RFC §9）
  - 起動時に http_clients / schedulers / limiters を一括生成（RFC §9）
  - `validate()` が先に呼ばれる（RFC §9）
* **実装の背景と目的:** 全コンポーネントの初期化と起動を統括するエントリポイント。`CancellationToken` による graceful shutdown を提供する。
* **実装スコープ:**
  - `ProxyServer` struct（new は不要、start が唯一の公開メソッド）
  - `impl ProxyServer { pub async fn start(config: AppConfig) -> Result<ServerHandle, Box<dyn Error>> }`
    - `config.validate()`（エラー時は全エラーを `tracing::error` で出力後 `ConfigError::ValidationFailed` で abort）
    - `CancellationToken::new()`
    - `build_http_clients(&config) -> HashMap<String, Client>`（provider ごとに reqwest::Client 生成）
    - `build_schedulers(&config) -> HashMap<String, KeyScheduler>`
    - `build_limiters(&config) -> HashMap<String, ConcurrencyLimiter>`
    - `AppState::new(config, clients, schedulers, limiters)`
    - `build_router(state)` → `axum::serve(listener, router).with_graceful_shutdown(cancel)`
    - `ServerHandle { cancel, join_handle }` を返す
  - `ServerHandle` struct（cancel: CancellationToken, join_handle: JoinHandle<()>）
    - `async fn shutdown(self)` — cancel → timeout 30s で join
    - `async fn join(self) -> Result<(), JoinError>` — 外部シグナル用
* **テストコードによる検証:**
  1. 起動 → `Ok(ServerHandle)`、指定ポートで listen
  2. `handle.shutdown().await` → サーバーが 30 秒以内に停止
  3. 設定エラー時（port=0 など）→ `Err`、エラーログが出力される
  4. `start()` 内で `validate()` が呼ばれる（mock で検証）
* **計装方法・観測対象:** 起動時間、shutdown 完了時間、provider 数と client pool 生成時間の相関

#### チケット M4-2: Binary entrypoint (main.rs)

* **参照設計書:** crates/anthropx/RFC.md (§9 lifecycle.rs の binary entrypoint)
* **依存・関連チケットID:** 先行実装必須: M4-1, M2-3（CLI）
* **対象不変条件 / 規範:**
  - `#[cfg(feature = "server")]` でガード（RFC §9）
  - tracing subscriber の設定は main.rs の責務（RFC §10）
  - Ctrl+C で graceful shutdown（RFC §9）
* **実装の背景と目的:** `[[bin]]` エントリポイントの実装。`cli::parse_args()` → `AppConfig::from_toml()` → `ProxyServer::start()` → `handle.join()` の起動シーケンスを実装する。
* **実装スコープ:**
  - `src/main.rs`（`#[cfg(feature = "server")]`）
    - `#[tokio::main]`
    - `let config_path = cli::parse_args()`
    - `let config = AppConfig::from_toml(&config_path)?`
    - tracing subscriber の初期化（format は config.log_format に従う）
    - `let handle = ProxyServer::start(config).await?`
    - Ctrl+C signal ハンドラ設定
    - `handle.join().await?`
* **テストコードによる検証:**
  1. コンパイル: `cargo build --features server` が成功
  2. コンパイル: `cargo build --no-default-features` が成功（binary なし）
  3. `cargo run -- -t <config>` で起動・終了（integration test）
* **計装方法・観測対象:** バイナリサイズ、起動時間、依存クレート数

#### チケット M4-3: Mock server integration tests

* **参照設計書:** crates/anthropx/RFC.md (§12 テスト戦略, 「受け入れ基準と対応テスト」)
* **依存・関連チケットID:** 先行実装必須: M4-1, M4-2（全機能が揃った状態でテスト）
* **対象不変条件 / 規範:**
  - AC#1: transparent non-stream /v1/messages → 200（RFC §12）
  - AC#2: transparent stream /v1/messages → 200（RFC §12）
  - AC#3: translate non-stream /v1/messages → 200（RFC §12）
  - AC#4: translate stream /v1/messages → 200（RFC §12）
  - AC#5: non-stream key failover → 成功（RFC §12）
  - AC#6: stream no-failover → エラー（RFC §12）
  - AC#7: /v1/models sorted → ソート順確認（RFC §12）
  - AC#8: provider/model split → 400（RFC §12）
  - AC#9: queue overflow → 429（RFC §12）
  - AC#10: /metrics, /healthz → 200（RFC §12）
* **実装の背景と目的:** 設計書の受け入れ基準10項目すべてを axum::test を用いた mock upstream テストで検証する。CI で常時実行可能。
* **実装スコープ:**
  - `tests/mock_server.rs`（integration test）
  - `setup_mock_upstream() -> TestServer`: 4つの mock endpoint（/v1/messages non-stream, /v1/messages stream, /v1/models, /healthz）を提供
  - AC#1: transparent non-stream → mock からの JSON 応答を中継確認
  - AC#2: transparent stream → mock からの SSE 応答を中継確認
  - AC#3: translate non-stream → llm-bridge-core による変換が正しく動作することを確認
  - AC#4: translate stream → transform_stream が正しく動作することを確認
  - AC#5: 503 を返す mock + 2つの api_keys → failover 後 success
  - AC#6: 503 を返す mock + stream → エラー終端
  - AC#7: /v1/models のソート順（provider → public）
  - AC#8: "model-without-slash" → 400
  - AC#9: max_in_flight=0, max_queue=0 でリクエスト → 429
  - AC#10: /metrics と /healthz が 200 を返す
* **テストコードによる検証:**
  1. 全10項目の acceptance criteria が個別テストとして存在
  2. 各テストが独立して実行可能
  3. `cargo test` で全テストが pass
* **計装方法・観測対象:** テスト実行時間、各 AC の成功率、mock server の応答数

#### チケット M4-4: Real provider integration tests

* **参照設計書:** crates/anthropx/RFC.md (§12 テスト戦略)
* **依存・関連チケットID:** 先行実装必須: M4-1, M4-2（実プロバイダーに対して通しテスト）
* **対象不変条件 / 規範:**
  - `#[cfg_attr(not(feature = "integration-test"), ignore)]` で分離（RFC §12）
  - API key は環境変数から注入（RFC §12）
  - CI ではスキップ（RFC §12）
* **実装の背景と目的:** 実際の upstream provider（DeepSeek 等）に対して anthropx を通してリクエストし、エンドツーエンドの動作を検証する。CI では実行せず、定期実行または手動実行のみ。
* **実装スコープ:**
  - `tests/real_provider.rs`（`#[cfg(feature = "integration-test")]`）
  - 環境変数読み込み（例: `ANTHROPX_TEST_DEEPSEEK_API_KEY`）
  - transparent provider 設定で通しテスト
  - translate provider 設定で通しテスト
  - `/v1/models` の実体確認
* **テストコードによる検証:**
  1. `cargo test --features integration-test` で実行
  2. 環境変数未設定時はスキップ（`Option_env!` で判定）
  3. 各テストが 30 秒以内に完了
* **計装方法・観測対象:** 実プロバイダーのレイテンシ、エラー率、変換の正確性
