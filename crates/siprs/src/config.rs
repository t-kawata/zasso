//! # 設定型
//!
//! 各種設定構造体を定義する。RFC §10（ClientConfig 完全仕様）に準拠する。
//! サブモジュールを統合する facade として機能し、transport モジュールの
//! 型を再公開する。

use std::time::Duration;

use secrecy::SecretString;

use crate::audio::format::{AudioFormat, BitDepth, ChannelLayout, SampleRate};
pub use crate::transport::{
    IceConfig, StunServerConfig, TransportConfig, TransportKind, TurnServerConfig, TurnTransport,
};

#[cfg(feature = "tls")]
pub use crate::transport::TlsConfig;

// ---------------------------------------------------------------------------
// LogLevel
// ---------------------------------------------------------------------------

/// ログレベル。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    /// エラー
    Error,
    /// 警告
    Warn,
    /// 情報
    Info,
    /// デバッグ
    Debug,
    /// トレース
    Trace,
}

// ---------------------------------------------------------------------------
// ResamplerQuality
// ---------------------------------------------------------------------------

/// リサンプラ品質。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResamplerQuality {
    /// 低品質（高速）
    Low,
    /// 中品質
    Medium,
    /// 高品質（低速）
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
    /// RFC §10.1 既定値によるタイムアウト設定を返す。
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
    /// RFC §10.1 既定値による Raw SIP イベント設定を返す。
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
    /// RFC §10.1 既定値による音声設定を返す。
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

// ---------------------------------------------------------------------------
// DtmfMethod
// ---------------------------------------------------------------------------

/// DTMF 送出方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DtmfMethod {
    /// Inband（音声帯域内 DTMF）
    Inband,
    /// SIP INFO メッセージ
    SipInfo,
    /// RFC 4733（RTP イベント）
    Rfc4733,
}

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

/// サポートする音声コーデック。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
    /// G.711 μ-law
    Pcmu,
    /// Opus
    Opus,
}

// ---------------------------------------------------------------------------
// SrtpPolicy
// ---------------------------------------------------------------------------

/// SRTP ポリシー。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SrtpPolicy {
    /// SRTP 無効（既定）
    Disabled,
    /// SRTP 任意（negotiation で有効化可能）
    Optional,
    /// SRTP 必須
    Mandatory,
}

// ---------------------------------------------------------------------------
// AccountTransportPolicy
// ---------------------------------------------------------------------------

/// アカウントのトランスポート選択ポリシー。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccountTransportPolicy {
    /// 既定のトランスポート（ClientConfig の transports から選択）
    Default,
    /// 指定トランスポートを優先
    Prefer(TransportKind),
    /// 指定トランスポートのみ
    Only(TransportKind),
}

// ---------------------------------------------------------------------------
// OpusConfig
// ---------------------------------------------------------------------------

/// Opus コーデック設定。
#[derive(Debug, Clone, PartialEq)]
pub struct OpusConfig {
    /// ビットレート（bps）（既定: 32000）
    pub bitrate: u32,
    /// エンコーダ複雑度（0–10）（既定: 10）
    pub complexity: u8,
    /// 固定ビットレート（既定: false）
    pub cbr: bool,
    /// In-band FEC（既定: true）
    pub inband_fec: bool,
    /// Discontinuous Transmission（既定: false）
    pub dtx: bool,
    /// フレーム長（ms）（既定: 20）
    pub ptime_ms: u16,
}

// ---------------------------------------------------------------------------
// AccountCodecPolicy
// ---------------------------------------------------------------------------

/// アカウントのコーデック選択ポリシー。
#[derive(Debug, Clone)]
pub struct AccountCodecPolicy {
    /// PCMU を有効にする（既定: true）
    pub enable_pcmu: bool,
    /// Opus を有効にする（既定: true）
    pub enable_opus: bool,
    /// Opus 詳細設定
    pub opus: OpusConfig,
}

impl AccountCodecPolicy {
    /// 音声通話向け既定コーデック設定（Opus + PCMU 有効）を返す。
    pub fn default_voice() -> Self {
        Self {
            enable_pcmu: true,
            enable_opus: true,
            opus: OpusConfig {
                bitrate: 32000,
                complexity: 10,
                cbr: false,
                inband_fec: true,
                dtx: false,
                ptime_ms: 20,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// DtmfPolicy
// ---------------------------------------------------------------------------

/// DTMF ポリシー。
#[derive(Debug, Clone)]
pub struct DtmfPolicy {
    /// 送信可能な DTMF 方式一覧
    pub send_methods: Vec<DtmfMethod>,
    /// 受信可能な DTMF 方式一覧
    pub receive_methods: Vec<DtmfMethod>,
    /// 既定の送信方式
    pub default_send_method: DtmfMethod,
}

impl DtmfPolicy {
    /// 全 DTMF 方式を有効にしたポリシーを返す。
    pub fn all_methods() -> Self {
        Self {
            send_methods: vec![DtmfMethod::Inband, DtmfMethod::SipInfo, DtmfMethod::Rfc4733],
            receive_methods: vec![DtmfMethod::Inband, DtmfMethod::SipInfo, DtmfMethod::Rfc4733],
            default_send_method: DtmfMethod::Rfc4733,
        }
    }
}

// ---------------------------------------------------------------------------
// AccountMediaConfig
// ---------------------------------------------------------------------------

/// アカウントのメディア設定。
#[derive(Debug, Clone)]
pub struct AccountMediaConfig {
    /// SRTP ポリシー（既定: Disabled）
    pub srtp: SrtpPolicy,
    /// ICE を有効にする（既定: true）
    pub ice: bool,
    /// VAD を有効にする（既定: true）
    pub vad: bool,
    /// エコーキャンセルテール長（ms）（既定: 256）
    pub ec_tail_ms: u16,
    /// 入力ゲイン（dB）（既定: 0.0）
    pub input_gain_db: f32,
    /// 出力ゲイン（dB）（既定: 0.0）
    pub output_gain_db: f32,
}

impl Default for AccountMediaConfig {
    /// RFC §48 既定値によるメディア設定を返す。
    fn default() -> Self {
        Self {
            srtp: SrtpPolicy::Disabled,
            ice: true,
            vad: true,
            ec_tail_ms: 256,
            input_gain_db: 0.0,
            output_gain_db: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// AuthOverride
// ---------------------------------------------------------------------------

/// 認証オーバーライド設定。
///
/// 特定アカウントの認証情報を動的に上書きするための設定。
/// 詳細は M13-1（`update_config`）で拡張予定。
#[derive(Debug, Clone)]
pub struct AuthOverride {
    // 後続チケット M13-1 でフィールド追加予定
}

// ---------------------------------------------------------------------------
// AccountConfigPatch
// ---------------------------------------------------------------------------

/// アカウント設定の部分更新用パッチ。
///
/// 全フィールドが `Option<T>` となっており、`Some` のフィールドのみが
/// 更新される。`Default` は全フィールド `None`（何も変更しない）。
#[derive(Debug, Clone, Default)]
pub struct AccountConfigPatch {
    pub display_name: Option<Option<String>>,
    pub username: Option<String>,
    pub auth_username: Option<Option<String>>,
    pub password: Option<SecretString>,
    pub domain: Option<String>,
    pub registrar_uri: Option<Option<String>>,
    pub outbound_proxy: Option<Vec<String>>,
    pub contact_params: Option<Vec<(String, String)>>,
    pub transport: Option<AccountTransportPolicy>,
    pub register_on_start: Option<bool>,
    pub allow_outbound_without_register: Option<bool>,
    pub registration_expires: Option<Duration>,
    pub codecs: Option<AccountCodecPolicy>,
    pub dtmf: Option<DtmfPolicy>,
    pub media: Option<AccountMediaConfig>,
    pub headers: Option<Vec<(String, String)>>,
}

// ---------------------------------------------------------------------------
// AccountConfig
// ---------------------------------------------------------------------------

/// SIP アカウント設定。
///
/// RFC §11 に完全準拠する。パスワードは `SecretString` で保持され、
/// Debug 出力では自動的にマスクされる。
#[derive(Debug, Clone)]
pub struct AccountConfig {
    /// 表示名（任意）
    pub display_name: Option<String>,
    /// 認証ユーザー名
    pub username: String,
    /// 認証ユーザー名（上書き用、任意）
    pub auth_username: Option<String>,
    /// パスワード（`SecretString` で保護され Debug 出力でマスク）
    pub password: SecretString,
    /// ドメイン
    pub domain: String,
    /// 登録先 URI（任意、未指定時は sip:{domain} を自動導出）
    pub registrar_uri: Option<String>,
    /// アウトバウンドプロキシ一覧
    pub outbound_proxy: Vec<String>,
    /// コンタクトパラメータ一覧
    pub contact_params: Vec<(String, String)>,
    /// トランスポート選択ポリシー
    pub transport: AccountTransportPolicy,
    /// 起動時に登録を行うかどうか（既定: false）
    pub register_on_start: bool,
    /// 未登録でも発信を許可するかどうか（既定: true）
    pub allow_outbound_without_register: bool,
    /// 登録有効期限（既定: 300 秒）
    pub registration_expires: Duration,
    /// コーデック選択ポリシー
    pub codecs: AccountCodecPolicy,
    /// DTMF ポリシー
    pub dtmf: DtmfPolicy,
    /// メディア設定
    pub media: AccountMediaConfig,
    /// カスタム SIP ヘッダー
    pub headers: Vec<(String, String)>,
}

// ---------------------------------------------------------------------------
// CallMediaPreferences
// ---------------------------------------------------------------------------

/// 通話メディア設定。
#[derive(Debug, Clone)]
pub struct CallMediaPreferences {
    /// Early media を有効にする（既定: true）
    pub enable_early_media: bool,
    /// SRTP を有効にする（None でアカウント設定に従う）
    pub enable_srtp: Option<bool>,
    /// 優先コーデック一覧（PCMU / Opus のみ受理、他は validation error）
    pub preferred_codecs: Vec<Codec>,
}

// ---------------------------------------------------------------------------
// OutgoingCallRequest
// ---------------------------------------------------------------------------

/// 発信通話リクエスト。
#[derive(Debug, Clone)]
pub struct OutgoingCallRequest {
    /// 発信先 URI（例: "sip:user@domain.com"）
    pub target_uri: String,
    /// カスタム SIP ヘッダー
    pub headers: Vec<(String, String)>,
    /// 認証オーバーライド
    pub auth_override: Option<AuthOverride>,
    /// 優先トランスポート（None でアカウント設定に従う）
    pub preferred_transport: Option<TransportKind>,
    /// メディア設定
    pub media: CallMediaPreferences,
    /// Refer を自動応答する（既定: false）
    pub auto_answer_refer: bool,
}

// ---------------------------------------------------------------------------
// NegotiatedCodec
// ---------------------------------------------------------------------------

/// SDP negotiation 後に確定した使用コーデック。
#[derive(Debug, Clone, PartialEq)]
pub enum NegotiatedCodec {
    /// PCMU (G.711 μ-law) / 8000Hz / 1ch
    Pcmu,
    /// Opus / 48000Hz / 2ch
    Opus(OpusConfig),
}

// ---------------------------------------------------------------------------
// CodecSelectionPolicy
// ---------------------------------------------------------------------------

/// コーデック選択ポリシー。
///
/// `CallMediaPreferences` から派生し、negotiation 時の振る舞いを決定する。
#[derive(Debug, Clone, Default)]
pub enum CodecSelectionPolicy {
    /// 設定された優先順位で交渉し、最初に合意したコーデックを採用する。
    /// 全コーデックが拒否された場合は MediaNegotiationFailed。
    Ordered,
    /// Opus を優先試行し、Opus が拒否された場合のみ PCMU にフォールバックする。
    /// 既定のポリシー。
    #[default]
    PreferOpusFallbackPcmu,
}

// ---------------------------------------------------------------------------
// ReconnectPolicy
// ---------------------------------------------------------------------------

/// トランスポート再接続ポリシー。
#[derive(Debug, Clone)]
pub struct ReconnectPolicy {
    /// 基本遅延（既定: 1 秒）
    pub base_delay: Duration,
    /// 最大遅延（既定: 60 秒）
    pub max_delay: Duration,
    /// ジッター比率（0.0–1.0）（既定: 0.5）
    pub jitter_ratio: f32,
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::format::ChannelLayout;

    // -----------------------------------------------------------------------
    // ClientConfig — default values
    // -----------------------------------------------------------------------

    /// Default の user_agent が "tauri-siprs/0.1" であることを確認する。
    #[test]
    fn test_client_config_default_user_agent() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.user_agent, "tauri-siprs/0.1");
    }

    /// Default の log_level が Info であることを確認する。
    #[test]
    fn test_client_config_default_log_level() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.log_level, LogLevel::Info);
    }

    /// Default の max_calls が 32 であることを確認する。
    #[test]
    fn test_client_config_default_max_calls() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.max_calls, 32);
    }

    /// Default の event_bus_capacity が 2048 であることを確認する。
    #[test]
    fn test_client_config_default_event_bus_capacity() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.event_bus_capacity, 2048);
    }

    /// Default の raw_sip_event_capacity が 4096 であることを確認する。
    #[test]
    fn test_client_config_default_raw_sip_event_capacity() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.raw_sip_event_capacity, 4096);
    }

    /// Default の audio が ClientAudioConfig::default() と一致することを確認する。
    #[test]
    fn test_client_config_default_audio() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.audio.default_delivery_format.sample_rate, SampleRate::Hz16000);
        assert_eq!(cfg.audio.pair_buffer_ms, 120);
    }

    /// Default の transports が [udp:5060, tcp:5060] であることを確認する。
    #[test]
    fn test_client_config_default_transports() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.transports.len(), 2);
        assert_eq!(cfg.transports[0].bind_addr().port(), 5060);
        assert_eq!(cfg.transports[1].bind_addr().port(), 5060);
    }

    /// Default の stun_servers が空であることを確認する。
    #[test]
    fn test_client_config_default_stun_empty() {
        let cfg = ClientConfig::default();
        assert!(cfg.stun_servers.is_empty());
    }

    /// Default の turn_servers が空であることを確認する。
    #[test]
    fn test_client_config_default_turn_empty() {
        let cfg = ClientConfig::default();
        assert!(cfg.turn_servers.is_empty());
    }

    /// Default の ice が IceConfig::default() と一致することを確認する。
    #[test]
    fn test_client_config_default_ice() {
        let cfg = ClientConfig::default();
        assert!(cfg.ice.enabled);
    }

    /// Default の raw_sip_events が RawSipEventConfig::default() と一致することを確認する。
    #[test]
    fn test_client_config_default_raw_sip_events() {
        let cfg = ClientConfig::default();
        assert!(cfg.raw_sip_events.enabled);
    }

    /// Default の timeouts が TimeoutConfig::default() と一致することを確認する。
    #[test]
    fn test_client_config_default_timeouts() {
        let cfg = ClientConfig::default();
        assert_eq!(cfg.timeouts.command_timeout, Duration::from_secs(10));
    }

    // -----------------------------------------------------------------------
    // ClientAudioConfig
    // -----------------------------------------------------------------------

    /// ClientAudioConfig の既定 delivery format が 16kHz/I16/StereoInOut/20ms であることを確認する。
    #[test]
    fn test_client_audio_config_default_delivery_format() {
        let cfg = ClientAudioConfig::default();
        assert_eq!(cfg.default_delivery_format.sample_rate, SampleRate::Hz16000);
        assert_eq!(cfg.default_delivery_format.bit_depth, BitDepth::I16);
        assert_eq!(cfg.default_delivery_format.channel_layout, ChannelLayout::StereoInOut);
        assert_eq!(cfg.default_delivery_format.frame_ms, 20);
    }

    /// ClientAudioConfig の既定数値パラメータを確認する。
    #[test]
    fn test_client_audio_config_default_values() {
        let cfg = ClientAudioConfig::default();
        assert_eq!(cfg.pair_buffer_ms, 120);
        assert_eq!(cfg.jitter_buffer_ms, 60);
        assert_eq!(cfg.mixer_frame_ms, 20);
        assert_eq!(cfg.max_sources_per_call, 16);
        assert_eq!(cfg.resampler_quality, ResamplerQuality::High);
    }

    // -----------------------------------------------------------------------
    // TimeoutConfig
    // -----------------------------------------------------------------------

    /// TimeoutConfig の各 Duration が RFC §10.1 既定値と一致することを確認する。
    #[test]
    fn test_timeout_config_default() {
        let cfg = TimeoutConfig::default();
        assert_eq!(cfg.command_timeout, Duration::from_secs(10));
        assert_eq!(cfg.shutdown_timeout, Duration::from_secs(15));
        assert_eq!(cfg.register_timeout, Duration::from_secs(15));
        assert_eq!(cfg.invite_timeout, Duration::from_secs(90));
    }

    // -----------------------------------------------------------------------
    // RawSipEventConfig
    // -----------------------------------------------------------------------

    /// RawSipEventConfig の既定値を確認する。
    #[test]
    fn test_raw_sip_event_config_default() {
        let cfg = RawSipEventConfig::default();
        assert!(cfg.enabled);
        assert!(cfg.include_bodies);
        assert_eq!(cfg.max_body_bytes, 64 * 1024);
        assert!(cfg.redact_authorization);
    }

    // -----------------------------------------------------------------------
    // LogLevel / ResamplerQuality
    // -----------------------------------------------------------------------

    /// LogLevel が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_log_level_clone_copy_eq() {
        let level = LogLevel::Info;
        let cloned = level;
        assert_eq!(level, cloned);
        assert_ne!(LogLevel::Info, LogLevel::Error);
    }

    /// ResamplerQuality が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_resampler_quality_clone_copy_eq() {
        let quality = ResamplerQuality::High;
        let cloned = quality;
        assert_eq!(quality, cloned);
        assert_ne!(ResamplerQuality::Low, ResamplerQuality::High);
    }

    // -----------------------------------------------------------------------
    // ClientConfig — 総合
    // -----------------------------------------------------------------------

    /// ClientConfig の Clone / Debug がパニックしないことを確認する。
    #[test]
    fn test_client_config_clone_debug() {
        let cfg = ClientConfig::default();
        let cloned = cfg.clone();
        assert_eq!(cloned.user_agent, "tauri-siprs/0.1");
        let debug_str = format!("{:?}", cloned);
        assert!(!debug_str.is_empty());
    }

    /// ClientConfig が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_client_config_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<ClientConfig>();
        assert_sync::<ClientConfig>();
    }

    // ===================================================================
    // M2-2: AccountConfig 関連
    // ===================================================================

    /// DtmfMethod が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_dtmf_method_clone_copy_eq() {
        let method = DtmfMethod::Inband;
        let cloned = method;
        assert_eq!(method, cloned);
        assert_ne!(DtmfMethod::Inband, DtmfMethod::SipInfo);
    }

    /// Codec が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_codec_clone_copy_eq() {
        let codec = Codec::Opus;
        let cloned = codec;
        assert_eq!(codec, cloned);
        assert_ne!(Codec::Pcmu, Codec::Opus);
    }

    /// SrtpPolicy が Clone + Copy + PartialEq + Eq であることを確認する。
    #[test]
    fn test_srtp_policy_clone_copy_eq() {
        let policy = SrtpPolicy::Disabled;
        let cloned = policy;
        assert_eq!(policy, cloned);
    }

    /// AccountTransportPolicy が Clone + Debug であることを確認する。
    #[test]
    fn test_account_transport_policy_clone() {
        let policy = AccountTransportPolicy::Prefer(TransportKind::Udp);
        let cloned = policy.clone();
        assert_eq!(format!("{:?}", cloned), "Prefer(Udp)");
    }

    /// AccountCodecPolicy::default_voice() が Opus + PCMU 有効であることを確認する。
    #[test]
    fn test_account_codec_policy_default_voice() {
        let policy = AccountCodecPolicy::default_voice();
        assert!(policy.enable_pcmu);
        assert!(policy.enable_opus);
        assert_eq!(policy.opus.bitrate, 32000);
        assert_eq!(policy.opus.complexity, 10);
    }

    /// OpusConfig の各フィールドが正しく設定・取得できることを確認する。
    #[test]
    fn test_opus_config_fields() {
        let opus = OpusConfig {
            bitrate: 64000,
            complexity: 5,
            cbr: true,
            inband_fec: false,
            dtx: true,
            ptime_ms: 40,
        };
        assert_eq!(opus.bitrate, 64000);
        assert_eq!(opus.complexity, 5);
        assert!(opus.cbr);
        assert!(!opus.inband_fec);
        assert!(opus.dtx);
        assert_eq!(opus.ptime_ms, 40);
    }

    /// DtmfPolicy::all_methods() が 3 方式すべてを含むことを確認する。
    #[test]
    fn test_dtmf_policy_all_methods() {
        let policy = DtmfPolicy::all_methods();
        assert_eq!(policy.send_methods.len(), 3);
        assert!(policy.send_methods.contains(&DtmfMethod::Inband));
        assert!(policy.send_methods.contains(&DtmfMethod::SipInfo));
        assert!(policy.send_methods.contains(&DtmfMethod::Rfc4733));
        assert_eq!(policy.default_send_method, DtmfMethod::Rfc4733);
    }

    /// AccountMediaConfig の Default が SRTP disabled であることを確認する。
    #[test]
    fn test_account_media_config_default() {
        let cfg = AccountMediaConfig::default();
        assert_eq!(cfg.srtp, SrtpPolicy::Disabled);
        assert!(cfg.ice);
        assert!(cfg.vad);
        assert_eq!(cfg.ec_tail_ms, 256);
    }

    /// AccountConfig の全フィールドが正しくラウンドトリップすることを確認する。
    #[test]
    fn test_account_config_fields() {
        let cfg = AccountConfig {
            display_name: Some("Test User".into()),
            username: "testuser".into(),
            auth_username: None,
            password: SecretString::new(Box::from("secret")),
            domain: "example.com".into(),
            registrar_uri: Some("sip:example.com".into()),
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Default,
            register_on_start: true,
            allow_outbound_without_register: false,
            registration_expires: Duration::from_secs(600),
            codecs: AccountCodecPolicy::default_voice(),
            dtmf: DtmfPolicy::all_methods(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        };
        assert_eq!(cfg.username, "testuser");
        assert_eq!(cfg.domain, "example.com");
        assert_eq!(cfg.registration_expires, Duration::from_secs(600));
        assert!(cfg.register_on_start);
    }

    /// AccountConfig の password の Debug 出力が "REDACTED" にマスクされることを確認する。
    #[test]
    fn test_account_config_password_redacted() {
        let cfg = AccountConfig {
            display_name: None,
            username: "user".into(),
            auth_username: None,
            password: SecretString::new(Box::from("hunter2")),
            domain: "example.com".into(),
            registrar_uri: None,
            outbound_proxy: vec![],
            contact_params: vec![],
            transport: AccountTransportPolicy::Default,
            register_on_start: false,
            allow_outbound_without_register: true,
            registration_expires: Duration::from_secs(300),
            codecs: AccountCodecPolicy::default_voice(),
            dtmf: DtmfPolicy::all_methods(),
            media: AccountMediaConfig::default(),
            headers: vec![],
        };
        let debug_str = format!("{:#?}", cfg);
        assert!(debug_str.contains("REDACTED"), "Debug output should mask password");
        assert!(!debug_str.contains("hunter2"), "Debug output should not contain raw password");
    }

    /// AccountConfigPatch::default() の全フィールドが None であることを確認する。
    #[test]
    fn test_account_config_patch_default_all_none() {
        let patch = AccountConfigPatch::default();
        // AccountConfigPatch の全フィールドは Option でラップされているため
        // Default で None になることを確認
        assert!(patch.username.is_none());
        assert!(patch.domain.is_none());
        assert!(patch.register_on_start.is_none());
    }

    /// AccountConfigPatch の部分更新が正しく動作することを確認する。
    #[test]
    fn test_account_config_patch_partial_update() {
        let patch = AccountConfigPatch {
            username: Some("newuser".into()),
            ..Default::default()
        };
        assert_eq!(patch.username, Some("newuser".into()));
        assert!(patch.domain.is_none());
    }

    /// AuthOverride が Clone + Debug であることを確認する。
    #[test]
    fn test_auth_override_placeholder() {
        let override_ = AuthOverride {};
        let cloned = override_.clone();
        assert_eq!(format!("{:?}", cloned), "AuthOverride");
    }

    // ===================================================================
    // M2-3: 残り設定型
    // ===================================================================

    /// CallMediaPreferences の各既定値を確認する。
    #[test]
    fn test_call_media_preferences_default() {
        let prefs = CallMediaPreferences {
            enable_early_media: true,
            enable_srtp: None,
            preferred_codecs: vec![],
        };
        assert!(prefs.enable_early_media);
        assert!(prefs.enable_srtp.is_none());
        assert!(prefs.preferred_codecs.is_empty());
    }

    /// OutgoingCallRequest の全フィールドが正しくラウンドトリップすることを確認する。
    #[test]
    fn test_outgoing_call_request_fields() {
        let prefs = CallMediaPreferences {
            enable_early_media: false,
            enable_srtp: Some(true),
            preferred_codecs: vec![Codec::Opus],
        };
        let req = OutgoingCallRequest {
            target_uri: "sip:user@example.com".into(),
            headers: vec![("X-Custom".into(), "value".into())],
            auth_override: None,
            preferred_transport: Some(TransportKind::Udp),
            media: prefs,
            auto_answer_refer: true,
        };
        assert_eq!(req.target_uri, "sip:user@example.com");
        assert_eq!(req.headers.len(), 1);
        assert!(req.auto_answer_refer);
        assert_eq!(req.preferred_transport, Some(TransportKind::Udp));
    }

    /// NegotiatedCodec::Pcmu variant を確認する。
    #[test]
    fn test_negotiated_codec_pcmu() {
        let codec = NegotiatedCodec::Pcmu;
        assert_eq!(format!("{:?}", codec), "Pcmu");
    }

    /// NegotiatedCodec::Opus(config) variant が OpusConfig を正しく保持することを確認する。
    #[test]
    fn test_negotiated_codec_opus() {
        let opus = OpusConfig {
            bitrate: 64000,
            complexity: 5,
            cbr: true,
            inband_fec: false,
            dtx: true,
            ptime_ms: 40,
        };
        let codec = NegotiatedCodec::Opus(opus.clone());
        if let NegotiatedCodec::Opus(ref config) = codec {
            assert_eq!(config.bitrate, 64000);
        } else {
            panic!("Expected Opus variant");
        }
    }

    /// CodecSelectionPolicy::default() が PreferOpusFallbackPcmu であることを確認する。
    #[test]
    fn test_codec_selection_policy_default() {
        let policy = CodecSelectionPolicy::default();
        assert!(matches!(policy, CodecSelectionPolicy::PreferOpusFallbackPcmu));
    }

    /// ReconnectPolicy の全フィールドが正しくラウンドトリップすることを確認する。
    #[test]
    fn test_reconnect_policy_fields() {
        let policy = ReconnectPolicy {
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(30),
            jitter_ratio: 0.25,
        };
        assert_eq!(policy.base_delay, Duration::from_secs(1));
        assert_eq!(policy.max_delay, Duration::from_secs(30));
        assert_eq!(policy.jitter_ratio, 0.25);
    }

    /// OutgoingCallRequest が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_outgoing_call_request_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<OutgoingCallRequest>();
        assert_sync::<OutgoingCallRequest>();
    }

    /// CallMediaPreferences が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_call_media_preferences_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<CallMediaPreferences>();
        assert_sync::<CallMediaPreferences>();
    }

    /// ReconnectPolicy が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_reconnect_policy_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}
        assert_send::<ReconnectPolicy>();
        assert_sync::<ReconnectPolicy>();
    }
}
