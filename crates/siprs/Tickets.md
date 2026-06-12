# Rust SIP Client Crate（siprs）実装チケット分解設計書

> **生成元:** docs/rust-sip-client-rfc.md
> **生成日:** 2026-06-12
> **分析済みセクション:** §1–§51（全セクション）
> **対象crate:** crates/siprs

---

## フェーズ構造概要

| フェーズ | 内容 | 外部依存 | マイルストーン |
|----------|------|----------|----------------|
| 1: 基盤型定義 | エラー型・ID型・オーディオ型・設定型 | なし | M0–M2 |
| 2: 純粋ロジック | バリデーション・IDマッピング・音声アルゴリズム | なし | M3–M5 |
| 3: イベントシステム | イベント型・EventBus | tokio broadcast | M6–M7 |
| 4: 状態機械 | 登録状態・通話状態・ClientState | なし | M8–M9 |
| 5: ランタイム基盤 | SipBackend trait・MockBackend・Reactor | tokio | M10–M11 |
| 6: SipClient公開API | SipClient・SipAccountHandle・発着信 | tokio | M12–M13 |
| 7: 音声パイプライン | AudioMixer・AudioWorkerTask・Tap・Resample | tokio, crossbeam, rubato, dashmap | M14–M16 |
| 8: FFI層 | bindgen・PjsuaBackend・callback bridge | PJSIP 2.17 | M17–M18 |
| 9: ビルドシステム | build.rs・feature flags・OS別リンク | CMake, PJSIP | M19 |
| 10: 統合・受け入れ | 結合テスト・相互接続・受け入れ基準検証 | Docker, SIPサーバ | M20 |

---

## フェーズ1: 基盤型定義（Layer 0）

> **外部依存:** `secrecy`, `std::num::NonZeroU64`。PJSIP不要、非同期不要。全テストはメモリ内完結。

### マイルストーン M0: エラー型・ID型

> **DB:** メモリ内完結

#### ✅ チケット M0-1: `SipError` / `SipErrorKind` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§14, §14.1)
* **対象不変条件 / 規範:** §14「すべての API は `Result<T, SipError>` を返す」。§14.1 エラー変換方針。
* **実装の背景と目的:** crate 全体のエラー型統一基盤。`thiserror::Error` を derive し、全モジュールから依存される最下層型。`SipErrorKind` は stable 分類を提供し、利用者がプログラム的にエラー種別を判別可能にする。
* **実装スコープ:**
  - `src/error.rs`: `SipError` 構造体（`kind`, `message`, `native_status: Option<i32>`, `account_id: Option<AccountId>`, `call_id: Option<CallId>`, `retryable: bool`）
  - `SipErrorKind` enum（全23バリアント。§14 参照）
  - `SipError::invalid_config(msg)` 等のコンストラクタヘルパー
  - `Display` / `Error` 実装（`thiserror` 経由）
  - `retryable` フラグの自動導出ロジック（kind に応じた決定論的マッピング）
* **テストコードによる検証:**
  1. 全 `SipErrorKind` バリアントの `Display` 出力に `kind` 名と `message` が含まれること
  2. `retryable` フラグが kind ごとに期待値と一致すること（`Timeout` → true, `InvalidConfig` → false, etc.）
  3. `account_id` / `call_id` の有無が正しくラウンドトリップすること
  4. `native_status` の `Option` 透過性
  5. `Debug` 出力に `SecretString` が露出しないこと（後続チケット M2-2 で検証）
* **計装方法・観測対象:** コンパイル時に `SipErrorKind` の全バリアント数が 23 であることを const assert。全コンストラクタ経路の網羅率。

#### ✅ チケット M0-2: `AccountId` / `CallId` / `AudioSourceId` newtype 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§9)
* **対象不変条件 / 規範:** §9「識別子はランタイム一意な非ゼロ整数とし、公開 API では newtype に隠蔽する」。`PJSUA の pjsua_acc_id や pjsua_call_id は再利用されうるため、そのまま公開しない`。
* **実装の背景と目的:** PJSUA のネイティブ ID 再利用から利用者を保護し、crate 内部での ID 衝突を防ぐ。全 ID は `NonZeroU64` を内部表現とし、ゼロ値による未初期化誤用を型レベルで排除する。
* **実装スコア:**
  - `src/util/id.rs`: `AccountId(NonZeroU64)`, `CallId(NonZeroU64)`, `AudioSourceId(NonZeroU64)`
  - 各型に `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq`, `Hash`, `PartialOrd`, `Ord` を derive
  - `AccountId::generate()` / `CallId::generate()` / `AudioSourceId::generate()` — 単調増加カウンタによる採番（`AtomicU64` + `NonZeroU64::new`）
  - `Display` 実装（例: `Account(1)`, `Call(42)`）
  - `serde::Serialize` / `Deserialize` は optional feature（`serde`）として提供
* **テストコードによる検証:**
  1. 同一ID同士の等価性（`==`, `Hash`, `Ord`）
  2. 異なる型のID間で比較不可能であること（コンパイル時検証 — `AccountId` と `CallId` は別型）
  3. `generate()` が毎回異なるIDを返すこと
  4. 100万回連続生成で `NonZeroU64` の不変条件が破れないこと
  5. `serde` feature 有効時、JSON roundtrip が成功すること（`serde_json::to_string` / `from_str`）
  6. `Copy` セマンティクスが正しく機能すること（clone 不要で値渡し可能）
* **計装方法・観測対象:** 全ID型が `Send + Sync + Copy` を満たすことをコンパイル時検証（`static_assertions` クレート併用）。

### マイルストーン M1: オーディオフォーマット型・トランスポート型

> **DB:** メモリ内完結

#### ✅ チケット M1-1: `SampleRate` / `BitDepth` / `ChannelLayout` / `AudioFormat` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§21)
* **対象不変条件 / 規範:** §21 音声フォーマットモデル。§42「sample rate は 8/16/24/48k のみ」。§48「既定 audio delivery: 16kHz/i16/stereo L=IN R=OUT」。
* **実装の背景と目的:** 音声パイプライン全体で使用されるフォーマット表現。利用者が要求するフォーマットと内部処理フォーマットの変換仕様を型で規定する。全音声処理モジュールの共通語彙となる。
* **実装スコープ:**
  - `src/audio/format.rs`: `SampleRate` enum（`Hz8000`, `Hz16000`, `Hz24000`, `Hz48000`）
  - `BitDepth` enum（`I16`, `F32`）
  - `ChannelLayout` enum（`Mono`, `StereoInOut`）
  - `AudioFormat` struct（`sample_rate`, `bit_depth`, `channel_layout`, `frame_ms: u16`）
  - `SampleRate::as_hz() -> u32` 変換メソッド
  - `AudioFormat::frame_samples(&self) -> usize` — frame_ms × sample_rate から1フレームのサンプル数を計算
  - `AudioFormat::frame_bytes(&self) -> usize` — frame_samples × bit_depth のバイト数
  - `AudioFormat::default()` → 16kHz / I16 / StereoInOut / 20ms（§48 既定）
* **テストコードによる検証:**
  1. `frame_samples()` が各 rate で正しい値を返す（例: 16000Hz × 20ms = 320 samples）
  2. `frame_bytes()` が bit_depth に応じた正しいバイト数を返す（I16: 320×2=640, F32: 320×4=1280）
  3. `StereoInOut` の場合、`frame_samples()` が mono の2倍になること（内部実装によるが、API的には透過）
  4. `Default::default()` が 16kHz/I16/StereoInOut/20ms であること
  5. 全 enum の `PartialEq` / `Eq` / `Copy` が正しく機能すること
  6. `SampleRate::as_hz()` の全バリアント網羅
* **計装方法・観測対象:** `AudioFormat` が `Copy` であることのコンパイル時検証。全 `SampleRate` バリアントの `as_hz()` 戻り値テーブルテスト。

#### ✅ チケット M1-2 [`#59`]: `AudioChunk` / `AudioChunkPair` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§21.1)
* **対象不変条件 / 規範:** §21.1「IN/OUT は同一タイムスタンプで対にされ、ズレは内部で吸収される」。§2「録音については AudioChunkPair の提供に留め、ファイルコンテナ化は利用側責務」。
* **実装の背景と目的:** 利用者が音声タップから受け取るデータ単位。IN（受信音声）と OUT（送信音声）を同一 `SystemTime` でペア化し、呼情報（account_id, call_id）を付与する。ファイル形式への変換は利用者側責務。
* **実装スコープ:**
  - `src/audio/chunk.rs`: `AudioChunk` enum（`I16(Vec<i16>)`, `F32(Vec<f32>)`）
  - `AudioChunkPair` struct（`call_id: CallId`, `account_id: AccountId`, `timestamp: SystemTime`, `in_chunk: AudioChunk`, `out_chunk: AudioChunk`）
  - `AudioChunk::len(&self) -> usize` — サンプル数
  - `AudioChunk::is_empty(&self) -> bool`
  - `AudioChunk::as_i16(&self) -> Option<&[i16]>` — 型付きアクセサ
  - `AudioChunk::as_f32(&self) -> Option<&[f32]>`
  - `AudioChunkPair::new(call_id, account_id, in_chunk, out_chunk) -> Self` — コンストラクタ（timestamp は内部で SystemTime::now()）
  - `AudioChunkPair::stereo_i16(&self) -> Result<Vec<i16>, SipError>` — L=IN, R=OUT のステレオインタリーブ（後続 M5-2 の `interleave_in_out` に委譲）
* **テストコードによる検証:**
  1. `AudioChunk::I16(vec![1,2,3]).len() == 3`
  2. `AudioChunk::F32(vec![1.0]).as_f32() == Some(&[1.0])`
  3. `as_i16()` が `F32` バリアントに対して `None` を返すこと
  4. `AudioChunkPair` の全フィールドが正しくラウンドトリップすること
  5. `stereo_i16()` の IN/OUT インタリーブ順が L=IN, R=OUT であること
  6. `is_empty()` が空ベクタで true を返すこと
  7. `Clone` / `Debug` が正しく機能すること
* **計装方法・観測対象:** 全テストがヒープ確保なしで実行可能なこと（`Vec::new()` を除く）。`AudioChunk` のサイズがポインタ2個分以下であること（enum オーバーヘッド最小化）。

#### ✅ チケット M1-3 [`#60`]: `TransportKind` / `TransportConfig` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§12)
* **対象不変条件 / 規範:** §12「TLS は feature flag で完全に API から消える設計とし、無効時に TLS variant が型レベルで出現しない」。機能要求 §5「UDP/TCP/TLS トランスポート」。
* **実装の背景と目的:** SIP 通信のトランスポート層設定。TLS は feature flag（`tls`）で conditional compilation し、無効時は型レベルで存在しない。これにより feature 無効時の TLS 誤使用をコンパイルエラーとする。
* **実装スコープ:**
  - `src/transport.rs`: `TransportKind` enum（`Udp`, `Tcp`, `Tls`（`#[cfg(feature = "tls")]`））
  - `TransportConfig` enum（`Udp(UdpTransportConfig)`, `Tcp(TcpTransportConfig)`, `Tls(TlsTransportConfig)`（`#[cfg(feature = "tls")]`））
  - `UdpTransportConfig { bind_addr: SocketAddr }`
  - `TcpTransportConfig { bind_addr: SocketAddr }`
  - `TlsTransportConfig { bind_addr: SocketAddr, tls: TlsConfig }`（`#[cfg(feature = "tls")]`）
  - `TransportConfig::udp(port: u16) -> Self` 等の convenience コンストラクタ
  - `TransportConfig::bind_addr(&self) -> SocketAddr`
  - `TransportConfig::kind(&self) -> TransportKind`
* **テストコードによる検証:**
  1. `TransportConfig::kind()` が各 variant で正しい `TransportKind` を返す
  2. `TransportConfig::bind_addr()` が正しいアドレスを返す
  3. `tls` feature 無効時に `TransportConfig::Tls` がコンパイルエラーになること（docテストで明記）
  4. `tls` feature 有効時に `TransportKind::Tls` が存在すること
  5. `udp(5060)` が `0.0.0.0:5060` を bind_addr に持つこと
* **計装方法・観測対象:** `cfg` 属性による conditional compilation の正しさを `cargo check --features tls` / `cargo check` の両方で検証。

#### ✅ チケット M1-4 [`#61`]: ICE/STUN/TURN 設定型定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§13)
* **対象不変条件 / 規範:** §13 ICE/STUN/TURN 完全仕様。「PJSIP 実装事情により trickle ICE は内部で非対応なら validation error で拒否するのではなく、ClientInitialized イベントに capability matrix を載せて明示する」。§13 Default impl。
* **実装の背景と目的:** NAT traversal のための ICE/STUN/TURN 設定。`IceConfig::default()` は RFC の既定値を反映し、利用者が明示的に指定しない限り有効な ICE 設定で動作する。
* **実装スコープ:**
  - `src/config.rs`（または `src/transport.rs` に同居）: `IceConfig` struct（`enabled`, `aggressive_nomination`, `trickle_ice`, `renomination`, `max_host_candidates`）
  - `IceConfig::default()` — §13 既定値
  - `StunServerConfig { uri: String }`
  - `TurnServerConfig { uri: String, username: Option<String>, password: Option<SecretString>, transport: TurnTransport }`
  - `TurnTransport` enum（`Udp`, `Tcp`）
* **テストコードによる検証:**
  1. `IceConfig::default()` の各フィールドが§13 既定値と一致すること
  2. `TurnServerConfig` の `username` / `password` が `None` 許容であること
  3. `StunServerConfig` の `uri` が `stun:` プレフィックスを受け付けること（型レベルでは文字列のため未検証。バリデーションは M3-1 で実施）
  4. `Clone` / `Debug` が全型で正しく機能すること
  5. `SecretString` 使用箇所の `Debug` 出力が `"***REDACTED***"` であること
* **計装方法・観測対象:** `IceConfig` のサイズがキャッシュライン（64B）以内であること。`TurnServerConfig` が `Clone` 可能であること（reactor への送信に必要）。

### マイルストーン M2: 設定型

> **DB:** メモリ内完結

#### ✅ チケット M2-1 [`#62`]: `ClientConfig` / `ClientAudioConfig` / `TimeoutConfig` / `RawSipEventConfig` 定義と `Default` 実装

* **参照設計書:** docs/rust-sip-client-rfc.md (§10, §10.1)
* **対象不変条件 / 規範:** §10 ClientConfig 完全仕様。§10.1 既定値「既定 delivery format は要件に合わせて 16kHz / i16 / stereo(L=IN,R=OUT)」。§42「event bus capacity は 16 以上必須」「raw SIP event capacity は event bus capacity 以上必須」「pair buffer は frame_ms の整数倍必須」（バリデーションは M3-1 で実装）。
* **実装の背景と目的:** `SipClient::new()` の単一引数となる設定型。全サブシステムの初期化パラメータを集約し、`Default` で安全な既定値を提供する。
* **実装スコープ:**
  - `src/config.rs`: `ClientConfig` struct（§10 全フィールド）
  - `ClientAudioConfig` struct（`default_delivery_format`, `pair_buffer_ms`, `jitter_buffer_ms`, `mixer_frame_ms`, `max_sources_per_call`, `resampler_quality`）
  - `LogLevel` enum（`Error`, `Warn`, `Info`, `Debug`, `Trace`）
  - `TimeoutConfig` struct（`command_timeout`, `shutdown_timeout`, `register_timeout`, `invite_timeout`）
  - `RawSipEventConfig` struct（`enabled`, `include_bodies`, `max_body_bytes`, `redact_authorization`）
  - `ResamplerQuality` enum（`Low`, `Medium`, `High`）
  - `ClientConfig::default()` — §10.1 の全既定値
* **テストコードによる検証:**
  1. `ClientConfig::default()` の全フィールドが§10.1 と厳密に一致すること
  2. `ClientAudioConfig::default()` → `default_delivery_format` が 16kHz/I16/StereoInOut/20ms
  3. `TimeoutConfig` の各 Duration が期待値と一致すること
  4. `LogLevel` の全バリアントの `Display` が期待通りであること
  5. `RawSipEventConfig::default()` → `enabled: true`, `redact_authorization: true`
  6. `Clone` + `Debug` が `ClientConfig` で機能し、かつ `SecretString` が露出しないこと
* **計装方法・観測対象:** `ClientConfig` の `Default::default()` 呼び出しがスタック上で完結すること（ヒープ確保なし）。

#### ✅ チケット M2-2 [`#63`]: `AccountConfig` / `AccountCodecPolicy` / `OpusConfig` / `AccountMediaConfig` / `DtmfPolicy` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§11, §11.1)
* **対象不変条件 / 規範:** §11 AccountConfig 完全仕様。§11.1 validation rules（`username`, `domain`, `password` は空禁止、codec policy は `enable_pcmu || enable_opus` 必須、DTMF policy は送信・受信ともに 1 つ以上 required）。§30「SRTP は feature flag でオン・オフ可能、デフォルトオフ」。
* **実装の背景と目的:** アカウント単位の設定。パスワードは `SecretString` で保持し、デバッグ出力からの漏洩を防止する。DTMF 方式とコーデック設定を型安全に表現する。
* **実装スコープ:**
  - `src/config.rs`: `AccountConfig` struct（§11 全フィールド）
  - `AccountCodecPolicy` struct（`enable_pcmu`, `enable_opus`, `opus: OpusConfig`）
  - `OpusConfig` struct（`bitrate`, `complexity`, `cbr`, `inband_fec`, `dtx`, `ptime_ms`）
  - `DtmfPolicy` struct（`send_methods`, `receive_methods`, `default_send_method`）
  - `AccountMediaConfig` struct（`srtp`, `ice`, `vad`, `ec_tail_ms`, `input_gain_db`, `output_gain_db`）
  - `SrtpPolicy` enum（`Disabled`, `Optional`, `Mandatory`）
  - `AccountTransportPolicy` enum（`Default`, `Prefer(TransportKind)`, `Only(TransportKind)`）
  - `AuthOverride` struct（後続チケット用。§8.5参照）
  - `AccountConfigPatch` struct（`update_config` 用。全フィールド `Option<T>`）
  - `DtmfMethod` enum（`Inband`, `SipInfo`, `Rfc4733`）— §20 より先行定義
  - `Codec` enum（`Pcmu`, `Opus`）
  - `AccountCodecPolicy::default_voice()` — Opus 有効 + PCMU 有効の既定値
  - `DtmfPolicy::all_methods()` — 全方式有効の既定値
* **テストコードによる検証:**
  1. `AccountConfig` の全フィールドが正しく設定・取得できること
  2. `SecretString` フィールド（`password`）の `Debug` 出力が `"***REDACTED***"` であること
  3. `AccountCodecPolicy::default_voice()` が `enable_opus: true, enable_pcmu: true`
  4. `DtmfPolicy::all_methods()` が全方式を含むこと
  5. `AccountConfigPatch` の全フィールドが `Default` で `None` であること
  6. `SrtpPolicy::default()` が `Disabled` であること（§48 既定: SRTP disabled）
  7. `OpusConfig` の各フィールドの型が§11 と一致すること
* **計装方法・観測対象:** `AccountConfig` のサイズ見積もり（`size_of`）。`DtmfMethod` の `Copy` 成立確認。

#### 📋 チケット M2-3 [`#64`]: `TlsConfig` / `ReconnectPolicy` / `CallMediaPreferences` / `OutgoingCallRequest` / `NegotiatedCodec` / `CodecSelectionPolicy` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.5, §12, §29.2, §31)
* **対象不変条件 / 規範:** §29.2 NegotiatedCodec と CodecSelectionPolicy。§31 トランスポート再接続方針。§8.5 OutgoingCallRequest「`preferred_codecs` は最終的に PCMU, Opus のみ受理」。
* **実装の背景と目的:** 発信リクエスト、TLS 設定、ネゴシエーション結果、再接続ポリシーを型で規定する。発信リクエストは通話確立に必要な全パラメータをカプセル化する。
* **実装スコープ:**
  - `src/config.rs`: `CallMediaPreferences` struct（`enable_early_media`, `enable_srtp: Option<bool>`, `preferred_codecs: Vec<Codec>`）
  - `OutgoingCallRequest` struct（`target_uri`, `headers`, `auth_override`, `preferred_transport`, `media`, `auto_answer_refer`）
  - `NegotiatedCodec` enum（`Pcmu`, `Opus(OpusConfig)`）
  - `CodecSelectionPolicy` enum（`Ordered`, `PreferOpusFallbackPcmu`）with `Default`
  - `ReconnectPolicy` struct（`base_delay`, `max_delay`, `jitter_ratio`）
  - `TlsConfig` struct（`#[cfg(feature = "tls")]` — `verify_server`, `ca_cert_path`, `client_cert_path`, `client_key_path`, `server_name`, `allow_insecure_cipher_legacy`）
  - **ファイル配置の注記**: RFC §12 は `TlsConfig` を `transport.rs` に定義しているが、`M1-3` がトランスポート列挙型を担当し、本チケットは設定型を一括定義する。`TlsConfig` は `TransportConfig` からの参照の便宜も考慮して `config.rs` に配置する選択肢もある。実装時に `transport.rs` と `config.rs` のどちらに置くか決定すること。配置が変わっても公開API上の動作に影響はない。
* **テストコードによる検証:**
  1. `OutgoingCallRequest` の全フィールドが正しく設定・取得できること
  2. `CallMediaPreferences::default()` の各既定値確認
  3. `CodecSelectionPolicy::default()` → `PreferOpusFallbackPcmu`
  4. `NegotiatedCodec::Opus(config)` が OpusConfig を正しく保持すること
  5. `ReconnectPolicy` の `jitter_ratio` が `0.0..=1.0` の範囲であること（バリデーションは M3-1）
  6. `tls` feature 無効時に `TlsConfig` が存在しないこと
  7. `TlsConfig`（feature 有効時）の `Clone` + `Debug` が機能すること
* **計装方法・観測対象:** 全型が `Send + Sync` を満たすことのコンパイル時検証。

---

## フェーズ2: 純粋ロジック（Layer 1）

> **外部依存:** なし。全テストはメモリ内完結・決定論的。

### マイルストーン M3: 設定バリデーション

> **DB:** メモリ内完結

#### チケット M3-1: `ClientConfig` バリデーション

* **参照設計書:** docs/rust-sip-client-rfc.md (§42)
* **対象不変条件 / 規範:** §42 validation フェーズ。以下のルールを強制:
  - `event_bus_capacity >= 16`
  - `raw_sip_events.enabled == true` の場合 `raw_sip_event_capacity >= event_bus_capacity`
  - `sample_rate` は `Hz8000 | Hz16000 | Hz24000 | Hz48000` のみ
  - `pair_buffer_ms` が `frame_ms` の整数倍
  - unsupported transport feature 使用禁止
  - SRTP mandatory かつ feature off 禁止（`#[cfg(not(feature = "srtp"))]` 時）
  - TLS config と feature 不整合禁止（`#[cfg(not(feature = "tls"))]` 時）
* **実装の背景と目的:** fail-fast の原則に従い、`SipClient::new()` の冒頭で全設定の正当性を検証する。不正な設定は `SipError::InvalidConfig` として即座に拒否され、PJSUA の初期化前に検出される。
* **実装スコープ:**
  - `src/config.rs`: `pub(crate) fn validate_client_config(cfg: &ClientConfig) -> Result<(), SipError>`
  - 全バリデーションルールの実装（上記7項目 + 暗黙的に全ルール網羅）
  - `validate_client_config` の呼び出しコンテキスト: 「codec zero selection 禁止」（§42）は `AccountConfig` のバリデーション（M3-2）に含まれるため、`ClientConfig` 単体のバリデーションとしては扱わない。このルール分割は RFC §42 の列挙順序とは異なるが、config の階層構造に整合している。
  - 各チェック失敗時のエラーメッセージは「どのフィールドが、どの条件に違反したか」を明示
  - `pub(crate) fn validate_audio_config(cfg: &ClientAudioConfig) -> Result<(), SipError>`
  - `pub(crate) fn validate_transports(transports: &[TransportConfig]) -> Result<(), SipError>` — feature flag 整合性
* **テストコードによる検証:**
  1. `event_bus_capacity = 16` → OK, `event_bus_capacity = 15` → `InvalidConfig`
  2. `raw_sip_events.enabled = true`, `raw_sip_event_capacity < event_bus_capacity` → `InvalidConfig`
  3. `raw_sip_events.enabled = false` → `raw_sip_event_capacity` 不問で OK
  4. `sample_rate = Hz44100`（未サポート）→ `InvalidConfig`
  5. `pair_buffer_ms = 120`, `frame_ms = 20` → OK（6倍）, `pair_buffer_ms = 125`, `frame_ms = 20` → `InvalidConfig`
  6. `tls` feature 無効時に `TransportConfig::Tls` を含む → コンパイルエラー（型レベル）
  7. `srtp` feature 無効時に `SrtpPolicy::Mandatory` → `InvalidConfig`
  8. すべてのエラーメッセージに違反フィールド名が含まれること
* **計装方法・観測対象:** 全バリデーションルールの網羅率 100%。各ルールの「許可」と「拒否」の両ケースをテスト。

#### チケット M3-2: `AccountConfig` バリデーション

* **参照設計書:** docs/rust-sip-client-rfc.md (§11.1)
* **対象不変条件 / 規範:** §11.1 validation rules:
  - `username`, `domain`, `password` は空禁止
  - `register_on_start == false` でも `allow_outbound_without_register == true` なら有効
  - `registrar_uri` 未指定時は `sip:{domain}` を自動導出（バリデーションではないがここで実装）
  - codec policy は `enable_pcmu || enable_opus` が必須
  - DTMF policy は送信・受信ともに 1 つ以上 required
  - `preferred_codecs` は PCMU, Opus 以外を拒否
* **実装の背景と目的:** アカウント追加時の設定検証。不正なアカウント設定は `add_account()` 呼び出し時に `InvalidConfig` で拒否される。早期検出により PJSUA 側での不可解なエラーを防止する。
* **実装スコープ:**
  - `src/config.rs`: `pub(crate) fn validate_account_config(cfg: &AccountConfig) -> Result<(), SipError>`
  - `pub(crate) fn derive_registrar_uri(domain: &str, registrar_uri: &Option<String>) -> String`
  - `pub(crate) fn validate_codec_policy(policy: &AccountCodecPolicy) -> Result<(), SipError>`
  - `pub(crate) fn validate_dtmf_policy(policy: &DtmfPolicy) -> Result<(), SipError>`
  - `pub(crate) fn validate_media_config(media: &AccountMediaConfig) -> Result<(), SipError>` — SRTP feature flag 整合性
  - `pub(crate) fn validate_preferred_codecs(codecs: &[Codec]) -> Result<(), SipError>` — PCMU/Opus 以外拒否
* **テストコードによる検証:**
  1. `username = ""` → `InvalidConfig`
  2. `domain = ""` → `InvalidConfig`
  3. `password = SecretString::new("")` → `InvalidConfig`
  4. `register_on_start = false, allow_outbound_without_register = true` → OK
  5. `registrar_uri = None, domain = "pbx.example.com"` → 導出結果 `"sip:pbx.example.com"`
  6. `registrar_uri = Some("sips:pbx.example.com")` → 導出を上書きしない
  7. `enable_pcmu = false, enable_opus = false` → `InvalidConfig`
  8. `send_methods = vec![]` → `InvalidConfig`
  9. `receive_methods = vec![]` → `InvalidConfig`
  10. `preferred_codecs = vec![Codec::G722]`（未サポート）→ `InvalidConfig`
  11. `srtp = Mandatory` かつ `#[cfg(not(feature = "srtp"))]` → `InvalidConfig`
* **計装方法・観測対象:** 全バリデーションルールの「許可」と「拒否」両ケースの網羅。エラーメッセージに違反フィールド名が含まれることの検証。

### マイルストーン M4: IDマッピング・ユーティリティ

> **DB:** メモリ内完結

#### チケット M4-1: `BiMap<RuntimeId, NativeId>` 実装

* **参照設計書:** docs/rust-sip-client-rfc.md (§9, §45.4)
* **対象不変条件 / 規範:** §9「PJSUA の `pjsua_acc_id` や `pjsua_call_id` は再利用されうるため、そのまま公開しない。内部では `BiMap<RuntimeId, NativeId>` で変換する」。§45.4「public id を別採番し bi-map 変換」。
* **実装の背景と目的:** PJSUA が再利用するネイティブ ID から利用者を保護し、crate 内部で一貫した ID 管理を実現する。双方向マッピングにより O(1) で RuntimeId → NativeId および NativeId → RuntimeId の変換が可能。
* **実装スコープ:**
  - `src/util/id.rs`: `BiMap<L, R>` 構造体（`left_to_right: HashMap<L, R>`, `right_to_left: HashMap<R, L>`）
  - `BiMap::new() -> Self`
  - `BiMap::insert(&mut self, left: L, right: R) -> Option<(L, R)>` — 既存エントリがあれば旧ペアを返す
  - `BiMap::remove_by_left(&mut self, left: &L) -> Option<(L, R)>`
  - `BiMap::remove_by_right(&mut self, right: &R) -> Option<(L, R)>`
  - `BiMap::get_right(&self, left: &L) -> Option<&R>`
  - `BiMap::get_left(&self, right: &R) -> Option<&L>`
  - `BiMap::contains_left(&self, left: &L) -> bool`
  - `BiMap::contains_right(&self, right: &R) -> bool`
  - `BiMap::len(&self) -> usize`
  - `BiMap::is_empty(&self) -> bool`
  - `L` と `R` は `Hash + Eq + Clone` を要求
* **テストコードによる検証:**
  1. 空の BiMap に対する全操作（get は None, contains は false）
  2. insert → get_right / get_left が正しい値を返す
  3. 同じ left の再 insert → 旧ペアが返され、新ペアに置換される
  4. 同じ right の再 insert → 同様に置換
  5. remove_by_left → 両方向のマッピングが削除される
  6. remove_by_right → 両方向のマッピングが削除される
  7. 1000件連続 insert / remove / lookup で不変条件が破れないこと
  8. 異なる型パラメータの BiMap が混在しないこと（コンパイル時検証）
* **計装方法・観測対象:** 全操作が O(1) で完了すること。`insert` のオーバーヘッドが `HashMap` 2回分であること。

#### チケット M4-2: ユーティリティ（`PjOwnedStr` の safe ラッパー骨格 / `SecretString` 検証）

* **参照設計書:** docs/rust-sip-client-rfc.md (§27.2, §35)
* **対象不変条件 / 規範:** §27.2「PJSIP は `pj_str_t` を使うため、`CString` の lifetime 問題を避ける wrapper を定義する」。§35「SecretString により password の accidental debug print を防止」。
* **実装の背景と目的:** FFI 層（Phase 8）で使用する `pj_str_t` の safe ラッパーを事前定義する。現段階では FFI バインディングが未生成のため、`pj_str_t` 相当の構造を仮定義するか、型パラメータ化したラッパーを用意する。実際の FFI 統合は M17-2 で行う。
* **実装スコープ:**
  - `src/util/sync.rs`: `PjStrWrapper` — 文字列データの所有権と `pj_str_t` 互換表現を安全に管理するラッパー
  - 現段階では `pj_str_t` のモック型で実装し、M17-2 で実 FFI 型に差し替え
  - `PjStrWrapper::new(s: &str) -> Self`
  - `PjStrWrapper::as_ptr(&self) -> *const i8`
  - `PjStrWrapper::slen(&self) -> isize`
  - `Deref<Target=str>` 実装
  - `util` モジュールの再エクスポート設定（`src/util/mod.rs`）
* **テストコードによる検証:**
  1. `PjStrWrapper::new("hello")` の `Deref` が `"hello"` を返す
  2. `as_ptr()` が有効なポインタを返し、null 終端であること（簡易確認）
  3. `slen()` がバイト長と一致すること（ASCII 文字列）
  4. UTF-8 マルチバイト文字列で `slen()` がバイト長を返すこと（文字数ではない）
  5. 空文字列で panic しないこと
* **計装方法・観測対象:** 文字列データの所有権が `PjStrWrapper` 内で正しく保持されていること（drop 後のポインタアクセスがないこと — miri で検証）。FFI 層との結合は M17-2 で改めて検証するため、現段階では pure Rust の範囲で完結。

### マイルストーン M5: オーディオ純粋処理

> **DB:** メモリ内完結

#### チケット M5-1: `mix_i16_frame` ミキシングアルゴリズム

* **参照設計書:** docs/rust-sip-client-rfc.md (§24.2)
* **対象不変条件 / 規範:** §24.2「内部ミキシングは i32 accumulation でオーバーフローを避け、最後に saturating i16 に落とす」。§24.2 gain and normalization「既定では soft normalization は行わない」。
* **実装の背景と目的:** 複数音声ソースの同期待ち合わせミキシング。i32 中間バッファでオーバーフローを防止し、最終的に i16 飽和で出力する。この関数は純粋（入力→出力）であり、副作用を持たない。
* **実装スコープ:**
  - `src/audio/mixer.rs`: `pub(crate) fn mix_i16_frame(inputs: &[&[i16]], output: &mut [i16])`
  - アルゴリズム: 各サンプル位置で全 input の値を i32 に加算 → `i16::MIN..=i16::MAX` に clamp → i16 として出力
  - `pub(crate) fn mix_i16_frame_with_gains(inputs: &[&[i16]], gains: &[f32], output: &mut [i16])` — gain 適用版
  - `pub(crate) fn apply_gain_to_frame(frame: &mut [i16], gain: f32)` — 単一フレームのゲイン調整
  - 空 input リストの場合、output はゼロフィル
  - 入力長が異なる場合、短い方はゼロパディング扱い
  - 全ての関数は `#![no_std]` 互換（`alloc` のみ）
* **テストコードによる検証:**
  1. 単一 input `[100, 200, 300]` → output `[100, 200, 300]`（gain=1.0）
  2. 2入力 `[100, 200]` + `[50, 100]` → output `[150, 300]`
  3. オーバーフローテスト: `[i16::MAX]` + `[1]` → `[i16::MAX]`（飽和）
  4. アンダーフローテスト: `[i16::MIN]` + `[-1]` → `[i16::MIN]`（飽和）
  5. 空 input リスト → 全ゼロ出力
  6. 入力長不一致: `[100, 200, 300]` + `[50]` → `[150, 200, 300]`（短い方はゼロパディング）
  7. gain=0.5 で `[100, 200]` → `[50, 100]`
  8. gain=0.0 で全ゼロ
  9. gain=2.0 で `[10000]` → `[20000]`
  10. 1000サンプルの10入力を1000回繰り返し → オーバーフロー/アンダーフローなし
* **計装方法・観測対象:** 決定論性: 同一入力で同一出力が得られること。サンプル単位の独立性（前後サンプルの干渉なし）。`mix_i16_frame` の処理時間が O(N×M)（N=サンプル数, M=入力数）であること。

#### チケット M5-2: `interleave_in_out` ステレオマッピング

* **参照設計書:** docs/rust-sip-client-rfc.md (§26.1)
* **対象不変条件 / 規範:** §26.1「既定 stereo 出力では L=IN, R=OUT を保証する」。
* **実装の背景と目的:** モノラルの IN フレームと OUT フレームを、L=IN, R=OUT のステレオインタリーブ配列に変換する。利用者が `ChannelLayout::StereoInOut` で受信した `AudioChunkPair` の内部表現として使用される。
* **実装スコープ:**
  - `src/audio/bridge.rs` または `src/audio/mod.rs`: `pub(crate) fn interleave_in_out(in_mono: &[i16], out_mono: &[i16]) -> Vec<i16>`
  - 両入力の短い方に合わせて切り詰め
  - `pub(crate) fn deinterleave_stereo(stereo: &[i16]) -> (Vec<i16>, Vec<i16>)` — 逆変換（L→IN, R→OUT）
  - `pub(crate) fn interleave_in_out_f32(in_mono: &[f32], out_mono: &[f32]) -> Vec<f32>` — f32版
* **テストコードによる検証:**
  1. `in=[1,2,3]`, `out=[4,5,6]` → `[1,4, 2,5, 3,6]`（L=IN, R=OUT）
  2. `deinterleave_stereo([1,4, 2,5, 3,6])` → `(vec![1,2,3], vec![4,5,6])`
  3. `interleave` → `deinterleave` のラウンドトリップが恒等写像であること
  4. `in.len() > out.len()` → 短い方に切り詰め
  5. `out.len() > in.len()` → 短い方に切り詰め
  6. 空入力 → 空出力
  7. f32版も同様のテスト
* **計装方法・観測対象:** ラウンドトリップの不変性。L=IN, R=OUT のチャネル配置が一貫していること。

#### チケット M5-3: `PairAligner` — IN/OUT ペア整列アルゴリズム

* **参照設計書:** docs/rust-sip-client-rfc.md (§25, §25.1, §45.2)
* **対象不変条件 / 規範:** §25「受信音声は RTP 由来、送信音声は mixer 由来のため時間軸がずれる。内部では timestamped ring buffer を 2 本持ち、共通 frame boundary で最も近いサンプル列を結合する」。§25.1「IN なし/OUT あり、または逆の場合、tolerance 超過後にゼロパディングで pair を生成する」。
* **実装の背景と目的:** RTP 受信とローカルミキサー出力の時間軸ズレを吸収し、同一タイムスタンプの IN/OUT ペアを生成する。AudioWorkerTask（Tokio async context）上で動作するため、Vec 操作やメモリ確保は安全に行える。
* **実装スコープ:**
  - `src/audio/bridge.rs`: `PairAligner` struct（`in_q: VecDeque<TimedFrame<Vec<i16>>>`, `out_q: VecDeque<TimedFrame<Vec<i16>>>`, `tolerance: Duration`）
  - `TimedFrame<T>` struct（`ts_mono: Instant`, `data: T`）
  - `PairAligner::new(tolerance_ms: u64) -> Self`
  - `PairAligner::push_in(&mut self, ts: Instant, frame: Vec<i16>)`
  - `PairAligner::push_out(&mut self, ts: Instant, frame: Vec<i16>)`
  - `PairAligner::try_pair(&mut self) -> Option<(Vec<i16>, Vec<i16>, Instant)>` — §25 アルゴリズム
  - `PairAligner::flush_stale(&mut self) -> usize` — tolerance 超過フレームのドロップ数
  - `PairAligner::pending_count(&self) -> (usize, usize)` — in_q / out_q の滞留数
* **テストコードによる検証:**
  1. 完全一致タイムスタンプのペアが即座に返されること
  2. tolerance 以内の微小ズレ（1ms）でペアが返されること
  3. tolerance 超過のズレで古い方がドロップされること
  4. IN のみ到着、OUT なし → tolerance 経過後ドロップ（`try_pair` は None）
  5. OUT のみ到着、IN なし → 同上
  6. インターリーブ到着（IN, OUT, IN, OUT の交互）で全ペアが正しく返ること
  7. バースト到着（IN 10個→OUT 10個）で全ペアが正しく返ること
  8. 1000ペア連続処理でメモリリークなし（`in_q` / `out_q` の長さが bounded）
  9. `flush_stale` がタイムスタンプ順で古い方から削除すること
  10. `pending_count` が正しい滞留数を返すこと
* **計装方法・観測対象:** 各操作の計算量が O(1) amortized であること（`VecDeque::pop_front` / `push_back`）。tolerance 以内の全ペアが欠損なく返されることの統計的検証（決定論的シナリオで 100%）。

---

## フェーズ3: イベントシステム（Layer 0-1）

> **外部依存:** `tokio::sync::broadcast`。PJSIP不要。全テストは tokio runtime でメモリ内完結。

### マイルストーン M6: イベント型定義

> **DB:** メモリ内完結

#### チケット M6-1: `SipEventPayload` enum 全バリアント + 関連 Info 構造体

* **参照設計書:** docs/rust-sip-client-rfc.md (§15.1)
* **対象不変条件 / 規範:** §15.1「要件で列挙された全イベントを payload enum で完全定義する」。`#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止。
* **実装の背景と目的:** crate の全イベントを単一の enum で表現し、利用者が `match` でイベント種別を判別できるようにする。`#[non_exhaustive]` により、将来バリアントを追加しても利用者の match 式が破壊されない。
* **実装スコープ:**
  - `src/event.rs`: `SipEventPayload` enum（§15.1 の全36バリアント）
  - 全36バリアントの内訳（データありバリアントは Info 構造体を保持、データなしは単体バリアント）:
    - **登録系（6）**: `RegistrationStarted(RegistrationInfo)`, `RegistrationSucceeded(RegistrationInfo)`, `RegistrationFailed(RegistrationFailure)`, `UnregistrationSucceeded`（データなし）, `UnregistrationFailed(RegistrationFailure)`, `RegistrationExpired`（データなし）
    - **発着信系（13）**: `OutgoingCallStarted(OutgoingCallInfo)`, `OutgoingCallTrying(ProvisionalInfo)`, `OutgoingCallRinging(ProvisionalInfo)`, `EarlyMediaReceived(EarlyMediaInfo)`, `CallConnected(ConnectedCallInfo)`, `IncomingCall(IncomingCallInfo)`, `CallDisconnected(DisconnectInfo)`, `CallCancelled(CancelInfo)`, `CallRejected(RejectInfo)`, `CallHeld`（データなし）, `CallResumed`（データなし）, `ReferReceived(ReferRequest)`, `TransferCompleted(TransferInfo)`
    - **メディア系（3）**: `MediaActive(MediaActiveInfo)`, `MediaStopped(MediaStoppedInfo)`, `MediaError(MediaErrorInfo)`
    - **DTMF系（2）**: `DtmfSent(DtmfSentInfo)`, `DtmfReceived(DtmfReceivedInfo)`
    - **ICE系（3）**: `IceNegotiationStarted`（データなし）, `IceNegotiationSucceeded(IceSuccessInfo)`, `IceNegotiationFailed(IceFailureInfo)`
    - **トランスポート系（3）**: `TransportConnected(TransportConnectedInfo)`, `TransportDisconnected(TransportDisconnectedInfo)`, `TransportError(TransportErrorInfo)`
    - **アカウント系（3）**: `AccountAdded(AccountSnapshot)`, `AccountRemoved(AccountSnapshot)`, `AccountConfigChanged(AccountSnapshot)`
    - **クライアントライフサイクル系（2）**: `ClientInitialized(ClientCapabilities)`, `ClientShutdown`（データなし）
    - **エラー系（1）**: `Error(SipError)`
  - データなしバリアント（`UnregistrationSucceeded`, `RegistrationExpired`, `CallHeld`, `CallResumed`, `IceNegotiationStarted`, `ClientShutdown`）はタプル構造体として定義し、将来データ追加に備える（例: `CallHeld(() /* 将来拡張用 */)`）
  - 各 Info 構造体に `Debug`, `Clone` を derive
  - `serde::Serialize` / `Deserialize` は optional feature（`serde`）として提供
  - `SipEventPayload` 自身に `#[non_exhaustive]` を付与
* **テストコードによる検証:**
  1. 全36バリアントが定義されていること（コンパイル時のバリアント数検証）
  2. データありバリアントが対応する Info 構造体を正しく保持できること
  3. データなしバリアント（`CallHeld`, `IceNegotiationStarted` 等）が単体で構築できること
  4. `Clone` が全バリアントで正しく機能すること
  5. `serde` feature 有効時、全バリアントの JSON roundtrip が成功すること
  6. `#[non_exhaustive]` によりクレート外での網羅的 match がコンパイルエラーになること（docテスト）
  7. 各 Info 構造体の全フィールドが§15.1 の定義と一致すること
* **計装方法・観測対象:** `SipEventPayload` のサイズが最大バリアントのサイズ + discriminant であること（`size_of` 確認）。

#### チケット M6-2: `SipEvent` / `EventMeta` / `EventTimestamp` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§15.2, §15.3)
* **対象不変条件 / 規範:** §15.3「要件にある AccountId、タイムスタンプ、関連 SIP メッセージ、ヘッダ、ステータスコード、論理的意味付け情報をすべて共通フィールドで保持する」。
* **実装の背景と目的:** イベントのメタデータ（タイムスタンプ、アカウントID、通話ID、方向、SIP ステータスコード等）を payload と分離し、共通のイベントエンベロープでラップする。`event_id` は単調増加で全イベントを一意識別する。
* **実装スコープ:**
  - `src/event.rs`: `SipEvent` struct（`meta: EventMeta`, `payload: SipEventPayload`）
  - `EventMeta` struct（§15.3 の全フィールド: `event_id: u64`, `timestamp: EventTimestamp`, `account_id: Option<AccountId>`, `call_id: Option<CallId>`, `direction: Option<EventDirection>`, `headers: Option<Vec<(String, String)>>`, `status_code: Option<u16>`, `reason_phrase: Option<String>`, `logical_context: BTreeMap<String, String>`）
  - `EventTimestamp` struct — `SystemTime` の newtype。`serde` feature 時は ISO 8601 文字列にシリアライズ
  - `EventDirection` enum（`Inbound`, `Outbound`）
  - `SipEvent::new(payload: SipEventPayload) -> Self` — `event_id` 自動採番、`timestamp` 自動設定
  - `SipEvent::with_meta(payload, meta_builder) -> Self` — fluent builder パターン
* **テストコードによる検証:**
  1. `SipEvent::new(payload)` がユニークな `event_id` を採番すること
  2. 連続生成した 1000 イベントの `event_id` が単調増加で重複なし
  3. `EventMeta` の全フィールドが正しく設定・取得できること
  4. `logical_context` が `BTreeMap` で順序保証されること
  5. `EventTimestamp` の `serde` シリアライズが ISO 8601 形式であること
  6. `Clone` / `Debug` が `SipEvent` で機能し、payload の内容が正しく表示されること
* **計装方法・観測対象:** `event_id` の単調増加性。`EventTimestamp` が `Copy` であること。

#### チケット M6-3: `RawSipMessage` / `SipMessageDirection` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§16)
* **対象不変条件 / 規範:** §16「`redact_authorization == true` の場合、`Authorization`, `Proxy-Authorization` は `***REDACTED***` に置換して格納する」。
* **実装の背景と目的:** 生 SIP メッセージの構造化表現。デバッグ・監査用途で全 SIP トラフィックを観測可能にする。`redact_authorization` により認証情報の漏洩を防止する。
* **実装スコープ:**
  - `src/event.rs`: `RawSipMessage` struct（§16 の全フィールド: `direction`, `transport`, `start_line`, `headers`, `body`, `text`, `content_length`, `remote_addr`, `local_addr`）
  - `SipMessageDirection` enum（`Sent`, `Received`）
  - `RawSipMessage::with_redaction(self, redact: bool) -> Self` — Authorization header の置換
  - `RawSipMessage::from_raw_parts(...) -> Self` — 生データからの構築（FFI 層用）
* **テストコードによる検証:**
  1. `with_redaction(true)` が `Authorization` ヘッダを `"***REDACTED***"` に置換すること
  2. `with_redaction(true)` が `Proxy-Authorization` ヘッダも置換すること
  3. `with_redaction(false)` がヘッダを変更しないこと
  4. その他のヘッダ（`From`, `To`, `Call-ID` 等）が redaction の影響を受けないこと
  5. `body` が `Option<Vec<u8>>` で任意のバイナリを保持できること
  6. `text` が改行を含む完全な SIP メッセージを保持できること
  7. `content_length` が body の長さと一致すること（FFI 層からの構築経路では一貫性保証）
  8. `Clone` / `Debug` で redact 済みヘッダが露出しないこと
* **計装方法・観測対象:** redaction の網羅性 — `Authorization` / `Proxy-Authorization` のすべての表記揺れ（大文字小文字）に対応すること。

### マイルストーン M7: EventBus 実装

> **DB:** メモリ内完結

#### チケット M7-1: `EventBus` 構造体と基本操作

* **参照設計書:** docs/rust-sip-client-rfc.md (§15.4, §15.6, §15.7)
* **対象不変条件 / 規範:** §15.4「制御系イベントと RawSIP メッセージを別バスで配信する。これにより RawSIP 有効時の制御系イベント取りこぼしを防止する」。§15.6「制御系イベントは control バスで配送される。順序は単一プロデューサ内で preserve される」。§15.7「両バスとも確実配送は保証されない」。
* **実装の背景と目的:** 全イベント配送の中核。`control` バス（制御系イベント）と `raw_sip` バス（RawSIP メッセージ）の2チャネル構成により、大量の RawSIP メッセージが制御系イベントの配送に影響しない。`raw_sip` は `RawSipEventConfig::enabled == false` の場合チャネル自体が作成されず、ゼロオーバーヘッド。
* **実装スコープ:**
  - `src/event.rs`: `EventBus` struct（§15.4 の定義通り: `control: broadcast::Sender<SipEvent>`, `raw_sip: Option<broadcast::Sender<RawSipMessage>>`）
  - `EventBus::new(control_capacity: usize, raw_sip_capacity: Option<usize>) -> Self`
  - `EventBus::subscribe_control(&self) -> broadcast::Receiver<SipEvent>`
  - `EventBus::subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>>`
  - `EventBus::publish(&self, event: SipEvent)` — `control` バスに送信。`send` 失敗時（受信者ゼロ）はエラーをログ出力せずに無視
  - `EventBus::publish_raw_sip(&self, msg: RawSipMessage)` — `raw_sip` が有効な場合のみ送信
  - `Clone` derive（`SipClient` が保持し、reactor や callback bridge と共有するため）
* **テストコードによる検証:**
  1. `subscribe_control()` で受信したイベントが `publish()` の内容と一致すること
  2. 複数購読者が同時に受信できること（broadcast の基本特性）
  3. `raw_sip_capacity = None` → `subscribe_raw_sip()` が `None` を返すこと
  4. `raw_sip_capacity = Some(64)` → `subscribe_raw_sip()` が `Some(receiver)` を返すこと
  5. `publish_raw_sip()` が `raw_sip` 無効時に no-op（パニックしない）こと
  6. 購読者不在時の `publish()` がパニックしないこと（`send` エラーを無視）
  7. `control` と `raw_sip` のイベントが互いに干渉しないこと（別バスであることの確認）
  8. `Lagged(n)` の挙動確認: 購読者が遅延時に `RecvError::Lagged` が返ること
* **計装方法・観測対象:** `publish()` の呼び出しが非ブロッキングであること（`try_send` 的な振る舞い）。`EventBus` の `Clone` コストが `Arc::clone` 相当であること。

#### チケット M7-2: `AccountEventReceiver` — アカウントフィルタリング

* **参照設計書:** docs/rust-sip-client-rfc.md (§15.5)
* **対象不変条件 / 規範:** §15.5「AccountEventReceiver は `account_id` に基づいて制御系イベントをフィルタリングする」。§15.7「イベントバスは観測用途であり確実配送を保証しない。ソースオブ真理は SipClient の query API」。
* **実装の背景と目的:** 利用者が特定アカウントのイベントのみを購読できるようにするフィルタリングラッパー。内部で `broadcast::Receiver` をラップし、`account_id` が一致しないイベントを透過的にスキップする。
* **実装スコープ:**
  - `src/event.rs`: `AccountEventReceiver` struct（`account_id: AccountId`, `inner: broadcast::Receiver<SipEvent>`）
  - `AccountEventReceiver::new(account_id: AccountId, inner: broadcast::Receiver<SipEvent>) -> Self`
  - `AccountEventReceiver::recv(&mut self) -> Result<SipEvent, RecvError>` — `account_id` 一致までループ
  - `AccountEventReceiver::account_id(&self) -> AccountId`
  - `AccountEventReceiver::try_recv(&mut self) -> Result<Option<SipEvent>, TryRecvError>` — 非ブロッキング版
* **テストコードによる検証:**
  1. 一致する `account_id` のイベントが `recv()` で返されること
  2. 一致しない `account_id` のイベントがスキップされること
  3. `account_id = None` のイベント（ClientInitialized 等）がスキップされること
  4. 全イベントを消費した後の `recv()` が待機状態になること（tokio test）
  5. `try_recv()` が空時にエラーではなく `Ok(None)` 的な振る舞い（設計に応じて）
  6. `Lagged` エラーが透過的に伝播されること
  7. 複数の `AccountEventReceiver` が異なる `account_id` で独立して動作すること
* **計装方法・観測対象:** フィルタリングの計算量が O(1)（`event.meta.account_id == Some(self.account_id)` の単純比較）。`Lagged` 発生時に利用者が query API で状態を再取得できることの文書化。

---

## フェーズ4: 状態機械（Layer 1）

> **外部依存:** なし。全テストはメモリ内完結・決定論的。後続 M10（MockBackend）と連携して状態遷移を検証する。

### マイルストーン M8: 状態型定義

> **DB:** メモリ内完結

#### チケット M8-1: `RegistrationState` enum / `ClientState` / `AccountEntry` / `CallEntry` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§17, §33)
* **対象不変条件 / 規範:** §17 登録状態モデル（`Disabled`, `Idle`, `Registering`, `Registered`, `Unregistering`, `Failed`, `Expired`）。§17.1 遷移規則。§33「状態の唯一正本は reactor thread が所有し、公開 query API は snapshot clone を返す」。§33 AccountEntry / CallEntry 定義。
* **実装の背景と目的:** 全アカウント・通話・トランスポートのランタイム状態を表現する型。`ClientState` は reactor thread が排他的に所有し、変更は reactor 内でのみ行われる。公開 API からの読み取りは `RwLock` 経由の snapshot として提供される。
* **実装スコープ:**
  - `src/account.rs`: `RegistrationState` enum（§17 の全8バリアント）
  - `src/client.rs`（または `src/runtime/state.rs`）: `ClientState` struct（§33 定義）
  - `AccountEntry` struct（`id`, `native_id: Option<pjsua_acc_id>`, `config`, `registration: RegistrationState`）— `native_id` は PJSUA 未初期化時 `None`
  - `CallEntry` struct（`id`, `native_id: Option<pjsua_call_id>`, `account_id`, `state: CallState`, `media: Option<MediaRuntime>`）
  - `ClientState::new() -> Self`
  - `ClientState::add_account(&mut self, entry: AccountEntry) -> Result<(), SipError>`
  - `ClientState::remove_account(&mut self, id: AccountId) -> Result<AccountEntry, SipError>`
  - `ClientState::get_account(&self, id: AccountId) -> Result<&AccountEntry, SipError>`
  - `ClientState::get_account_mut(&mut self, id: AccountId) -> Result<&mut AccountEntry, SipError>`
  - `ClientState::add_call(&mut self, entry: CallEntry) -> Result<(), SipError>`
  - `ClientState::remove_call(&mut self, id: CallId) -> Result<CallEntry, SipError>`
  - `ClientState::get_call(&self, id: CallId) -> Result<&CallEntry, SipError>`
  - `ClientState::get_call_mut(&mut self, id: CallId) -> Result<&mut CallEntry, SipError>`
  - `ClientState::call_count(&self) -> usize` — `max_calls` 制限チェック用
* **テストコードによる検証:**
  1. `ClientState::new()` が空の状態を返すこと（`accounts.is_empty()`, `calls.is_empty()`）
  2. `add_account` → `get_account` が正しいエントリを返す
  3. 重複 `add_account` が `Err` を返すこと
  4. `remove_account` 後 `get_account` が `AccountNotFound` を返す
  5. `add_call` 時 `call_count` が増加すること
  6. `remove_call` 後 `get_call` が `CallNotFound` を返す
  7. 1000アカウント・1000通話の同時登録でパフォーマンス劣化なし（`BTreeMap` の O(log n) 特性）
  8. `RegistrationState` の全バリアントの `Display` が期待通りであること
* **計装方法・観測対象:** `BTreeMap` のキー順序が `AccountId` / `CallId` の `Ord` に従うこと。

#### チケット M8-2: `CallState` enum / `MediaRuntime` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§18, §18.1)
* **対象不変条件 / 規範:** §18 通話状態モデル（`New`, `Calling`, `Trying`, `Ringing`, `EarlyMedia`, `Incoming`, `Connecting`, `Active`, `Held`, `Transferring`, `Disconnecting`, `Disconnected`, `Failed`）。§18.1 遷移規則。
* **実装の背景と目的:** 通話の全ライフサイクル状態を表現する型。状態遷移の正当性は reactor 内で検証され、不正な遷移（例: `Active → Calling`）は `InvalidState` エラーとして拒否される。
* **実装スコープ:**
  - `src/call.rs`: `CallState` enum（§18 の全13バリアント + `#[non_exhaustive]`）
  - `CallState::is_terminal(&self) -> bool` — `Disconnected | Failed` で true
  - `CallState::is_active_media(&self) -> bool` — `Active | Held` で true（media session が確立済み）
  - `CallState::can_transition_to(&self, next: CallState) -> bool` — 遷移可否判定（M9-2 で実装）
  - `MediaRuntime` struct（`mixer: Option<AudioMixer>`, `bridge: Option<AudioBridge>`, `tap_handles: Vec<...>`）— M14-M16 で具体化
* **テストコードによる検証:**
  1. `is_terminal()` が `Disconnected` / `Failed` のみで true を返す
  2. `is_active_media()` が `Active` / `Held` で true を返す
  3. `#[non_exhaustive]` により外部での網羅的 match がコンパイルエラーになること
  4. 全13バリアントの `Debug` / `Clone` / `Copy` / `PartialEq` / `Eq` が正しく機能すること
* **計装方法・観測対象:** `CallState` の discriminant サイズ（`u8` に収まることの確認）。状態遷移検証の決定論性。

#### チケット M8-3: `ClientCapabilities` / `SrtpImplementation` / `AudioDeviceCaps` 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§34.3)
* **対象不変条件 / 規範:** §34.3「ClientCapabilities は初期化完了時に ClientInitialized イベントに載せて通知される。PJSIP のビルド時 feature とランタイム検出結果を反映し、利用者が実行可能な機能を判断するために用いる」。
* **実装の背景と目的:** PJSUA 初期化後に確定する実行時能力を利用者に通知する。利用者はこの情報に基づき、利用不可の機能（例: TLS 未サポート、Opus 未ビルド）を呼び出さないよう調整できる。
* **実装スコープ:**
  - `src/event.rs`（または `src/client.rs`）: `ClientCapabilities` struct（§34.3 の全フィールド）
  - `SrtpImplementation` enum（`SdesSrtp`, `DtlsSrtp`）
  - `AudioDeviceCaps` struct（`has_default_input`, `has_default_output`, `input_devices`, `output_devices`）
  - `TransportKind` enum（`Udp`, `Tcp`, `Tls`）— M1-3 ですでに定義済み
  - `ClientCapabilities::default_disabled() -> Self` — 全機能無効の最低限 capabilities
* **テストコードによる検証:**
  1. `ClientCapabilities::default_disabled()` の全 boolean が false、全 Vec が空
  2. 全フィールドの型が§34.3 の定義と一致すること
  3. `Clone` / `Debug` が正しく機能すること
  4. `SrtpImplementation` の全バリアントが定義されていること
  5. `AudioDeviceCaps` が空のデバイスリストを許容すること
* **計装方法・観測対象:** `ClientCapabilities` のサイズが過大でないこと（フィールド数約20、大半が小サイズ）。

### マイルストーン M9: 状態機械ロジック

> **DB:** メモリ内完結。MockBackend（M10-2）を使用して全遷移を決定論的に検証する。

#### チケット M9-1: `RegistrationState` 遷移ロジック

* **参照設計書:** docs/rust-sip-client-rfc.md (§17, §17.1)
* **対象不変条件 / 規範:** §17.1 遷移規則（全8遷移パス）。「未登録でも make_call() は常に可能であるため、RegistrationState は発信可否に影響しない」。
* **実装の背景と目的:** アカウント登録状態の正当な遷移を保証する。不正な遷移（例: `Disabled → Idle`）は `SipError::InvalidState` として拒否される。状態機械は reactor 内で駆動され、PJSIP callback からのイベント（登録成功/失敗/期限切れ）と利用者の操作（register/unregister/set_enabled）に応じて遷移する。
* **実装スコープ:**
  - `src/account.rs`: `RegistrationState::can_transition_to(&self, next: RegistrationState) -> bool`
  - `RegistrationState::apply_event(&mut self, event: RegistrationEvent) -> Result<(), SipError>`
  - `RegistrationEvent` enum（`Register`, `Unregister`, `SetEnabled(bool)`, `Success`, `Failure(SipError)`, `Expired`）
  - `RegistrationState::is_registered(&self) -> bool` — `Registered` のみ true
  - `RegistrationState::is_in_progress(&self) -> bool` — `Registering | Unregistering` で true
  - `RegistrationState::is_terminal_error(&self) -> bool` — `Failed` のみ true
* **テストコードによる検証（MockBackend 使用）:**
  1. 正常系: `Disabled → Registering → Registered → Unregistering → Idle` の全遷移
  2. 正常系: `Idle → Registering → Registered` の明示的 register
  3. 再試行系: `Registering → Failed → Registering → Registered` の失敗後再試行
  4. 期限切れ系: `Registered → Expired → Registering → Registered` の自動再登録
  5. `Registered` 状態で `register()` → `Ok(())`（再登録は no-op として許可。PJSIP の treat と整合）
  6. `Disabled` 状態で `unregister()` → `InvalidState`（§17.1 に Disabled→Unregistering 遷移なし）
  7. `Failed` 状態で `unregister()` → `InvalidState`（Failed は未登録状態として扱う）
  8. `set_registration_enabled(false)` が `Registering → Disabled` 的なキャンセルを引き起こすこと
  9. `make_call()` が全 RegistrationState で呼び出し可能であること（発信可否に影響しない不変条件）
* **計装方法・観測対象:** 全状態×全イベントの組み合わせ（8状態×6イベント=48通り）の遷移結果をテーブルテスト。不正遷移でのエラーメッセージに現在状態と要求イベントが含まれること。

#### チケット M9-2: `CallState` 遷移ロジック

* **参照設計書:** docs/rust-sip-client-rfc.md (§18, §18.1)
* **対象不変条件 / 規範:** §18.1 遷移規則（発信パス、着信パス、Hold/Unhold/Transfer、切断パス）。「max_calls を上限とする」。
* **実装の背景と目的:** 通話状態の正当な遷移を保証。発信・着信の両経路、Hold/Unhold/Transfer、BYE/CANCEL による切断までの全パスを状態機械で表現する。
* **実装スコープ:**
  - `src/call.rs`: `CallState::can_transition_to(&self, next: CallState) -> bool`
  - `CallState::apply_call_event(&mut self, event: CallEvent) -> Result<(), SipError>`
  - `CallEvent` enum（発信系: `Dialed`, `Trying(100)`, `Ringing(180)`, `EarlyMedia(183)`, `Connected(200)`。着信系: `Incoming`, `Answered(200)`。制御系: `Hold`, `Unhold`, `ReferSent`, `ReferSuccess`, `ReferFailed`。切断系: `Bye`, `Cancel`, `Failure(u16, String)`, `LocalHangup`, `Timeout`）
  - `CallState::direction(&self) -> Option<EventDirection>` — 発信なら `Outbound`, 着信なら `Inbound`
* **テストコードによる検証（MockBackend 使用）:**
  1. 発信正常系: `New → Calling → Trying → Ringing → Connecting → Active → Disconnecting → Disconnected`
  2. 発信 EarlyMedia 経由: `New → Calling → Trying → EarlyMedia → Connecting → Active`
  3. 着信正常系: `New → Incoming → Connecting → Active → Disconnecting → Disconnected`
  4. Hold/Unhold: `Active → Held → Active`
  5. Transfer: `Active → Transferring → Active`（NOTIFY success）
  6. Transfer 失敗: `Active → Transferring → Disconnecting`（NOTIFY fail）
  7. 異常系（発信拒否）: `Ringing → Failed(486)` / `Ringing → Failed(603)`
  8. 異常系（タイムアウト）: `Calling → Failed(Timeout)`
  9. Cancel: `Calling → Disconnecting → Disconnected`
  10. 切断後の操作（`Active → Disconnected` 後の `hold()`）→ `InvalidState`
  11. `max_calls` 超過時の発信 → `InvalidState`
  12. 全状態×全イベントの遷移テーブルテスト（13状態×12イベント=156通り）
* **計装方法・観測対象:** 全遷移の決定論性。不正遷移時のエラーメッセージに現在状態と要求イベントが含まれること。

#### チケット M9-3: `ClientState` 管理 — 同時通話制約・shutdown 状態

* **参照設計書:** docs/rust-sip-client-rfc.md (§18.2, §33)
* **対象不変条件 / 規範:** §18.2「ClientConfig::max_calls を上限とする。アカウントごとの上限は未設定なら無制限だが、client 上限だけは強制する」。§33「状態の唯一正本は reactor thread が所有」。
* **実装の背景と目的:** 全アカウント・通話の整合性を保証する。`max_calls` 上限の強制、shutdown 中の新規操作拒否（`InvalidState` → 実際は `ShutdownInProgress` だが設計上は `InvalidState` で統一するか要判断）、重複アカウント追加の防止。
* **実装スコープ:**
  - `src/runtime/state.rs`（または `src/client.rs` に同居）: `ClientState` の拡張
  - `ClientState::can_add_call(&self) -> bool` — `call_count() < max_calls`
  - `ClientState::set_shutting_down(&mut self)` — 新規操作の受付停止
  - `ClientState::is_shutting_down(&self) -> bool`
  - `ClientState::get_account_by_native_id(&self, native_id: pjsua_acc_id) -> Option<&AccountEntry>` — FFI callback からの逆引き
  - `ClientState::get_call_by_native_id(&self, native_id: pjsua_call_id) -> Option<&CallEntry>`
* **テストコードによる検証:**
  1. `max_calls = 3` → 3通話目まで `can_add_call() == true`、4通話目で `false`
  2. `max_calls = 0` → 常に `can_add_call() == false`
  3. `set_shutting_down()` 後 `is_shutting_down() == true`
  4. shutdown 中の `add_call` が `ShutdownInProgress` エラーを返すこと
  5. `get_account_by_native_id` が正しいエントリを返すこと
  6. 存在しない native_id に対する逆引きが `None` を返すこと
* **計装方法・観測対象:** `max_calls` 制約の境界値テスト。shutdown 状態の一貫性 — shutdown フラグ設定後の全操作拒否。

---

## フェーズ5: ランタイム基盤（Layer 2）

> **外部依存:** `tokio`（MPSC, oneshot, watch, RwLock）。PJSIP不要。全テストは `MockBackend` を使用して tokio runtime 上でメモリ内完結。

### マイルストーン M10: SipBackend trait・MockBackend

> **DB:** メモリ内完結

#### チケット M10-1: `SipBackend` trait 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§27a)
* **対象不変条件 / 規範:** §27a「Runtime はこの trait を通じてのみ PJSUA を操作し、直接的な FFI 依存を runtime 層に漏らさない」。`pub(crate)` であり外部に公開されない。
* **実装の背景と目的:** PJSUA への全 FFI 呼び出しを抽象化する内部 trait。テスト時は `MockBackend`（M10-2）に差し替え、PJSIP の初期化なしに Reactor と状態機械の全検証を可能にする。将来のバックエンド差し替え（独自 SIP stack 等）の影響範囲をこの trait の実装のみに限定する。
* **実装スコープ:**
  - `src/runtime/backend.rs`: `pub(crate) trait SipBackend: Send`（§27a の全メソッド）:
    - `initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError>`
    - `shutdown(&mut self) -> Result<(), SipError>`
    - `create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError>`
    - `add_account(&mut self, config: &AccountConfig) -> Result<(pjsua_acc_id, ClientCapabilities), SipError>`
    - `remove_account(&mut self, native_acc_id: pjsua_acc_id) -> Result<(), SipError>`
    - `set_registration(&mut self, native_acc_id: pjsua_acc_id, enabled: bool) -> Result<(), SipError>`
    - `make_call(&mut self, native_acc_id: pjsua_acc_id, request: &OutgoingCallRequest) -> Result<pjsua_call_id, SipError>`
    - `answer_call(&mut self, native_call_id: pjsua_call_id, code: u16) -> Result<(), SipError>`
    - `hangup(&mut self, native_call_id: pjsua_call_id) -> Result<(), SipError>`
    - `conf_connect/disconnect(&mut self, source: pjsua_conf_port_id, sink: pjsua_conf_port_id) -> Result<(), SipError>`
    - `configure_codecs(&mut self) -> Result<(), SipError>`
    - `send_dtmf(&mut self, native_call_id: pjsua_call_id, method: &DtmfMethod, digits: &str) -> Result<(), SipError>`
    - `transfer_call(&mut self, native_call_id: pjsua_call_id, target: &str) -> Result<(), SipError>`
  - ネイティブID型のエイリアス（`pjsua_acc_id = i32`, `pjsua_call_id = i32`, `pjsua_conf_port_id = i32`）
* **テストコードによる検証:**
  1. trait が object-safe であること（コンパイル時検証）
  2. `Send` が充足されること（コンパイル時検証）
  3. 全メソッドシグネチャが§27a と一致すること
* **計装方法・観測対象:** trait のメソッド数が§27a の定義と一致すること（コンパイル時の const assert）。将来のバックエンド追加に備えたドキュメントコメントの完備。

#### チケット M10-2: `MockBackend` 実装

* **参照設計書:** docs/rust-sip-client-rfc.md (§27a, §43.2)
* **対象不変条件 / 規範:** §43.2「MockBackend を注入した Runtime を使用し、PJSIP の初期化なしに状態機械の全遷移を検証する」。§27a「内部テスト用として定義するに留める」。
* **実装の背景と目的:** テスト専用の `SipBackend` 実装。PJSUA の代わりにメモリ内で動作し、全操作の成功/失敗をテストシナリオに応じて制御できる。これにより、実際の SIP サーバなしに状態機械・Reactor・エラー処理の網羅的テストが可能になる。
* **実装スコープ:**
  - `src/runtime/backend.rs`（`#[cfg(test)]`）: `MockBackend` struct
  - 内部状態: `accounts: HashMap<pjsua_acc_id, AccountConfig>`, `calls: HashMap<pjsua_call_id, MockCall>`, `next_acc_id: pjsua_acc_id`, `next_call_id: pjsua_call_id`, `initialized: bool`
  - `MockBackend::new() -> Self`
  - `MockBackend::set_initialize_result(&mut self, result: Result<ClientCapabilities, SipError>)` — 初期化の成否を注入
  - `MockBackend::set_add_account_result(&mut self, result: Result<pjsua_acc_id, SipError>)` — アカウント追加の成否を注入
  - `MockBackend::set_make_call_result(&mut self, result: Result<pjsua_call_id, SipError>)` — 発信の成否を注入
  - 全 `SipBackend` メソッドの実装（デフォルトは成功。注入された結果があればそれを返す）
  - `MockBackend::reset(&mut self)` — 全状態・注入結果をクリア
* **テストコードによる検証:**
  1. 全 `SipBackend` メソッドのデフォルト成功動作
  2. 注入した失敗結果が正しく返されること
  3. `initialize` 未呼び出しでの他操作 → `NotInitialized` エラー
  4. 重複 `initialize` → `AlreadyInitialized` エラー
  5. `shutdown` 後の操作 → `ShutdownInProgress` エラー
  6. `reset()` で全状態がクリアされること
  7. 1000回の連続操作で内部カウンタ（`next_acc_id`, `next_call_id`）がオーバーフローしないこと
* **計装方法・観測対象:** `MockBackend` の全操作が O(1) で完了すること。注入されたエラーが正確に伝播すること。

### マイルストーン M11: コマンド直列化・Reactor

> **DB:** メモリ内完結

#### チケット M11-1: `RuntimeCommand` enum 定義

* **参照設計書:** docs/rust-sip-client-rfc.md (§7.2, §19, §22, §24.4)
* **対象不変条件 / 規範:** §7.2 command serialization「公開 API は RuntimeCommand を unbounded MPSC で reactor へ送る。reactor は単一スレッドで順序実行し、結果を oneshot で返す」。§19 発着信API（Answer/Transfer）、§22 音声購読API（SubscribeAudio）、§24.4 音声ソース管理API（AddAudioSource/RemoveAudioSource/SetSourceGain/MuteSource）。RFC §7.2 の11バリアントに不足する6バリアントをこれらのセクションから補完している。
* **実装の背景と目的:** 全公開 API 呼び出しを reactor スレッド上にシリアライズするためのコマンド型。各バリアントは `oneshot::Sender` を持ち、reactor が処理完了後に結果を返送する。これにより PJSUA のスレッド安全制約を利用者に露出させずに `Send + Sync` を成立させる。
* **実装スコープ:**
  - `src/runtime/command.rs`: `pub(crate) enum RuntimeCommand`（§7.2 の11バリアント + 音声・発着信系6バリアントの全17バリアント）
    - `Initialize { config, reply }`
    - `AddAccount { config, reply }`
    - `RemoveAccount { account_id, reply }`
    - `SetRegistration { account_id, enabled, reply }`
    - `MakeCall { account_id, request, reply }`
    - `Hangup { call_id, reason, reply }`
    - `Hold { call_id, reply }`
    - `Unhold { call_id, reply }`
    - `SendDtmf { call_id, digits, method, reply }`
    - `Answer { call_id, code, reply }`
    - `Transfer { call_id, target, reply }`
    - `AddAudioSource { call_id, source, reply }`
    - `RemoveAudioSource { call_id, source_id, reply }`
    - `SetSourceGain { call_id, source_id, gain, reply }`
    - `MuteSource { call_id, source_id, muted, reply }`
    - `SubscribeAudio { call_id, format, capacity, mode, reply }`
    - `Shutdown { reply }`
  - 各 reply の型: `tokio::sync::oneshot::Sender<Result<T, SipError>>`
  - `HangupReason` enum（`Bye`, `Cancel`, `Busy`, `Decline`, `InternalError`）
* **テストコードによる検証:**
  1. 全バリアントが定義されていること（コンパイル時バリアント数検証）
  2. 各バリアントが `Send` を満たすこと（コンパイル時検証）
  3. `oneshot::Sender` が正しい型パラメータで定義されていること（各 reply の型整合性）
  4. `HangupReason` の全バリアントが定義されていること
* **計装方法・観測対象:** `RuntimeCommand` のサイズが最大バリアントのサイズ + discriminant であること。

#### チケット M11-2: `RuntimeHandle` — MPSC + oneshot 送受信

* **参照設計書:** docs/rust-sip-client-rfc.md (§7.2)
* **対象不変条件 / 規範:** §7.2「公開 API は RuntimeCommand を unbounded MPSC で reactor へ送る」。
* **実装の背景と目的:** `SipClient` が reactor と通信するためのハンドル。`tokio::sync::mpsc::unbounded_channel` でコマンドを送信し、`oneshot` で結果を待ち受ける。`Clone` 可能で、`SipAccountHandle` を含む全ハンドルから共有される。
* **実装スコープ:**
  - `src/runtime/handle.rs`: `pub(crate) struct RuntimeHandle`（`tx: mpsc::UnboundedSender<RuntimeCommand>`）
  - `RuntimeHandle::new() -> (Self, mpsc::UnboundedReceiver<RuntimeCommand>)`
  - `RuntimeHandle::send(&self, cmd: RuntimeCommand) -> Result<(), SipError>` — チャネル送信
  - `RuntimeHandle::send_and_wait<T>(&self, f: impl FnOnce(oneshot::Sender<Result<T, SipError>>) -> RuntimeCommand) -> Result<T, SipError>` — 汎用 send + await ヘルパー
  - `RuntimeHandle::is_closed(&self) -> bool` — reactor 終了検知
  - `Clone` derive
* **テストコードによる検証:**
  1. `send` → reactor 側の `recv` が同一コマンドを受信すること
  2. `send_and_wait` → oneshot reply が正しくラウンドトリップすること
  3. `Clone` したハンドルからも送信可能であること
  4. reactor 側の receiver drop 後、`is_closed() == true`
  5. 1000コマンド連続送信で channel の unbounded 特性が保たれること
  6. cancel safety: `send_and_wait` の `.await` 中に caller task が cancel されても reactor 側の処理は継続すること（§32.1）
* **計装方法・観測対象:** `send` が非ブロッキングであること（unbounded channel の特性）。`oneshot` のメモリ確保が1コマンドあたり1回であること。

#### チケット M11-3: Reactor loop — 単一スレッドでのコマンド処理

* **参照設計書:** docs/rust-sip-client-rfc.md (§7.1)
* **対象不変条件 / 規範:** §7.1 実行コンテキスト「Core reactor は std::thread::JoinHandle<()> 上で動作する専用スレッド。すべての PJSUA 制御 API をここで実行」。§46 panic policy「公開 API は panic-free を目標とする」。
* **実装の背景と目的:** 全 PJSUA 操作を単一スレッド上で逐次実行する reactor。`RuntimeCommand` を MPSC から受信し、`SipBackend` trait を通じてバックエンド操作を実行、結果を oneshot で返す。panic 発生時は `catch_unwind` で捕捉し、該当エンティティを安全停止する。
* **実装スコープ:**
  - `src/runtime/reactor.rs`: `pub(crate) struct CoreReactor`
  - `CoreReactor::spawn(backend: Box<dyn SipBackend>, events: EventBus, state: Arc<RwLock<ClientState>>, shutdown_rx: watch::Receiver<bool>) -> (RuntimeHandle, JoinHandle<()>)`
  - `CoreReactor::run_loop(&mut self, rx: mpsc::UnboundedReceiver<RuntimeCommand>)` — メインループ
  - 各 `RuntimeCommand` バリアントの処理:
    - `Initialize` → backend.initialize() → state 更新 → ClientInitialized イベント emit
    - `AddAccount` → config validate → backend.add_account() → BiMap 登録 → state 更新 → AccountAdded イベント emit
    - `RemoveAccount` → backend.remove_account() → BiMap 削除 → state 更新 → AccountRemoved イベント emit
    - `MakeCall` → max_calls チェック → backend.make_call() → state 更新 → OutgoingCallStarted イベント emit
    - その他コマンドも同様のパターン
  - `catch_unwind` による panic 保護（§46.1 のクリーンアップ手順）
  - `shutdown` コマンド受信時の idempotent シャットダウンシーケンス（§32）
* **テストコードによる検証（MockBackend 使用）:**
  1. `Initialize` → `ClientInitialized` イベントが発火すること
  2. `AddAccount` → `AccountAdded` イベントが発火し、`AccountId` が返ること
  3. 存在しない `AccountId` への操作 → `AccountNotFound` エラー
  4. `MakeCall`（max_calls 超過）→ `InvalidState` エラー
  5. `Shutdown` → 全後続コマンドが `ShutdownInProgress` エラー
  6. `Shutdown` の idempotent 性（2回目も `Ok(())`）
  7. `MakeCall` 処理中の panic（MockBackend に注入）→ `InternalInvariantBroken` エラーが emit されること
  8. 10並列 `send_and_wait` が正しく逐次実行されること（順序保証）
* **計装方法・観測対象:** reactor スレッドの起動・停止時間。コマンド処理レイテンシ（oneshot 送信から受信までの時間）。panic 発生回数（MockBackend 注入テストでのみ）。

---

## フェーズ6: SipClient 公開API（Layer 2-3）

> **外部依存:** `tokio`。PJSIP不要（テストは MockBackend 使用）。全テストは tokio runtime 上でメモリ内完結。

### マイルストーン M12: SipClient

> **DB:** メモリ内完結

#### チケット M12-1: `SipClient` 構造体（Arc + ClientInner）

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.2)
* **対象不変条件 / 規範:** §8.2「SipClient は参照カウント化された薄いハンドルであり、内部に reactor handle、イベントバス、アカウント/通話インデックス、shutdown state を持つ」。§5「SipClient: Send + Sync の成立」。
* **実装の背景と目的:** crate の公開APIのルートとなる型。`Arc` で内部状態を共有し、`Clone` 可能なハンドルとして振る舞う。内部状態へのアクセスは `RwLock` で保護され、状態変更は reactor 経由でのみ行われる。
* **実装スコープ:**
  - `src/client.rs`: `SipClient` struct（`inner: Arc<ClientInner>`）
  - `ClientInner` struct（`runtime: RuntimeHandle`, `events: EventBus`, `state: RwLock<ClientState>`, `shutdown: watch::Sender<bool>`）
  - `SipClient` に `Clone` を derive（`Arc::clone` に委譲）
  - `SipClient` が `Send + Sync` を満たすこと（コンパイル時検証）
  - `SipClient` は `Debug` を手動実装（内部状態の一部のみ表示）
* **テストコードによる検証:**
  1. `Clone` が内部状態を共有すること（一方の clone での操作が他方に反映される）
  2. `Send + Sync` がコンパイル時に検証されること（`static_assertions::assert_impl_all!(SipClient: Send, Sync)`）
  3. `Debug` 出力に機密情報（パスワード等）が含まれないこと
  4. 100 clone の生成が `Arc::clone` のコストのみであること
* **計装方法・観測対象:** `SipClient` のサイズが `Arc` 1個分（8バイト）であること。

#### チケット M12-2: `SipClient::new()` — 初期化・バリデーション・Reactor起動

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.3, §41.1)
* **対象不変条件 / 規範:** §8.3「SipClient::new(config: ClientConfig) -> Result<Self, SipError>」。§42 fail-fast validation。§34.3 ClientCapabilities を ClientInitialized イベントで通知。
* **実装の背景と目的:** crate のライフサイクル起点。config バリデーション → EventBus 生成 → Reactor スレッド起動 → PJSUA 初期化（SipBackend 経由）→ ClientCapabilities 确定 → ClientInitialized イベント発行、の一連の初期化シーケンスを実行する。
* **実装スコープ:**
  - `SipClient::new(config: ClientConfig) -> Result<Self, SipError>`:
    1. `validate_client_config(&config)?`
    2. `EventBus::new(config.event_bus_capacity, raw_sip_capacity)`
    3. `ClientState::new()`
    4. `CoreReactor::spawn(backend, events.clone(), state.clone(), shutdown_rx)`
    5. reactor に `Initialize` コマンドを送信
    6. `ClientInitialized` イベントを待つ（またはタイムアウト）
    7. `SipClient { inner: Arc::new(ClientInner { ... }) }` を返す
  - 初期化タイムアウト（`TimeoutConfig::command_timeout`）時は `SipError::Timeout`
  - `tracing::instrument` でスパンを設定
* **テストコードによる検証（MockBackend 使用）:**
  1. 正常初期化 → `SipClient` が返り、`ClientInitialized` イベントが購読可能であること
  2. 不正 config（event_bus_capacity < 16）→ `InvalidConfig` エラー
  3. MockBackend の `initialize` 失敗 → エラーが伝播すること
  4. 初期化タイムアウト → `Timeout` エラー
  5. 二重初期化 → `AlreadyInitialized` エラー（2回目の `new()` 呼び出し時。または単一 SipClient で `new()` は1回のみのため、2回目の `new()` は独立した別インスタンスになるが、PJSUA のプロセス単位制約による制限あり — MVP では単一インスタンスを推奨）
* **計装方法・観測対象:** 初期化シーケンスの各ステップのトレーシングスパン。初期化失敗時のエラーメッセージに失敗ステップが明示されること。

#### チケット M12-3: `subscribe()` / `subscribe_raw_sip()` / `subscribe_account()`

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.3, §15.4, §15.5)
* **対象不変条件 / 規範:** §8.3「subscribe() は制御系イベントの broadcast receiver を購読する。subscribe_raw_sip() は RawSIP メッセージ専用の receiver を購読し、無効時は None」。§15.5 AccountEventReceiver。
* **実装の背景と目的:** 利用者がイベントを購読するための3つの入口を提供する。`subscribe()` は全制御系イベント、`subscribe_raw_sip()` は RawSIP メッセージ、`subscribe_account()` は特定アカウントのイベントのみを受信する。
* **実装スコープ:**
  - `SipClient::subscribe(&self) -> broadcast::Receiver<SipEvent>` — `self.inner.events.subscribe_control()` に委譲
  - `SipClient::subscribe_raw_sip(&self) -> Option<broadcast::Receiver<RawSipMessage>>` — `self.inner.events.subscribe_raw_sip()` に委譲
  - `SipClient::subscribe_account(&self, account_id: AccountId) -> AccountEventReceiver` — `AccountEventReceiver::new(account_id, self.subscribe())`
* **テストコードによる検証（MockBackend 使用）:**
  1. `subscribe()` で受信したイベントが `EventBus::publish()` の内容と一致すること
  2. `subscribe_raw_sip()` が `raw_sip_events.enabled = true` で `Some`、`false` で `None`
  3. `subscribe_account()` が正しい `account_id` のイベントのみを返すこと
  4. 複数 `subscribe()` 呼び出しが独立した receiver を返すこと
* **計装方法・観測対象:** 全 subscribe メソッドが非同期呼び出し不要（同期的）であること。

#### チケット M12-4: `add_account()` / `remove_account()` / `account()` / `accounts()`

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.3, §8.4)
* **対象不変条件 / 規範:** §8.3 SipClient API。§8.4 SipAccountHandle API。§11.1 validation rules。
* **実装の背景と目的:** アカウントライフサイクル管理の公開API。`add_account()` は config バリデーション → reactor 経由で PJSUA アカウント作成 → `AccountId` 発行 → `SipAccountHandle` 返却。`remove_account()` は PJSUA アカウント削除と状態クリーンアップを行う。
* **実装スコープ:**
  - `SipClient::add_account(&self, config: AccountConfig) -> Result<SipAccountHandle, SipError>` — バリデーション → RuntimeCommand 送信 → reply 待ち
  - `SipClient::remove_account(&self, account_id: AccountId) -> Result<(), SipError>` — reactor 経由で削除
  - `SipClient::account(&self, account_id: AccountId) -> Result<SipAccountHandle, SipError>` — 存在確認 → Handle 返却
  - `SipClient::accounts(&self) -> Vec<SipAccountHandle>` — 全アカウントのスナップショット
* **テストコードによる検証（MockBackend 使用）:**
  1. `add_account(valid_config)` → `Ok(SipAccountHandle)`
  2. `add_account(invalid_config)` → `Err(InvalidConfig)`
  3. `add_account` → `accounts()` に追加されたアカウントが含まれること
  4. `remove_account` → `accounts()` から削除されること
  5. 存在しない `account_id` の `remove_account` → `AccountNotFound`
  6. 10アカウント同時追加 → 全アカウントが独立していること
  7. `account()` が存在するIDで `Ok`、存在しないIDで `Err` を返すこと
* **計装方法・観測対象:** `add_account` の処理時間が PJSUA 呼び出し + 1 RTT（oneshot）であること。

#### チケット M12-5: `SipClient::shutdown()` — idempotent・cancel safety

* **参照設計書:** docs/rust-sip-client-rfc.md (§32, §32.1)
* **対象不変条件 / 規範:** §32「shutdown() は idempotent である。進行中 command をこれ以上受け付けず、全 call を BYE/CANCEL、全 account を unregister、audio pipeline を drain し、最後に pjsua_destroy を実行」。§32.1 cancellation safety。
* **実装の背景と目的:** 安全なクリーンアップシーケンス。`shutdown` フラグを `SeqCst` で設定し、後続の全操作を拒否する。進行中の操作は完了を待ち、全リソースを解放してから PJSUA を破棄する。2回目以降の呼び出しは `Ok(())` を即座に返す（idempotent）。
* **実装スコープ:**
  - `SipClient::shutdown(&self) -> Result<(), SipError>`:
    1. `shutdown` watch チャネルに `true` を送信
    2. reactor に `Shutdown` コマンドを送信
    3. reactor が全 call hangup、全 account unregister、audio pipeline drain、backend.shutdown() を実行
    4. reactor スレッドの join を待つ（`shutdown_timeout` でタイムアウト）
  - `SipClient::is_shutdown(&self) -> bool` — shutdown 状態の確認
* **テストコードによる検証（MockBackend 使用）:**
  1. `shutdown()` → `Ok(())`
  2. 2回目の `shutdown()` → `Ok(())`（idempotent）
  3. shutdown 後の `add_account()` → `ShutdownInProgress` エラー
  4. shutdown 後の `make_call()` → `ShutdownInProgress` エラー
  5. cancel safety: `shutdown()` の `.await` 中に caller task が cancel されても、reactor 側の shutdown 処理が継続すること（`drop(tokio::spawn(...))` で検証）
  6. `shutdown_timeout` 超過時 → `Timeout` エラー
* **計装方法・観測対象:** shutdown シーケンスの各ステップのトレーシングスパン。`watch::Sender::send(true)` が1回のみ呼ばれること（idempotent の実装確認）。

#### チケット M12-6: 全公開API・PJSIP callback への `#[tracing::instrument]` 計装

* **参照設計書:** docs/rust-sip-client-rfc.md (§34.1)
* **対象不変条件 / 規範:** §34.1「全 public operation と native callback を tracing span で囲む」。例: `#[tracing::instrument(skip(self, request), fields(account_id = %self.id()))]`。
* **実装の背景と目的:** トレーシングは観測性の要。全公開 API メソッドに `#[tracing::instrument]` を付与し、`account_id`, `call_id`, `SipErrorKind` 等のコンテキストフィールドを構造化ログとして出力する。これにより運用時のデバッグ・パフォーマンス分析を可能にする。
* **実装スコープ:**
  - `SipClient` の全公開 async メソッド（`new`, `add_account`, `remove_account`, `account`, `accounts`, `subscribe`, `subscribe_raw_sip`, `subscribe_account`, `subscribe_audio`, `add_audio_source`, `remove_audio_source`, `set_audio_source_gain`, `mute_audio_source`, `shutdown`）
  - `SipAccountHandle` の全公開メソッド（`register`, `unregister`, `set_registration_enabled`, `registration_state`, `make_call`, `update_config`）
  - `SipClient` の通話操作メソッド（`answer`, `hangup`, `hold`, `unhold`, `transfer`, `send_dtmf`, `call_state`）
  - `AudioTapHandle::recv` — `trace` レベルで spam 抑制
  - 全 PJSIP extern "C" callback — `tracing::trace!` で各呼び出しを記録（debug ビルドのみ活性化）
  - 計装時のルール:
    - `account_id`/`call_id` は `Display` で %（構造化フィールド）
    - 音声データ（`AudioChunk` の実データ）は span に含めない
    - `SecretString` は `skip` に含める（ログ出力禁止）
    - `SipError` が返る場合、エラーの `kind` と `message` を記録
* **テストコードによる検証:**
  1. 全公開 API に `#[tracing::instrument]` が付与されていること（CI スクリプトで `grep -c` によるカウント確認）
  2. コンパイル時に `#[tracing::instrument]` の `skip` / `fields` 指定が正しいこと（コンパイルエラーでないこと）
  3. `tracing-test` crate を使用して、`make_call` 呼び出し時の span 出力に `account_id` が含まれること
  4. `SecretString` を含むメソッド（`add_account`）の span 出力にパスワードが含まれないこと
  5. callback からの `tracing::trace!` 出力が期待通りのフィールドを含むこと
* **計装方法・観測対象:** 全公開 API の `#[tracing::instrument]` カバレッジ（目標 100%）。`tracing` イベントのフィールド完全性（必須フィールドの欠落がないこと）。

### マイルストーン M13: SipAccountHandle・発着信API

> **DB:** メモリ内完結

#### チケット M13-1: `SipAccountHandle` — アカウント単位操作

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.4)
* **対象不変条件 / 規範:** §8.4「利用者は SipAccountHandle を通じてアカウント単位操作を行う」。`register`, `unregister`, `set_registration_enabled`, `registration_state`, `make_call`, `update_config`。
* **実装の背景と目的:** アカウント単位の操作を提供するハンドル。`SipClient` と `AccountId` を保持し、各操作は reactor 経由で実行される。`Clone` 可能で、複数箇所から同一アカウントを操作できる。
* **実装スコープ:**
  - `src/account.rs`: `SipAccountHandle` struct（`client: SipClient`, `id: AccountId`）
  - `SipAccountHandle::id(&self) -> AccountId`
  - `SipAccountHandle::register(&self) -> Result<(), SipError>` — `SetRegistration { enabled: true }` を reactor に送信
  - `SipAccountHandle::unregister(&self) -> Result<(), SipError>` — `SetRegistration { enabled: false }` を reactor に送信
  - `SipAccountHandle::set_registration_enabled(&self, enabled: bool) -> Result<(), SipError>`
  - `SipAccountHandle::registration_state(&self) -> Result<RegistrationState, SipError>` — state の snapshot 読み取り
  - `SipAccountHandle::update_config(&self, patch: AccountConfigPatch) -> Result<(), SipError>`
  - `Clone` derive
* **テストコードによる検証（MockBackend 使用）:**
  1. `register()` → registration state が `Registering → Registered` に遷移すること
  2. `unregister()` → `Registered → Unregistering → Idle` に遷移すること
  3. `registration_state()` が最新の状態を返すこと
  4. `update_config` が反映されること（state 内の config が更新される）
  5. アカウント削除後の操作 → `AccountNotFound`
  6. shutdown 後の操作 → `ShutdownInProgress`
* **計装方法・観測対象:** 全操作が oneshot RTT + reactor 処理時間で完了すること。`registration_state()` がロック取得のみ（RTT 不要）であること。

#### チケット M13-2: 発着信API — `make_call` / `answer` / `hangup` / `hold` / `unhold` / `transfer` / `send_dtmf` / `call_state`

* **参照設計書:** docs/rust-sip-client-rfc.md (§8.5, §19, §19.1, §20, §38)
* **対象不変条件 / 規範:** §19 発着信 API 詳細。§19.1 answer semantics（`180`/`183`/`200`/`486`/`603`）。§38 blind transfer mandatory。
* **実装の背景と目的:** 通話操作 API の完全な提供。`make_call` は `OutgoingCallRequest` を受け取り、PJSUA 経由で INVITE を送出する。`answer` は着信に対して応答コードを送信する。`hangup` は `HangupReason` に応じて BYE または CANCEL を送出する。全操作は reactor 経由で直列化され、状態遷移の正当性が検証される。
* **実装スコープ:**
  - `src/call.rs`（または `src/client.rs` の `impl SipClient`）:
  - `SipClient::make_call(&self, account_id: AccountId, request: OutgoingCallRequest) -> Result<CallId, SipError>` — `SipAccountHandle::make_call` からも呼ばれる
  - `SipClient::answer(&self, call_id: CallId, code: u16) -> Result<(), SipError>` — §19.1 のコード制限（180/183/200/486/603 のみ、それ以外は `InvalidConfig`）。incoming call 以外で呼ばれた場合は `InvalidState`
  - `SipClient::hangup(&self, call_id: CallId, reason: HangupReason) -> Result<(), SipError>`
  - `SipClient::hold(&self, call_id: CallId) -> Result<(), SipError>`
  - `SipClient::unhold(&self, call_id: CallId) -> Result<(), SipError>`
  - `SipClient::transfer(&self, call_id: CallId, target: String) -> Result<(), SipError>` — blind transfer
  - `SipClient::send_dtmf(&self, call_id: CallId, digits: impl Into<String>, method: DtmfMethod) -> Result<(), SipError>`
  - `SipClient::call_state(&self, call_id: CallId) -> Result<CallState, SipError>` — state の snapshot 読み取り
* **テストコードによる検証（MockBackend 使用）:**
  1. `make_call(valid_request)` → `Ok(CallId)`、`OutgoingCallStarted` イベント発火
  2. `answer(call_id, 200)` → 着信中通話が `Active` に遷移、`CallConnected` イベント発火
  3. `answer(call_id, 200)` を発信中通話に対して → `InvalidState`
  4. `answer(call_id, 999)`（不正コード）→ `InvalidConfig`
  5. `hangup(call_id, Bye)` → `Disconnected` に遷移、`CallDisconnected` イベント発火
  6. `hold` / `unhold` → `Held` ↔ `Active` 遷移、`CallHeld` / `CallResumed` イベント発火
  7. `transfer(call_id, target)` → `Transferring` に遷移、`ReferReceived` イベント（受信側）発火
  8. `send_dtmf` → `DtmfSent` イベント発火
  9. `call_state()` が最新の状態を返すこと
  10. 切断済み通話への操作 → `InvalidState`
* **計装方法・観測対象:** 全操作の tracing span。各操作の reactor コマンド処理時間。状態遷移エラー時の詳細メッセージ。

---

## フェーズ7: 音声パイプライン（Layer 2-3）

> **外部依存:** `tokio`, `crossbeam_queue`, `rubato`, `dashmap`。PJSIP不要。全テストは tokio runtime + mock 音声ソースでメモリ内完結。

### マイルストーン M14: オーディオソース抽象

> **DB:** メモリ内完結

#### チケット M14-1: `AsyncAudioSource` trait（RPITIT）+ `ErasedAudioSource` blanket impl

* **参照設計書:** docs/rust-sip-client-rfc.md (§23, §23.1)
* **対象不変条件 / 規範:** §23「本crateは MSRV 1.95 を前提とし、RPITIT を採用する」。§23.1「内部の AudioMixer は Box<dyn AsyncAudioSource> でソースを保持するため、object-safe な wrapper trait を自動導出する。利用者が意識する必要は一切ない」。
* **実装の背景と目的:** 利用者が非同期音声ソースを実装するためのプライマリ trait。RPITIT（`async fn` in trait）により `Pin<Box<dyn Future>>` の手動記述が不要。内部では `ErasedAudioSource` に blanket impl で自動変換され、動的ディスパッチ可能になる。
* **実装スコープ:**
  - `src/audio/source.rs`: `pub trait AsyncAudioSource: Send`（`async fn next_chunk(&mut self, buf: &mut [i16]) -> usize`）
  - `pub(crate) trait ErasedAudioSource: Send`（`fn next_chunk<'a>(&'a mut self, buf: &'a mut [i16]) -> Pin<Box<dyn Future<Output = usize> + Send + 'a>>`）
  - `impl<T: AsyncAudioSource + Send> ErasedAudioSource for T` — blanket impl（§23.1）
  - `AudioSourceId`（M0-2 で定義済み）
* **テストコードによる検証:**
  1. モック実装: `struct MockSource { counter: u32 }` が `AsyncAudioSource` を実装し、`next_chunk` が正しいサンプル数を返すこと
  2. `Box<dyn AsyncAudioSource>` がコンパイルエラーになること（object-safe でない）
  3. `Box<dyn ErasedAudioSource>` がコンパイル可能であること
  4. blanket impl により `MockSource` が自動で `ErasedAudioSource` を実装すること
  5. `ErasedAudioSource` 経由の呼び出しが元の `AsyncAudioSource` 実装と同じ結果を返すこと
  6. `Send` 境界が充足されること（コンパイル時検証）
  7. 1000フレームの連続 pull でメモリリークがないこと
* **計装方法・観測対象:** blanket impl のコード生成サイズ（`Box::pin` 1回/フレーム）。`next_chunk` の戻り値（`usize`）が `buf.len()` 以下であることのランタイム検証。

#### チケット M14-2: `SyncAudioSource` + `SyncSourceAdapter`

* **参照設計書:** docs/rust-sip-client-rfc.md (§23.2)
* **対象不変条件 / 規範:** §23.2「同期的な音声ソースを非同期traitに適合させるアダプタを提供する」。
* **実装の背景と目的:** 同期的な音声ソース（ファイル読み込み、生成アルゴリズム等）を `AsyncAudioSource` に適合させる薄いアダプタ。内部では `next_chunk` を同期的に呼び出すだけだが、trait 境界を満たすために `async fn` としてラップする。
* **実装スコープ:**
  - `src/audio/source.rs`: `pub trait SyncAudioSource: Send`（`fn next_chunk(&mut self, buf: &mut [i16]) -> usize`）
  - `pub struct SyncSourceAdapter<T: SyncAudioSource + Send>`（`inner: T`）
  - `impl<T: SyncAudioSource + Send> AsyncAudioSource for SyncSourceAdapter<T>` — `async fn next_chunk` 内で `self.inner.next_chunk(buf)` を同期的に呼ぶ
  - `SyncSourceAdapter::new(inner: T) -> Self`
  - `SyncSourceAdapter::into_inner(self) -> T`
* **テストコードによる検証:**
  1. モック `SyncAudioSource` 実装 → `SyncSourceAdapter` 経由で `AsyncAudioSource` として使用可能
  2. 同期的な `next_chunk` の結果が正しく伝播すること
  3. 空のバッファ（`buf.len() == 0`）→ 戻り値 0
  4. バッファサイズより大きいデータ → バッファサイズ分のみ返す（truncate）
  5. `into_inner()` が元の実装を返すこと
* **計装方法・観測対象:** `SyncSourceAdapter` の変換オーバーヘッドがゼロであること（コンパイラが async fn を最適化することを期待）。

#### チケット M14-3: 音声ソース管理 API — `add_audio_source` / `remove_audio_source` / `set_gain` / `mute`

* **参照設計書:** docs/rust-sip-client-rfc.md (§24.4)
* **対象不変条件 / 規範:** §24.4「通話中の追加・削除・切替は reactor command 経由で同期化し、次 frame 境界で反映する」。
* **実装の背景と目的:** 通話中の音声ソース動的管理。`add_audio_source` で AI TTS やファイル再生を注入し、`remove_audio_source` で停止する。gain 調整と mute はフレーム境界で即座に反映される。
* **実装スコープ:**
  - `SipClient::add_audio_source(&self, call_id: CallId, source: Box<dyn AsyncAudioSource>) -> Result<AudioSourceId, SipError>`
  - `SipClient::remove_audio_source(&self, call_id: CallId, source_id: AudioSourceId) -> Result<(), SipError>`
  - `SipClient::set_audio_source_gain(&self, call_id: CallId, source_id: AudioSourceId, gain: f32) -> Result<(), SipError>`
  - `SipClient::mute_audio_source(&self, call_id: CallId, source_id: AudioSourceId, muted: bool) -> Result<(), SipError>`
  - 各操作は reactor 経由で AudioMixer に反映される
  - `gain` は 0.0 以上（負値は `InvalidConfig`）。上限は設けないが、極端な値（>10.0）は警告ログ
* **テストコードによる検証（MockBackend + 簡易 AudioMixer 使用）:**
  1. `add_audio_source` → `Ok(AudioSourceId)`
  2. 同一通話に10個のソースを追加 → 全ソースが独立した ID を持つこと
  3. `remove_audio_source` → 以降のフレームで該当ソースが pull されないこと（mixer 内のエントリ削除）
  4. `set_gain(0.5)` → 後続フレームで音量が半分になること
  5. `set_gain(-1.0)` → `InvalidConfig` エラー
  6. `mute(true)` → 後続フレームで該当ソースが無音として扱われること
  7. `mute(false)` → 再開されること
  8. 存在しない `source_id` の操作 → `AccountNotFound` 相当のエラー
* **計装方法・観測対象:** gain 適用後の出力振幅が期待値と一致することの統計的検証。ソース追加/削除のレイテンシが 2 フレーム以内であること。

### マイルストーン M15: AudioMixer・AudioWorkerTask

> **DB:** メモリ内完結

#### チケット M15-1: `AudioMixer` 構造体

* **参照設計書:** docs/rust-sip-client-rfc.md (§24.1, §24.2)
* **対象不変条件 / 規範:** §24.1「1 通話ごとに AudioMixer を 1 つ持つ。複数 source を frame ごとに pull、sum、clamp、gain 適用し、ミキシング済みフレームを lock-free queue へ書き込む」。§24.0「PJSIP オーディオコールバック内でのロック・非同期待機・メモリ確保は厳禁」。
* **実装の背景と目的:** 通話単位の音声ミキサー。全ソースから音声を pull し、M5-1 の `mix_i16_frame` でミキシング、結果を `crossbeam_queue::ArrayQueue` に書き込む。この queue が PJSIP RT callback との唯一の境界となる。
* **実装スコープ:**
  - `src/audio/mixer.rs`: `AudioMixer` struct（§24.1 定義）
    - `format: InternalPcmFormat`（内部は 16kHz / i16 / mono に固定）
    - `sources: DashMap<AudioSourceId, MixerSourceEntry>`
    - `master_gain: AtomicU32`（f32 のビット表現を atomic で保持）
    - `next_id: AtomicU64`
    - `out_queue: ArrayQueue<Vec<i16>>` — ミキシング済みOUTフレーム
    - `in_queue: ArrayQueue<Vec<i16>>` — RT callback からの受信INフレーム
  - `MixerSourceEntry` struct（`source: Mutex<Box<dyn ErasedAudioSource>>`, `gain: f32`（AtomicU32）, `muted: AtomicBool`, `eof: AtomicBool`）
  - `AudioMixer::new(format, out_capacity, in_capacity) -> Self`
  - `AudioMixer::add_source(&self, source: Box<dyn ErasedAudioSource>) -> AudioSourceId`
  - `AudioMixer::remove_source(&self, id: AudioSourceId) -> bool`
  - `AudioMixer::set_gain(&self, id: AudioSourceId, gain: f32) -> Result<(), SipError>`
  - `AudioMixer::mute(&self, id: AudioSourceId, muted: bool) -> Result<(), SipError>`
  - `AudioMixer::push_out_frame(&self, frame: Vec<i16>) -> Result<(), Vec<i16>>` — out_queue に push。満杯時は oldest-drop
  - `AudioMixer::pop_out_frame(&self) -> Option<Vec<i16>>` — RT callback 側から呼ばれる
  - `AudioMixer::push_in_frame(&self, frame: Vec<i16>) -> Result<(), Vec<i16>>`
  - `AudioMixer::pop_in_frame(&self) -> Option<Vec<i16>>` — AudioWorkerTask 側から呼ばれる
  - `AudioMixer::set_master_gain(&self, gain: f32)`
* **テストコードによる検証（tokio + tokio::task::spawn_blocking 使用）:**
  1. ソース追加 → ID が採番されること
  2. 10ソース追加後、全ソースが独立した ID を持つこと
  3. ソース削除 → 再追加時にもとの ID は再利用されないこと（単調増加）
  4. `push_out_frame` → `pop_out_frame` が同じデータを返すこと
  5. `out_queue` 満杯時 → oldest-drop（最新が優先されること）
  6. `in_queue` 満杯時 → push 側がブロックせず oldest-drop
  7. `set_gain(0.0)` → 該当ソースが無音として扱われること（次フレーム以降）
  8. `mute` が gain と独立して機能すること（mute 解除後、もとの gain が復元される）
  9. `set_master_gain(0.5)` → 全出力が半減すること
  10. `DashMap` への並行アクセス（複数タスクからの read/write）でデータ競合がないこと
* **計装方法・観測対象:** `out_queue` / `in_queue` の capacity が設定通りであること。`DashMap` の shard 数が十分であること（CPU コア数に応じて調整可能）。

#### チケット M15-2: `AudioWorkerTask` — Tokio blocking pool 駆動

* **参照設計書:** docs/rust-sip-client-rfc.md (§7.1, §24.3)
* **対象不変条件 / 規範:** §24.3「AudioWorkerTask は AudioMixer ごとに 1 つ、Tokio の blocking pool 上で動作する」。§7.1 Audio worker tasks の説明。§24.0 リアルタイム境界「PJSIP RT callback とは lock-free queue を介してのみ通信する」。
* **実装の背景と目的:** 音声処理のメインループ。全非同期ソースから `.await` で音声を pull し、ミキシング、リサンプル、PairAligner 整列、各 Tap への配送までを行う。RT callback とは完全に分離され、ロック・メモリ確保が安全に行える。
* **実装スコープ:**
  - `src/audio/bridge.rs`（または新ファイル `src/audio/worker.rs`）: `AudioWorker` struct
  - `AudioWorker::new(mixer: AudioMixer, call_id: CallId, format: AudioFormat, tap_txs: Vec<mpsc::Sender<AudioChunkPair>>) -> Self`
  - `AudioWorker::process_frame(&mut self) -> Result<(), SipError>` — §24.3 の処理:
    1. 全ソースから非同期 pull（`tokio::sync::Mutex` 経由）
    2. `mix_i16_frame` でミキシング
    3. `out_queue` に push（RT callback が pop する）
    4. `in_queue` から受信音声を pull
    5. PairAligner に push_in / push_out
    6. `try_pair()` でペア生成 → Tap に配送（Realtime モードなら oldest-drop、Lossless なら backpressure）
  - `AudioWorker::run(mut self)` — `tokio::task::spawn_blocking` で駆動されるメインループ。`tokio::time::interval(frame_duration)` で定周期実行
  - shutdown 時の graceful stop（全ソースの EOF を待ち、残存フレームを drain）
* **テストコードによる検証（tokio runtime + mock ソース使用）:**
  1. 1ソース・10フレーム処理 → 全フレームが out_queue に到達すること
  2. in_queue にプッシュされた受信フレームが PairAligner 経由で Tap に配送されること
  3. フレーム周期が `frame_ms` に従うこと（許容誤差 ±5ms）
  4. ソースが EOF（`next_chunk` が 0 を返す）→ 該当ソースが次フレームから除外されること
  5. 全ソース EOF → worker が停止し、残存フレームが drain されること
  6. shutdown signal 受信 → 現在のフレーム処理完了後に停止すること
  7. 10並列 AudioWorker（10通話相当）→ 全 worker が独立して動作すること
  8. `process_frame` 内の panic → `catch_unwind` で捕捉され、該当通話のみ停止（他通話は継続）
* **計装方法・観測対象:** フレーム処理時間が `frame_ms` 以下であること（リアルタイム性の確保）。`out_queue` / `in_queue` の溢れ回数（metrics feature で計装）。

### マイルストーン M16: AudioTap・リサンプラ

> **DB:** メモリ内完結

#### チケット M16-1: `AudioTapHandle` / `AudioTapMode` / `subscribe_audio`

* **参照設計書:** docs/rust-sip-client-rfc.md (§22, §22.1)
* **対象不変条件 / 規範:** §22「音声タップは Realtime（oldest-drop）と Lossless（backpressure）の2モードを持つ」。§22.1 backpressure policy。§15.7「AudioTapHandle の oldest-drop 戦略と組み合わせて使用すること」。
* **実装の背景と目的:** 利用者が通話音声を購読するための API。`Realtime` モード（既定）はリアルタイム性を優先し、購読者の処理遅延時に oldest-drop で最新フレームを優先する。`Lossless` モードはバックプレッシャーをかけてフレームドロップを避けるが、持続的な遅延は音声全体にジッタを誘発する。
* **実装スコープ:**
  - `src/audio/chunk.rs`（または新ファイル）:
  - `AudioTapMode` enum（`Realtime`, `Lossless`）— `Default` は `Realtime`
  - `AudioTapHandle` struct（`rx: mpsc::Receiver<AudioChunkPair>`）
  - `AudioTapHandle::recv(&mut self) -> Option<AudioChunkPair>` — `self.rx.recv().await`
  - `AudioTapHandle::try_recv(&mut self) -> Result<AudioChunkPair, TryRecvError>` — 非ブロッキング
  - `SipClient::subscribe_audio(&self, call_id: CallId, format: AudioFormat, capacity: usize, mode: AudioTapMode) -> Result<AudioTapHandle, SipError>`
  - `subscribe_audio` 内部: reactor 経由で AudioWorkerTask に Tap を登録。`mpsc::channel(capacity)` を生成し、tx 側を AudioWorkerTask に渡す
  - `Realtime` モード: `mpsc::Sender::try_send` を使用し、満杯時は oldest-drop（channel の先頭を pop してから push）
  - `Lossless` モード: `mpsc::Sender::send` を使用し、満杯時は `.await` でバックプレッシャー
* **テストコードによる検証（tokio runtime + mock ソース使用）:**
  1. `subscribe_audio` → `Ok(AudioTapHandle)`
  2. `recv()` が正しい `AudioChunkPair` を返すこと（IN/OUT の内容検証）
  3. `Realtime` モード: 購読者が遅延 → 最新フレームが優先され、古いフレームがドロップされること
  4. `Lossless` モード: 購読者が遅延 → 送信側がブロックされること（capacity を超えない）
  5. `Lossless` モード: 購読者が十分速い → 全フレームが欠損なく配送されること
  6. 通話終了後 → `recv()` が `None` を返すこと（channel close）
  7. 同一通話に複数 Tap → 各 Tap が独立してフレームを受信すること
  8. 存在しない `call_id` → `CallNotFound` エラー
  9. 既に終了した通話 → `InvalidState` エラー
* **計装方法・観測対象:** Tap のドロップ回数（`Realtime` モードの `try_send` 失敗回数）。Tap の配送遅延（フレーム生成から購読者受信までの時間）。

#### チケット M16-2: `ResamplePipeline` — rubato 統合

* **参照設計書:** docs/rust-sip-client-rfc.md (§26)
* **対象不変条件 / 規範:** §26「要件に従い rubato を用いる。内部 native format は PJSIP/codec negotiation に応じた monaural i16 PCM とし、利用者要求フォーマットへ出力時変換する」。
* **実装の背景と目的:** 内部処理フォーマット（16kHz / i16 / mono）と利用者要求フォーマット（任意の sample rate / bit depth / channel layout）の変換パイプライン。rubato を使用した高品質なサンプルレート変換、I16↔F32 の型変換、Mono↔StereoInOut のチャネル変換を提供する。
* **実装スコープ:**
  - `src/audio/resampler.rs`: `ResamplePipeline` struct（§26 定義）
  - `ResamplePipeline::new(in_rate: SampleRate, out_rate: SampleRate, bit_depth: BitDepth, layout: ChannelLayout) -> Result<Self, SipError>`
  - `ResamplePipeline::process_in(&mut self, in_mono_i16: &[i16]) -> Result<Vec<i16>, SipError>` — IN チャネルのリサンプル処理
  - `ResamplePipeline::process_out(&mut self, out_mono_i16: &[i16]) -> Result<Vec<i16>, SipError>` — OUT チャネルのリサンプル処理
  - `ResamplePipeline::process_pair(&mut self, in_mono: &[i16], out_mono: &[i16]) -> Result<Vec<i16>, SipError>` — IN/OUT 両方を処理し、指定された ChannelLayout で出力
  - `ResamplePipeline::reset(&mut self)` — rubato の内部状態リセット
  - レート変換不要時は rubato をバイパスし、コピーのみ
  - 内部: `rubato::FftFixedIn<f32>` を使用。i16 → f32 変換 → rubato 処理 → f32 → i16（または f32 出力）
* **テストコードによる検証:**
  1. 同一レート変換（16kHz→16kHz）→ 入力と出力が（ほぼ）一致すること（rubato の通過後も）
  2. 16kHz→8kHz 変換 → サンプル数が半分になること（frame_ms 同一の場合）
  3. 8kHz→48kHz 変換 → サンプル数が6倍になること
  4. Mono→StereoInOut 変換 → サンプル数が2倍、L=IN, R=OUT のインターリーブ
  5. I16→F32 変換 → 値が正規化されること（i16::MAX → 1.0, 0 → 0.0, i16::MIN → -1.0）
  6. i16→F32→i16 ラウンドトリップ → 量子化誤差以内で一致すること
  7. 空入力 → 空出力（または最小出力）
  8. `reset()` 後も正しく動作し続けること
  9. 未サポートの sample rate → `AudioFormatUnsupported` エラー
* **計装方法・観測対象:** リサンプル処理のレイテンシ（rubato の内部バッファ遅延）。変換精度（THD+N 相当の簡易計測）。

#### チケット M16-3: `subscribe_audio` のフォーマット変換統合

* **参照設計書:** docs/rust-sip-client-rfc.md (§22, §41.4)
* **対象不変条件 / 規範:** §22 subscribe_audio API。§41.4 音声 tap と WAV 書き出しの使用例。
* **実装の背景と目的:** `subscribe_audio` で指定された `AudioFormat` に従い、内部フォーマット（16kHz/i16/mono）から利用者要求フォーマットへ自動変換する。利用者はフォーマット変換を意識する必要がない。
* **実装スコープ:**
  - `subscribe_audio` 内部で `ResamplePipeline` を生成し、AudioWorkerTask のフレーム処理に組み込む
  - 各フレーム処理後、`ResamplePipeline::process_pair()` で変換してから Tap に配送
  - 変換後の `AudioChunk` 型（`AudioChunk::I16` または `AudioChunk::F32`）は `bit_depth` に応じて決定
  - format が内部フォーマットと同一の場合 → ResamplePipeline をバイパス（最適化）
* **テストコードによる検証（tokio runtime + mock ソース使用）:**
  1. `subscribe_audio(call_id, 16kHz/I16/StereoInOut, 512, Realtime)` → 受信データがステレオインタリーブであること
  2. `subscribe_audio(call_id, 8kHz/I16/Mono, 512, Realtime)` → 受信データが 8kHz mono に変換されていること
  3. `subscribe_audio(call_id, 48kHz/F32/StereoInOut, 512, Realtime)` → F32 ステレオデータが受信されること
  4. format 不一致 → `AudioFormatUnsupported` エラー（未サポート rate の場合）
  5. 複数 Tap が異なる format で独立して変換されること
* **計装方法・観測対象:** format 変換の有無によるフレーム処理時間の差（バイパス時と変換時の比較）。各 Tap のフォーマット変換パイプラインの独立性。

---

## フェーズ8: FFI層（Layer 4）

> **外部依存:** PJSIP 2.17（prebuilt or source build）。`bindgen`（build-time）。`unsafe` コードを含むため、各チケット完了時に `cargo miri` および `cargo test` の両方で安全性を検証する。

### マイルストーン M17: FFI基盤

> **DB:** メモリ内完結（FFI 経由で PJSUA ライブラリを動的リンク）

#### チケット M17-1: bindgen 設定と生成

* **参照設計書:** docs/rust-sip-client-rfc.md (§27.1)
* **対象不変条件 / 規範:** §27.1「build.rs は platform 別に include path と define を設定し、pjsua.h, pjsua-lib/pjsua.h, pjmedia-codec/opus.h など必要ヘッダのみを対象にする」。allowlist による関数・型・変数の選択的生成。
* **実装の背景と目的:** PJSIP C ライブラリの Rust FFI バインディングを自動生成する。`bindgen` により手書きの unsafe 宣言を排除し、PJSIP バージョン更新時の追従を自動化する。allowlist で必要最小限のシンボルのみを生成し、コンパイル時間とバインディングサイズを抑制する。
* **実装スコープ:**
  - `build.rs` 内の bindgen 設定（§27.1 の allowlist）:
    - `allowlist_function: "pjsua_.*"`, `"pj_.*"`
    - `allowlist_type: "pjsua_.*"`, `"pj_.*"`
    - `allowlist_var: "PJSUA_.*"`, `"PJ_.*"`
  - `wrapper.h` ファイル（`#include <pjsua-lib/pjsua.h>` + opus ヘッダ + その他必要なヘッダ）
  - 生成出力先: `OUT_DIR/pjsip_bindings.rs`
  - `src/ffi/bindings.rs`: `include!(concat!(env!("OUT_DIR"), "/pjsip_bindings.rs"))`
  - `#![allow(non_upper_case_globals, non_camel_case_types, non_snake_case, unused)]` の適用
* **テストコードによる検証（手動検証 + CI）:**
  1. `cargo build` が bindgen 生成コードを含めて成功すること
  2. 生成されたバインディングに `pjsua_create`, `pjsua_init`, `pjsua_acc_add` 等の主要関数が含まれること
  3. `PJSUA_INVALID_ID` 定数が利用可能であること
  4. `cargo doc` が FFI モジュールのドキュメント生成に成功すること
  5. macOS / Linux / Windows の各ターゲットで bindgen 生成が成功すること（CI 検証）
* **計装方法・観測対象:** bindgen 生成コードの行数。生成時間。allowlist で不要なシンボルが除外されていること（`cargo build --verbose` の出力確認）。
* **ユーザによる手動テスト手順:**
  - PJSIP 2.17 の prebuilt バイナリがない場合、ソースビルドが自動で実行される。CMake と必要なシステムパッケージ（§28.4）が事前にインストールされていることを確認すること。
  - `cargo build -p siprs 2>&1 | head -50` を実行し、bindgen とリンクのエラーがないことを確認する。
  - macOS では `brew install pkg-config cmake`、Ubuntu では `sudo apt-get install -y build-essential cmake libasound2-dev libssl-dev libcrypto-dev libuuid-dev` が必須。

#### チケット M17-2: `PjOwnedStr` — `pj_str_t` wrapper（実 FFI 型統合）

* **参照設計書:** docs/rust-sip-client-rfc.md (§27.2)
* **対象不変条件 / 規範:** §27.2「PJSIP は pj_str_t を使うため、CString の lifetime 問題を避ける wrapper を定義する」。§47「pj_str_t は常に Rust 側 owner を保持」。
* **実装の背景と目的:** M4-2 で仮定義した `PjStrWrapper` を実 FFI 型（`ffi::pj_str_t`）と統合する。`pj_str_t` は null 終端不要のポインタ+長さのペアであり、Rust 側で所有権管理することで dangling pointer を防止する。
* **実装スコープ:**
  - `src/ffi/strings.rs`: `PjOwnedStr` struct（M4-2 の仮実装を置換。`bytes: Vec<u8>`, `raw: ffi::pj_str_t`）
  - `PjOwnedStr::new(s: &str) -> Self` — バイト列を所有し、`pj_str_t` の `ptr` に内部ポインタを設定
  - `PjOwnedStr::as_raw(&self) -> ffi::pj_str_t`
  - `PjOwnedStr::as_str(&self) -> &str` — UTF-8 検証付き
  - `Drop` 不要（`Vec<u8>` が自動で解放）。ただし `pj_str_t.ptr` は `bytes` の内部ポインタであるため、`PjOwnedStr` の move 後に pointer が無効化されないよう注意
  - **安全性の注記**: `bytes` の内部ポインタを `pj_str_t.ptr` に保持するため、`PjOwnedStr` を move した後は `raw` フィールドの pointer を更新する必要がある。`Pin` または move 検出機構を実装する。
* **テストコードによる検証:**
  1. `PjOwnedStr::new("hello")` → `as_raw().slen == 5`
  2. `as_str()` が元の文字列を返すこと
  3. UTF-8 マルチバイト文字列（"こんにちは"）→ `as_raw().slen` がバイト長（15）であること
  4. NULL バイトを含む文字列 → `as_raw().slen` が正しいこと（`pj_str_t` は null 終端不要）
  5. move 後の pointer 更新 → `PjOwnedStr` を `Vec` に移動した後も `as_raw().ptr` が有効であること（`miri` で検証）
  6. 1000回の move 操作でメモリ安全性が破れないこと（`miri` で検証）
* **計装方法・観測対象:** `miri` による stacked borrows 検証。`PjOwnedStr` のメモリレイアウトが `Vec<u8>` + `pj_str_t` で最小限であること。

#### チケット M17-3: Callback bridge — extern "C" callbacks → NativeEvent enqueue

* **参照設計書:** docs/rust-sip-client-rfc.md (§27.3)
* **対象不変条件 / 規範:** §27.3「callback 内では Rust object への直接 mutable access を避け、軽量イベントを enqueue する」。§45.1「解答は『callback では enqueue のみ、状態遷移は reactor』である」。§46.1 catch_unwind 発火時のクリーンアップ手順。
* **実装の背景と目的:** PJSIP の C callback 群を Rust の reactor モデルに接続する橋渡し層。各 callback は最小限の処理（`NativeEvent` enum への変換と reactor への enqueue）のみを行い、状態変更やブロッキング操作は一切行わない。`catch_unwind` でパニックを捕捉し、crate 全体のダウンを防止する。
* **実装スコープ:**
  - `src/ffi/callbacks.rs`: 全 PJSIP callback の extern "C" 関数
    - `on_incoming_call(acc_id, call_id, rdata)` → `NativeEvent::IncomingCall { acc_id, call_id }`
    - `on_call_state(call_id, event)` → `NativeEvent::CallStateChanged { call_id, event }`
    - `on_call_media_state(call_id)` → `NativeEvent::CallMediaStateChanged { call_id }`
    - `on_reg_state(acc_id)` → `NativeEvent::RegistrationStateChanged { acc_id }`
    - `on_reg_started(acc_id, renew)` → `NativeEvent::RegistrationStarted { acc_id, renew }`
    - `on_dtmf_digit(call_id, digit)` → `NativeEvent::DtmfDigit { call_id, digit }`
    - `on_dtmf_digit2(call_id, digit, method)` → `NativeEvent::DtmfDigit2 { call_id, digit, method }`
    - `on_transport_state(transport_id, state, info)` → `NativeEvent::TransportStateChanged { ... }`
    - `on_ice_transport_error(...)` → `NativeEvent::IceTransportError { ... }`
    - `on_call_tsx_state(call_id, tsx, event)` → `NativeEvent::CallTsxStateChanged { ... }`
    - `on_nat_detect(info)` → `NativeEvent::NatDetected { ... }`
    - `on_call_redirected(call_id, target)` → `NativeEvent::CallRedirected { ... }`
    - `on_call_transfer_status(call_id, status_code, ...)` → `NativeEvent::CallTransferStatus { ... }`
    - `on_call_replaced(old_call_id, new_call_id)` → `NativeEvent::CallReplaced { ... }`
  - `NativeEvent` enum — `pub(crate)`。callback から reactor への内部イベント型
  - 各 callback 内で `runtime::global_runtime().enqueue_native_event(event)` を呼ぶ
  - `std::panic::catch_unwind` で全 callback をラップ（§46.1）
  - **§46.1 4ステップクリーンアップ手順の実装（`catch_unwind` 捕捉時）**:
    1. **即時 stopping**: パニック発生 callback のコンテキスト（account_id / call_id）を特定し、`ClientState` 上で該当エンティティを `Stopping` 状態に遷移させる。`SipEventPayload::Error(InternalInvariantBroken)` を `control` バスに emit する。以後の新規操作は `InvalidState` で即座に拒否。
    2. **非同期クリーンアップ（Core Reactor 経由）**: reactor thread 上に非同期クリーンアップコマンドをキューイングする。通話の場合 `pjsua_call_hangup()`、アカウントの場合 `pjsua_acc_set_registration(acc_id, PJ_FALSE)`、media port の場合 `pjsua_conf_remove_port()` を、それぞれ個別の `catch_unwind` で保護して呼び出す。
    3. **リソースリークの許容**: パニック後のデータ構造（`Vec`, `HashMap`, `Arc` 等）は一部破損の可能性があるため、完全なクリーンアップは不可能とする。リークの影響範囲は該当 call/account に限定し、他通話・client 全体の安定性を優先する。`max_calls` 超過警告で累積リークを検出。
    4. **事後通知**: クリーンアップ完了後、`CallDisconnected` または相当する終了イベントを emit。`TimeoutConfig::shutdown_timeout` 超過時は `SipEventPayload::Error` を emit し、reactor 処理を継続。
  - callback の登録: `pjsua_callback` 構造体に関数ポインタを設定する `register_callbacks()` 関数
* **テストコードによる検証（CI + 手動検証）:**
  - **単体テスト**: `NativeEvent` の全バリアントが定義され、`Debug` / `Clone` が機能すること
  - **panic 捕捉テスト（MockBackend 使用）**: テスト用 callback 内で `panic!("test")` を発生させ、`catch_unwind` が正しく捕捉して `InternalInvariantBroken` エラーが emit されること。`ClientState` 上で該当エンティティが `Stopping` 状態になること（シングルスレッドテスト）
  - **cleanup 手順テスト（MockBackend 使用）**: パニック捕捉後の4ステップ cleanup（Stopping 遷移 → 非同期クリーンアップ → リーク許容 → 事後通知）が正しく実行されることを検証
  - **callback 登録の網羅性テスト**: `register_callbacks()` 後に Mock の `pjsua_callback` 構造体の全フィールドが非 null であることの自動テスト（PJSIP 初期化不要）。関数ポインタ配列をループ走査し、未設定の callback フィールドがないことを確認
  - **統合テスト（M20-1 で実施）**: 実際の PJSUA 環境での callback 発火確認
* **計装方法・観測対象:** 各 callback の呼び出し回数（`tracing::trace!` で計装）。`catch_unwind` 発火回数。
* **ユーザによる手動テスト手順:**
  - PJSIP の初期化が完了した状態で、各 callback が実際に発火することを SIP サーバとの結合テスト（M20-1）で確認する。
  - 特に `on_incoming_call` と `on_call_state` は発着信の基本フローを構成するため、最優先で検証すること。

#### チケット M17-4: `PjsuaBackend` — `SipBackend` trait の PJSUA 実装

* **参照設計書:** docs/rust-sip-client-rfc.md (§27a, §29, §29.1)
* **対象不変条件 / 規範:** §27a「MVP 範囲では PJSUA (PjsuaBackend) が唯一の実装」。§29 codec policy 強制「PCMU と Opus 以外は無効化」。§29.1 コーデックフォールバックルール。
* **実装の背景と目的:** `SipBackend` trait の本番実装。全 PJSUA API 呼び出しを safe Rust でラップし、エラー変換（`pj_status_t` → `SipError`）を行う。`configure_codecs` では PCMU/Opus 以外を無効化する。
* **実装スコープ:**
  - `src/ffi/backends/pjsua.rs`（または `src/ffi/mod.rs` に同居）: `PjsuaBackend` struct
  - `impl SipBackend for PjsuaBackend` — §27a の全メソッド
  - `PjsuaBackend::new() -> Self`
  - `PjsuaBackend::register_callbacks(&self)` — M17-3 の callback 登録
  - 各メソッド内の unsafe FFI 呼び出しを `// SAFETY:` コメントで正当化
  - エラー変換: `pj_status_t` → `Result<(), SipError>`
  - `configure_codecs()` の実装（§29）:
    1. `pjsua_enum_codecs()` で全コーデックを列挙
    2. PCMU/8000/1 → priority 255
    3. opus 系 → priority 254
    4. それ以外 → priority 0（無効化）
  - `initialize()`: `pjsua_create()` → `pjsua_init()` → `pjsua_start()` の順次呼び出し
* **テストコードによる検証（手動検証）:**
  - **単体テスト**: `PjsuaBackend::new()` が panic しないこと
  - **SipBackend trait 境界の充足**: `PjsuaBackend: SipBackend + Send` がコンパイル時に検証されること
  - FFI 呼び出しのエラー変換が `pj_status_t` の全主要エラーコード（`PJ_SUCCESS`, `PJ_EBUSY`, `PJ_ETIMEDOUT`, `PJ_EINVAL` 等）をカバーすること
  - **統合テスト（M20-1 で実施）**: PJSUA 初期化 → トランスポート作成 → アカウント追加 → 発信 → 切断 → シャットダウン の基本フロー
* **計装方法・観測対象:** 全 PJSIP API 呼び出しの `tracing::debug!` スパン。エラーレスポンスの `native_status` 保持。
* **ユーザによる手動テスト手順:**
  - `cargo test -p siprs -- --ignored` で PJSIP 依存の統合テストを実行する。
  - テストにはローカルに起動した SIP サーバ（Asterisk on Docker）が必要。`make sip-test-server` で起動できるようにする。

### マイルストーン M18: メディアFFI

> **DB:** メモリ内完結（FFI 経由で PJSUA メディアスタックを使用）

#### チケット M18-1: `RustMediaPort` — `pjmedia_port` / `get_frame` / `put_frame`

* **参照設計書:** docs/rust-sip-client-rfc.md (§39.2, §39.1)
* **対象不変条件 / 規範:** §39.1「PJSIP callback は OS の最優先リアルタイムスレッドで駆動する。crossbeam_queue::ArrayQueue からの pop/push、memcpy、ゼロフィルのみが許容される」。§39.2 custom media port 設計。
* **実装の背景と目的:** PJSIP conference bridge と Rust AudioWorkerTask を接続する lock-free メディアポート。RT callback 側（`get_frame`/`put_frame`）ではロック・メモリ確保・非同期待機を一切行わず、`ArrayQueue` からの pop/push と `memcpy` のみを実行する。すべての重い処理は AudioWorkerTask 側で行われる。
* **実装スコープ:**
  - `src/ffi/media.rs`: `RustMediaPort` struct（§39.2 定義）
  - `RustMediaPort::new(call_id: CallId, direction: PortDirection, frame_size: usize, queue_capacity: usize) -> Self`
  - `RustMediaPort::as_pjmedia_port_ptr(&self) -> *mut ffi::pjmedia_port`
  - unsafe extern "C" fn `rust_get_frame(port, frame)` — §39.2 の実装:
    1. `rx_queue.pop()` → データあり → `copy_nonoverlapping` で `frame.buf` にコピー
    2. データなし（アンダーラン）→ `write_bytes` でゼロフィル
  - unsafe extern "C" fn `rust_put_frame(port, frame)` — §39.2 の実装:
    1. `frame.buf` から `MediaFrame::copy_from` でデータをコピー
    2. `tx_queue.push(frame)` — 失敗時（満杯）はドロップ（oldest-drop）
  - `PortDirection` enum（`Capture` — remote audio IN, `Playback` — local audio OUT）
  - `MediaFrame` — 固定長バッファ（`[u8; MAX_FRAME_BYTES]`）。`MAX_FRAME_BYTES` は 48kHz/stereo/20ms の最大フレームサイズ
* **テストコードによる検証（手動検証）:**
  - **単体テスト**: `RustMediaPort::new()` が `pjmedia_port` の基本フィールドを正しく初期化すること（`info` フィールドの format 設定等）
  - **queue 動作テスト**: `rx_queue.push(frame)` → `get_frame` 相当の pop が同じデータを返すこと
  - **アンダーランテスト**: 空 queue に対する pop → ゼロフィル
  - **オーバーフローテスト**: 満杯 queue に対する push → 古いデータが oldest-drop され、新しいデータが入ること
  - `memcpy` / `copy_nonoverlapping` の安全性を `miri` で検証（可能な範囲で）
* **計装方法・観測対象:** アンダーラン回数、オーバーフロー（ドロップ）回数（metrics feature）。`get_frame`/`put_frame` の呼び出し周期（PJSIP の内部タイマーに依存）。
* **ユーザによる手動テスト手順:**
  - `cargo test -p siprs -- --ignored` で統合テストを実行し、実際の通話中に AudioTap から受信した `AudioChunkPair` の IN/OUT チャネルが無音でないことを確認する。
  - 特に長時間通話（5分以上）でアンダーランが累積しないことを確認する。

#### チケット M18-2: `AudioBridge` — lock-free queue 接続・Conference port 統合

* **参照設計書:** docs/rust-sip-client-rfc.md (§39.2, §39.3)
* **対象不変条件 / 規範:** §39.3 データフロー全体。§39「通話ごとに custom port を 2 つ持つ。Capture tap port（remote audio IN）と Playback inject port（mixer output OUT）」。
* **実装の背景と目的:** AudioWorkerTask と RustMediaPort の間のデータフローを管理するブリッジ。通話確立時に PJSIP conference bridge に custom port を接続し、通話終了時に切断する。capture tap port でリモート音声を受信し、playback inject port でローカルミキサー出力を注入する。
* **実装スコープ:**
  - `src/ffi/media.rs`: `AudioBridge` struct（§39.2 定義）
  - `AudioBridge::new(call_id: CallId, frame_size: usize, queue_capacity: usize) -> (Self, RustMediaPort, RustMediaPort)`
  - `AudioBridge::connect_to_conference(&self, call_media_session: ...) -> Result<(), SipError>` — PJSIP conference bridge に capture/inject port を接続
  - `AudioBridge::disconnect(&self) -> Result<(), SipError>` — conference bridge から切断 + port 破棄
  - `AudioBridge::push_to_rt(&self, frame: Vec<i16>) -> Result<(), Vec<i16>>` — OUT 方向（AudioWorkerTask → RT callback）
  - `AudioBridge::pop_from_rt(&self) -> Option<Vec<i16>>` — IN 方向（RT callback → AudioWorkerTask）
  - `AudioBridge::is_connected(&self) -> bool`
* **テストコードによる検証（手動検証）:**
  - **単体テスト**: `AudioBridge::new()` → `push_to_rt` → `pop_from_rt`（mock queue 経由）が同じデータを返すこと
  - **queue 分離**: `to_rt` と `from_rt` が独立した queue であること（干渉しない）
  - **接続状態管理**: `connect_to_conference` 後 `is_connected() == true`, `disconnect` 後 `false`
  - **統合テスト（M20-1 で実施）**: 実際の通話中に AudioTap から受信したデータの IN/OUT チャネルが非ゼロであること
* **計装方法・観測対象:** conference port の接続数（PJSIP 内部で管理）。`to_rt` / `from_rt` queue の使用率（metrics feature）。
* **ユーザによる手動テスト手順:**
  - AudioTap から受信した `AudioChunkPair` の `in_chunk`（リモート音声）が通話相手の音声を含むことを確認する。無音ファイルやトーンの再生で検証可能。
  - `add_audio_source` で挿入した音声が `out_chunk` に反映されることを確認する。

---

## フェーズ9: ビルドシステム（Layer 4）

> **外部依存:** CMake, PJSIP 2.17 ソース, OS別システムパッケージ（§28.4）。CI でマトリクス検証（macOS, Ubuntu, Windows）。

### マイルストーン M19: ビルドシステム

> **DB:** N/A（ビルド時のみ）

#### チケット M19-1: `build.rs` — prebuilt優先・source build fallback

* **参照設計書:** docs/rust-sip-client-rfc.md (§28, §28.1, §28.2, §28.3)
* **対象不変条件 / 規範:** §28 build.rs 戦略。§28.1 探索順序（prebuilt → source build fallback）。§28.3 cmake flags（`PJMEDIA_WITH_VIDEO=OFF` mandatory, Opus enabled, TLS/SRTP feature flag 連動）。§28.4 OS別システムパッケージ依存関係。
* **実装の背景と目的:** crate のビルドを `cargo build` 一発で完結させる。プレビルドバイナリが存在する場合はそれを使用し（高速）、存在しない場合は PJSIP をソースから CMake でビルドする（移植性）。ビルド失敗時はユーザフレンドリなエラーメッセージと共に、必要なシステムパッケージ（§28.4）を案内する。
* **実装スコープ:**
  - `build.rs`（§28.2 の擬似実装に従う）:
    1. `TARGET` 環境変数から target triple を取得
    2. `vendor/prebuilt/{target}/lib/` を確認
    3. 全必須ライブラリ（`libpjsua2`, `libpj`, `libpjlib-util`, `libpjmedia`, `libpjnath`, `libpjsip`, `libresample`, `libsrtp`（TLS/SRTP feature による））が揃っていれば `cargo:rustc-link-search` と `cargo:rustc-link-lib` を出力
    4. 欠損時: `vendor/pjsip/` ソースを CMake でビルド
      - `cmake::Config::new("vendor/pjsip")` で設定
      - `-DPJMEDIA_WITH_VIDEO=OFF` 必須
      - TLS feature: `-DPJ_HAS_SSL=ON`
      - SRTP feature: `-DPJMEDIA_HAS_SRTP=ON`
    5. 成功時: `OUT_DIR/pjsip-build` に生成物を配置し link
    6. bindgen 実行（M17-1）
  - ビルド失敗時のエラーメッセージ: OS 別のパッケージインストール手順（§28.4）を表示
  - `cargo:warning` でビルド方法（prebuilt / source）を表示
  - `cargo:rerun-if-changed=wrapper.h`, `cargo:rerun-if-changed=vendor/` の設定
* **テストコードによる検証（CI で自動化）:**
  1. prebuilt あり → `cargo build -p siprs` が成功し、ビルドログに "Using prebuilt PJSIP" が含まれること
  2. prebuilt なし → source build が自動で開始され、成功すること
  3. CMake 不在 → 明確なエラーメッセージで "Please install cmake" が表示されること
  4. macOS arm64: system frameworks（CoreAudio, CoreFoundation, Security）が自動リンクされること
  5. Linux x86_64: `libasound`, `libssl`, `libcrypto` がリンクされること
  6. Windows x86_64: MSVC 環境でビルドが成功すること
  7. `PJMEDIA_WITH_VIDEO=OFF` が適用されていること（cmake ログ確認）
  8. `tls` feature 有効時のみ PJ_HAS_SSL=ON
  9. `srtp` feature 有効時のみ PJMEDIA_HAS_SRTP=ON
* **計装方法・観測対象:** ビルド時間（prebuilt vs source）。bindgen 生成時間。CMake configure 時間。
* **ユーザによる手動テスト手順:**
  - 各 OS で `cargo clean && cargo build -p siprs` を実行し、ビルドが成功することを確認する。
  - `cargo build -p siprs --features tls,srtp` で全 feature 有効時のビルドを確認する。
  - エラー時のメッセージに、不足しているパッケージのインストール手順が明示されていることを確認する。

#### チケット M19-2: feature flags 設定

* **参照設計書:** docs/rust-sip-client-rfc.md (§12, §30, §34.2, §40, §21.1)
* **対象不変条件 / 規範:** §12 TLS feature flag。§30 SRTP feature flag。§34.2 metrics optional feature。§40 cpal-input optional feature。§21.1 serde optional feature。
* **実装の背景と目的:** 不要な依存を削減し、ビルド時間とバイナリサイズを最小化するための feature flag 群。各 feature は独立して有効/無効化でき、無効時は対応する型・関数がコンパイル時に除外される。
* **実装スコープ:**
  - `Cargo.toml` の `[features]` セクション:
    - `default = []`（最小構成）
    - `tls = []` — TLS トランスポート有効化
    - `srtp = []` — SRTP 有効化
    - `cpal-input = ["cpal"]` — マイク入力機能
    - `metrics = []` — メトリクス収集
    - `serde = ["serde_crate", "serde_json"]` — シリアライズ機能
    - `full = ["tls", "srtp", "cpal-input", "metrics", "serde"]`
  - `#[cfg(feature = "tls")]` の付与箇所:
    - `TransportConfig::Tls` variant
    - `TransportKind::Tls` variant
    - `TlsConfig` struct
    - `AccountTransportPolicy` で TLS 関連の処理
  - `#[cfg(feature = "srtp")]` の付与箇所:
    - `SrtpPolicy::Optional` / `SrtpPolicy::Mandatory` のバリデーション条件分岐
  - 各 `Cargo.toml` dependency の `optional = true` 設定
* **テストコードによる検証（CI で自動化）:**
  1. `cargo check -p siprs`（default features）→ 成功
  2. `cargo check -p siprs --features tls` → 成功
  3. `cargo check -p siprs --features srtp` → 成功
  4. `cargo check -p siprs --features tls,srtp` → 成功
  5. `cargo check -p siprs --all-features` → 成功
  6. `tls` feature 無効時に `TransportConfig::Tls` が使用不可であること（コンパイルエラー）
  7. `srtp` feature 無効時に `SrtpPolicy::Mandatory` が `InvalidConfig` になること
  8. `serde` feature 有効時のみ `SipEventPayload` が `Serialize` を実装すること
* **計装方法・観測対象:** 各 feature 組み合わせのビルド時間とバイナリサイズ。`cargo tree --features full` での依存ツリー確認。

#### チケット M19-3: metrics カウンター配線実装

* **参照設計書:** docs/rust-sip-client-rfc.md (§34.2)
* **対象不変条件 / 規範:** §34.2「以下の counters/gauges を optional feature `metrics` で提供する」: `active_calls`, `registered_accounts`, `audio_tap_overflows_total`, `dtmf_sent_total`, `dtmf_received_total`, `ice_failures_total`, `transport_reconnects_total`, `raw_sip_messages_total`。
* **実装の背景と目的:** `metrics` feature 有効時に、crate 全体の運用状態を監視するためのカウンター/ゲージを提供する。これにより Grafana 等の監視ダッシュボードとの統合が可能になる。feature 無効時はゼロオーバーヘッドとする。
* **実装スコープ:**
  - `src/metrics/` モジュール（`#[cfg(feature = "metrics")]`）:
    - `static METRICS: MetricsRegistry` — グローバルメトリクスレジストリ
    - 8つのカウンター/ゲージの定義:
      - `active_calls: Gauge` — SipClient インスタンスの `call_count()` を定期反映（rector ループ内で更新）
      - `registered_accounts: Gauge` — 登録済みアカウント数（`RegistrationState::Registered` の count）
      - `audio_tap_overflows_total: Counter` — `AudioWorkerTask` の Tap oldest-drop 発生回数
      - `dtmf_sent_total: Counter` — DTMF 送信成功回数（`DtmfSent` イベント発火時）
      - `dtmf_received_total: Counter` — DTMF 受信回数（`DtmfReceived` イベント発火時）
      - `ice_failures_total: Counter` — ICE negotiation 失敗回数
      - `transport_reconnects_total: Counter` — TCP/TLS トランスポート再接続回数
      - `raw_sip_messages_total: Counter` — RawSIP メッセージの送受信件数
  - 各カウンターのインクリメント/ゲージ更新を既存チケットの実装に横断的に組み込む:
    - **active_calls**: M11-3（Reactor の `add_call`/`remove_call` 処理内）
    - **registered_accounts**: M11-3（`RegistrationState` が `Registered` に遷移/離脱したタイミング）
    - **audio_tap_overflows_total**: M16-1（`Realtime` モードの oldest-drop 発生箇所）
    - **dtmf_sent_total / dtmf_received_total**: M13-2（`send_dtmf` 成功時 / `DtmfReceived` イベント発火時）
    - **ice_failures_total**: M17-3（`on_ice_transport_error` callback 内）
    - **transport_reconnects_total**: M17-3（`on_transport_state` callback での再接続検出時）
    - **raw_sip_messages_total**: M17-3（RawSIP イベント発行時）
* **テストコードによる検証（CI で自動化）:**
  1. `metrics` feature 無効時、metrics モジュールがコンパイルされないこと（`cargo check` で metrics シンボルが未定義であること）
  2. `metrics` feature 有効時、`cargo test --features metrics` が成功すること
  3. 各カウンターの初期値が 0 であること
  4. `active_calls` gauge: `add_call` → 1 増加、`remove_call` → 1 減少
  5. `dtmf_sent_total`: `send_dtmf` 成功毎に 1 増加
  6. `dtmf_received_total`: `DtmfReceived` イベント発火毎に 1 増加
  7. `audio_tap_overflows_total`: Tap oldest-drop 発生毎に 1 増加（M16-1 のテストと連動）
  8. 全カウンターが `u64` 範囲でオーバーフローしないこと
* **計装方法・観測対象:** 8つのカウンター/ゲージの値が実運用で正確に反映されること（metrics エンドポイントからの読み出し確認）。

---

## フェーズ10: 統合・受け入れ（Layer 3-4）

> **外部依存:** Docker, Asterisk, FreeSWITCH, PJSIP 2.17。本番環境相当の SIP サーバとの結合試験。

### マイルストーン M20: 統合テスト・受け入れ基準検証

> **DB:** N/A（実 SIP サーバを使用）

#### チケット M20-1: Layer 3 結合テスト — ローカルSIPサーバ + Docker

* **参照設計書:** docs/rust-sip-client-rfc.md (§43.3, §43.1, §43.2)
* **対象不変条件 / 規範:** §43.3 Layer 3 SIP Integration Tests。§43.1 Layer 1 Unit Tests。§43.2 Layer 2 State-Machine Tests（M9〜M11 で MockBackend 使用のテストとして実装済みであることを確認）。§44 CI/CD 要件。
* **実装の背景と目的:** 実際の PJSUA 経由で SIP プロトコルレベルの結合試験を実施する。Docker で起動した Asterisk / FreeSWITCH を相手に、REGISTER/INVITE/BYE/DTMF/ICE/TURN の基本フローを検証する。PJSIP の初期化が必要なため `#[ignore]` 属性を付与し、CI でのみ実行する。
* **実装スコープ:**
  - `tests/integration/` ディレクトリを作成し、以下のテストファイルを配置:
    - `tests/integration/register.rs` — REGISTER 認証成功・失敗・再登録タイマー
    - `tests/integration/call.rs` — INVITE/BYE 正常切断・cancel
    - `tests/integration/provisional.rs` — 180 Ringing / 183 Early Media の provisional response handling
    - `tests/integration/dtmf.rs` — DTMF send/receive（Inband / SIP INFO / RFC4733）
    - `tests/integration/account.rs` — unregister/re-register、dual account simultaneous call
    - `tests/integration/media.rs` — TURN/ICE negotiation、media loopback（audio tap の sign 確認）
  - `tests/common/mod.rs` — SIP サーバのセットアップ・ティアダウン共通コード
  - Docker Compose ファイル（`tests/docker/docker-compose.yml`）— Asterisk + FreeSWITCH の起動設定
  - 各テストに `#[ignore]` 属性を付与（CI でのみ `--ignored` で実行）
  - `tests/integration/main.rs` — 統合テストのエントリポイント
* **テストコードによる検証:**
  1. REGISTER 成功 → `RegistrationState::Registered` に遷移、`RegistrationSucceeded` イベント発火
  2. REGISTER 認証失敗（誤パスワード）→ `RegistrationState::Failed`、`RegistrationFailed` イベント発火
  3. INVITE → `OutgoingCallStarted` → `Trying` → `Ringing` → `CallConnected`
  4. BYE → `CallDisconnected` イベント発火
  5. CANCEL → `CallCancelled` イベント発火（Ringing 中に hangup）
  6. DTMF RFC4733 send → `DtmfSent` イベント発火、受信側で `DtmfReceived` 発火
  7. 2アカウント同時通話 → 両方独立して通話状態が遷移すること
  8. AudioTap → 受信した `AudioChunkPair` の `in_chunk` / `out_chunk` が非ゼロであること（メディアループバック）
  9. TURN 経由の ICE negotiation 成功（FreeSWITCH + coturn 使用）
  10. shutdown → 全 call 正常切断、全 account unregister
* **計装方法・観測対象:** 各テストの実行時間。SIP メッセージの送受信ログ（`tracing::debug!` 出力）。テスト失敗時の SIP trace 保存。
* **ユーザによる手動テスト手順:**
  1. Docker 環境を準備: `docker compose -f tests/docker/docker-compose.yml up -d`
  2. 統合テストを実行: `cargo test -p siprs -- --ignored --test-threads=1`
  3. テスト完了後: `docker compose -f tests/docker/docker-compose.yml down`
  4. 全テストが PASS することを確認する。FAIL がある場合は SIP trace を確認し、RFC の仕様との差異を調査する。

#### チケット M20-2: Layer 4 相互接続試験 — 実 PBX / Proxy（P0）

* **参照設計書:** docs/rust-sip-client-rfc.md (§43.4)
* **対象不変条件 / 規範:** §43.4 相互接続試験。P0 は 1.0 リリース前に完了必須。Asterisk (LTS) と FreeSWITCH の P0 項目。
* **実装の背景と目的:** 実運用で使用される主要 SIP PBX との相互接続性を保証する。P0 項目（Asterisk LTS、FreeSWITCH）は本 crate の 1.0 リリース前に完了が必須。
* **実装スコア（テストケース定義）:**
  - `tests/interop/asterisk.rs` — Asterisk (LTS) との相互接続試験
    - REGISTER（認証成功）
    - INVITE / BYE（正常切断）
    - DTMF (RFC4733) send/receive
    - Opus / PCMU codec negotiation
    - Hold / Unhold
    - Blind Transfer
    - SRTP (SDES)
  - `tests/interop/freeswitch.rs` — FreeSWITCH との相互接続試験
    - REGISTER（認証成功）
    - INVITE / BYE（正常切断）
    - DTMF (SIP INFO) send/receive
    - Opus / PCMU codec negotiation
    - ICE / TURN negotiation
  - P1 項目（OpenSIPS, Kamailio, 3CX）はテストケース定義のみ行い、実装は 1.0 以降に延期することを明記
* **計装方法・観測対象:** 各 PBX との相互接続試験結果マトリクス。SIP トレースの保存。ICE candidate 交換の成功/失敗統計。
* **ユーザによる手動テスト手順:**
  1. 対象 PBX を起動（またはクラウドインスタンスを準備）
  2. `tests/interop/` 下の各テストを実行: `cargo test -p siprs -- --ignored --test asterisk`
  3. 全 P0 項目が PASS することを確認する。
  4. PASS/FAIL の結果を `docs/interop-matrix.md` に記録する。
  5. FAIL 項目がある場合は RFC 設計を見直し、PJSUA の制約か siprs の実装バグかを切り分ける。

#### チケット M20-3: 受け入れ基準検証・リリース判定

* **参照設計書:** docs/rust-sip-client-rfc.md (§50, §43.5, §44)
* **対象不変条件 / 規範:** §50 受け入れ基準（全10項目）。§43.5 プラットフォームテスト。§44 CI/CD 要件。§46 panic policy。
* **実装の背景と目的:** RFC §50 で定義された全受け入れ基準の充足を確認し、crate のリリース可否を判定する。全テスト（Layer 1〜4）の通過、3 OS でのビルド成功、全 feature flag 組み合わせのコンパイルチェックを最終確認する。
* **実装スコープ（チェックリスト）:**
  1. **3 OS ビルド成功**（macOS arm64, Ubuntu x86_64, Windows x86_64）
  2. **PJSUA バインディング自動生成**（bindgen 生成の再現性確認）
  3. **prebuilt 優先・source build fallback** が機能すること
  4. **複数 account の独立 register/unregister** が動作すること
  5. **未登録アカウントで発信可能** であること（`allow_outbound_without_register = true`）
  6. **UDP/TCP/TLS, SRTP, ICE/STUN/TURN** が設定通り動作すること
  7. **PCMU/Opus のみ交渉** されること（他 codec が無効化されていること）
  8. **DTMF 3方式の送受信イベント** が得られること（Inband / SIP INFO / RFC4733）
  9. **全列挙イベント** が発火すること（`SipEventPayload` の全バリアントの到達性確認）
  10. **`AudioChunkPair` が format guarantee 付きで取得** できること
  11. **複数 audio source の同時注入・切替** が通話中に行えること
  12. **全 API が `Result<T, SipError>` で統一** されること（コンパイル時検証）
  13. **`SipClient: Send + Sync`** が成立すること（コンパイル時検証）
  - CI マトリクス（§44）:
    - `windows-latest`, `macos-14`, `ubuntu-22.04`
    - features: `default`, `tls`, `srtp`, `tls+srtp`
    - job: `cargo test`, `cargo check --all-features`, integration smoke test
* **計装方法・観測対象:** 全受け入れ基準の PASS/FAIL マトリクス。カバレッジレポート（`cargo tarpaulin` 等）。`cargo deny` による依存クレートのライセンス・セキュリティ監査。
* **ユーザによる手動テスト手順:**
  1. CI で全受け入れ基準の自動チェックを実行する。
  2. 手動で確認が必要な項目（実 PBX との相互接続等）は M20-2 の結果を参照する。
  3. 全項目 PASS をもってリリース判定とする。
  4. リリース前の最終確認として `make test-all`（全テスト + 全 feature 組み合わせ）を実行する。
