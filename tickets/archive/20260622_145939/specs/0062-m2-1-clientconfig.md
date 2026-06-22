---
ticket_id: 62
title: "M2-1: ClientConfig / ClientAudioConfig / TimeoutConfig / RawSipEventConfig 定義と Default 実装"
slug: m2-1-clientconfig
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0062-m2-1-clientconfig/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0062-m2-1-clientconfig/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0062-m2-1-clientconfig/plan.md
---
# M2-1: ClientConfig / ClientAudioConfig / TimeoutConfig / RawSipEventConfig 定義と Default 実装

## Summary

`SipClient::new()` の単一引数となる設定型 `ClientConfig` を定義する。全サブシステムの初期化パラメータを集約し、`Default` で安全な既定値を提供する（RFC §10, §10.1）。

以下のファイルを新規作成・修正し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/src/config.rs` — 新規：ClientConfig + ClientAudioConfig + LogLevel + TimeoutConfig + RawSipEventConfig + ResamplerQuality + Default impl + テスト
- `crates/siprs/src/lib.rs` — 修正：`pub mod config;` 追加、コメント更新

## Background

### RFC 準拠

RFC §10（ClientConfig 完全仕様）に完全準拠する。§10.1（既定値）の全フィールドを Default impl に反映する。§42 の容量制約（event_bus_capacity ≥ 16, raw_sip_event_capacity ≥ event_bus_capacity 等）はバリデーション（M3-1）で実施。

### 既存チケットからの依存関係

- `AudioFormat` / `SampleRate` / `BitDepth` / `ChannelLayout`（M1-1）→ `ClientAudioConfig::default_delivery_format` で使用
- `TransportConfig`（M1-3）→ `ClientConfig::transports` で使用
- `IceConfig` / `StunServerConfig` / `TurnServerConfig`（M1-4）→ `ClientConfig::ice` / `stun_servers` / `turn_servers` で使用

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M2-2 | AccountConfig — 同 config.rs に追記 |
| M2-3 | TlsConfig / ReconnectPolicy 等 — 同 config.rs に追記 |
| M3-1 | ClientConfig バリデーション |
| M12-2 | SipClient::new() — ClientConfig を引数として受け取る |

## Scope

### 1. `crates/siprs/src/config.rs`（新規）

```rust
//! # 設定型
//!
//! 各種設定構造体を定義する。RFC §10（ClientConfig 完全仕様）に準拠する。
//! サブモジュールを統合する facade として機能し、transport モジュールの
//! 型を再公開する。

use std::time::Duration;

use crate::audio::format::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
pub use crate::transport::{
    IceConfig, StunServerConfig, TransportConfig, TurnServerConfig, TurnTransport,
};

// ---------------------------------------------------------------------------
// LogLevel
// ---------------------------------------------------------------------------

/// ログレベル。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
}

// ---------------------------------------------------------------------------
// ResamplerQuality
// ---------------------------------------------------------------------------

/// リサンプラ品質。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResamplerQuality {
    Low,
    Medium,
    High,
}

// ---------------------------------------------------------------------------
// TimeoutConfig
// ---------------------------------------------------------------------------

/// タイムアウト設定。
#[derive(Debug, Clone)]
pub struct TimeoutConfig {
    /// コマンド実行タイムアウト（既定: 10 秒）
    pub command_timeout: Duration,
    /// シャットダウン完了待機タイムアウト（既定: 15 秒）
    pub shutdown_timeout: Duration,
    /// SIP 登録タイムアウト（既定: 15 秒）
    pub register_timeout: Duration,
    /// INVITE 発信タイムアウト（既定: 90 秒）
    pub invite_timeout: Duration,
}

impl Default for TimeoutConfig {
    /// §10.1 既定値によるタイムアウト設定を返す。
    fn default() -> Self {
        Self {
            command_timeout: Duration::from_secs(10),
            shutdown_timeout: Duration::from_secs(15),
            register_timeout: Duration::from_secs(15),
            invite_timeout: Duration::from_secs(90),
        }
    }
}

// ---------------------------------------------------------------------------
// RawSipEventConfig
// ---------------------------------------------------------------------------

/// Raw SIP イベント設定。
#[derive(Debug, Clone)]
pub struct RawSipEventConfig {
    /// Raw SIP イベントを有効にするかどうか（既定: true）
    pub enabled: bool,
    /// SIP メッセージボディを含めるかどうか（既定: true）
    pub include_bodies: bool,
    /// 最大ボディサイズ（バイト）（既定: 64KB）
    pub max_body_bytes: usize,
    /// Authorization ヘッダーを伏せるかどうか（既定: true）
    pub redact_authorization: bool,
}

impl Default for RawSipEventConfig {
    /// §10.1 既定値による Raw SIP イベント設定を返す。
    fn default() -> Self {
        Self {
            enabled: true,
            include_bodies: true,
            max_body_bytes: 64 * 1024,
            redact_authorization: true,
        }
    }
}

// ---------------------------------------------------------------------------
// ClientAudioConfig
// ---------------------------------------------------------------------------

/// 音声設定。
#[derive(Debug, Clone)]
pub struct ClientAudioConfig {
    /// 既定の音声デリバリフォーマット（既定: 16kHz/I16/StereoInOut/20ms）
    pub default_delivery_format: AudioFormat,
    /// ペアバッファ時間長（ms）（既定: 120ms）
    pub pair_buffer_ms: u32,
    /// ジッタバッファ時間長（ms）（既定: 60ms）
    pub jitter_buffer_ms: u32,
    /// ミキサーフレーム長（ms）（既定: 20ms）
    pub mixer_frame_ms: u32,
    /// 1 通話あたりの最大音声ソース数（既定: 16）
    pub max_sources_per_call: usize,
    /// リサンプラ品質（既定: High）
    pub resampler_quality: ResamplerQuality,
}

impl Default for ClientAudioConfig {
    /// §10.1 既定値による音声設定を返す。
    fn default() -> Self {
        Self {
            default_delivery_format: AudioFormat {
                sample_rate: SampleRate::Hz16000,
                bit_depth: BitDepth::I16,
                channel_layout: ChannelLayout::StereoInOut,
                frame_ms: 20,
            },
            pair_buffer_ms: 120,
            jitter_buffer_ms: 60,
            mixer_frame_ms: 20,
            max_sources_per_call: 16,
            resampler_quality: ResamplerQuality::High,
        }
    }
}

// ---------------------------------------------------------------------------
// ClientConfig
// ---------------------------------------------------------------------------

/// SIP クライアントの全体設定。
///
/// `SipClient::new()` の単一引数となる。全サブシステムの初期化パラメータを
/// 集約し、`Default` で安全な既定値を提供する。
#[derive(Debug, Clone)]
pub struct ClientConfig {
    /// User-Agent 文字列（既定: "tauri-siprs/0.1"）
    pub user_agent: String,
    /// ログレベル（既定: Info）
    pub log_level: LogLevel,
    /// 最大同時通話数（既定: 32）
    pub max_calls: u32,
    /// イベントバス容量（既定: 2048）
    pub event_bus_capacity: usize,
    /// Raw SIP イベント容量（既定: 4096）
    pub raw_sip_event_capacity: usize,
    /// 音声設定
    pub audio: ClientAudioConfig,
    /// トランスポート設定一覧
    pub transports: Vec<TransportConfig>,
    /// STUN サーバー設定一覧
    pub stun_servers: Vec<StunServerConfig>,
    /// TURN サーバー設定一覧
    pub turn_servers: Vec<TurnServerConfig>,
    /// ICE 設定
    pub ice: IceConfig,
    /// Raw SIP イベント設定
    pub raw_sip_events: RawSipEventConfig,
    /// タイムアウト設定
    pub timeouts: TimeoutConfig,
}

impl Default for ClientConfig {
    /// RFC §10.1 完全準拠の既定値を返す。
    fn default() -> Self {
        Self {
            user_agent: "tauri-siprs/0.1".into(),
            log_level: LogLevel::Info,
            max_calls: 32,
            event_bus_capacity: 2048,
            raw_sip_event_capacity: 4096,
            audio: ClientAudioConfig::default(),
            transports: vec![TransportConfig::udp(5060), TransportConfig::tcp(5060)],
            stun_servers: vec![],
            turn_servers: vec![],
            ice: IceConfig::default(),
            raw_sip_events: RawSipEventConfig::default(),
            timeouts: TimeoutConfig::default(),
        }
    }
}
```

**設計判断**:
- `config.rs` は `pub use crate::transport::{...}` で transport モジュールの型を再公開する。利用者は `crate::config::TransportConfig` のように config モジュール経由でアクセスできる
- `Display` は `LogLevel` のみ実装（RFC にお Equivalent な要求なし）
- `ClientConfig` は `Default` のみ提供（Builder パターンは現在不要）
- `transports` の `vec![]` は RFC 上「空は許可しない」という文脈もあるが、既定値として UDP:5060 / TCP:5060 の 2 トランスポートを設定する。バリデーション（M3-1）で空チェック

### 2. `crates/siprs/src/lib.rs`（修正）

```rust
pub mod audio;
pub mod config;
pub mod error;
pub mod transport;
pub mod util;
```

（`pub mod config;` を `audio` と `error` の間に追加。コメント行 `// pub mod config; // M1-3: ...` を削除または更新）

## Non-scope

- `AccountConfig` / `AccountCodecPolicy` / `OpusConfig` / `AccountMediaConfig` / `DtmfPolicy` — M2-2
- `ReconnectPolicy` / `CallMediaPreferences` / `OutgoingCallRequest` / `NegotiatedCodec` / `CodecSelectionPolicy` — M2-3
- 設定バリデーション — M3-1
- `SipClient::new()` の実装 — M12-2
- `LogLevel` に `Display` / `as_str()` 以外のメソッド（フィルタリング等）— 後続検討事項

## Test Plan

### ユニットテスト計画（config.rs）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_client_config_default_user_agent` | user_agent == "tauri-siprs/0.1" |
| 2 | `test_client_config_default_log_level` | log_level == Info |
| 3 | `test_client_config_default_max_calls` | max_calls == 32 |
| 4 | `test_client_config_default_event_bus_capacity` | event_bus_capacity == 2048 |
| 5 | `test_client_config_default_raw_sip_event_capacity` | raw_sip_event_capacity == 4096 |
| 6 | `test_client_config_default_audio` | audio が ClientAudioConfig::default() と一致 |
| 7 | `test_client_config_default_transports` | transports が vec![udp:5060, tcp:5060] |
| 8 | `test_client_config_default_stun_empty` | stun_servers が空 |
| 9 | `test_client_config_default_turn_empty` | turn_servers が空 |
| 10 | `test_client_config_default_ice` | ice が IceConfig::default() と一致 |
| 11 | `test_client_config_default_raw_sip_events` | raw_sip_events が RawSipEventConfig::default() と一致 |
| 12 | `test_client_config_default_timeouts` | timeouts が TimeoutConfig::default() と一致 |
| 13 | `test_client_audio_config_default_delivery_format` | default_delivery_format が 16kHz/I16/StereoInOut/20ms |
| 14 | `test_client_audio_config_default_values` | pair_buffer 120ms, jitter 60ms, mixer 20ms, max_sources 16, resampler High |
| 15 | `test_timeout_config_default` | 各 timeout が RFC 10.1 既定値と一致（10s/15s/15s/90s） |
| 16 | `test_raw_sip_event_config_default` | enabled=true, include_bodies=true, max_body_bytes=65536, redact_auth=true |
| 17 | `test_log_level_clone_copy_eq` | LogLevel が Clone + Copy + PartialEq + Eq |
| 18 | `test_resampler_quality_clone_copy_eq` | ResamplerQuality が Clone + Copy + PartialEq + Eq |
| 19 | `test_client_config_clone_debug` | ClientConfig の Clone / Debug がパニックしない |
| 20 | `test_client_config_send_sync` | ClientConfig が Send + Sync のコンパイル時確認 |

### ユニットテスト不可能な項目（例外）

- なし（全テストがメモリ内完結、外部依存なし）

## Boy Scout Rule — 翻訳可能性計画

- `Default` impl の全フィールド値に doc comment で既定値を明示（例: `/// イベントバス容量（既定: 2048）`）
- RFC セクション番号を doc comment に明記し、トレーサビリティを確保
- `config.rs` に `pub use crate::transport::{...}` で再公開パスを明確化

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存テスト含む）
- [ ] RFC §10 の ClientConfig が全 12 フィールド + Default で定義済み
- [ ] RFC §10 の ClientAudioConfig（6 フィールド）+ Default が定義済み
- [ ] LogLevel enum（Error/Warn/Info/Debug/Trace）が定義済み
- [ ] ResamplerQuality enum（Low/Medium/High）が定義済み
- [ ] TimeoutConfig（4 フィールド）+ Default が定義済み
- [ ] RawSipEventConfig（4 フィールド）+ Default が定義済み
- [ ] ClientConfig::default() が §10.1 と完全一致すること
- [ ] 全型が `Clone + Debug + Send + Sync` であること
- [ ] `lib.rs` に `pub mod config;` が追加されていること
- [ ] config.rs が transport 配下の型を `pub use` で再公開していること

## Notes

### ファイル責務の明確化

`config.rs` は設定型の定義のみを行う facade モジュールとして設計する。バリデーションロジックは M3-1（`src/config/validation.rs` または独立モジュール）に分離する。

### Default と Builder の選択

現時点では `Default` のみ提供する。`ClientConfig` のフィールド数が多く、一部フィールド（`user_agent` 等）はほぼ常に上書きされることが予想されるが、Builder パターンの導入はフィールド拡大の実績が十分に蓄積されてから判断する。それまでは struct リテラルでの部分上書き（`ClientConfig { user_agent: "my-app/1.0".into(), ..Default::default() }`）を推奨する。
