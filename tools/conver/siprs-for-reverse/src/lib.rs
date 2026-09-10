






/// Facade layer — SipClient, SipError, ClientConfig.
/// The top-level API that application code interacts with.
pub mod client;
pub mod config;
pub mod error;

// (RESIDUE root causes, I/O boundary table, breaking-change order).
pub mod architecture;

/// Account and Transport lifecycle types; Call is implemented (P9-3).
///
/// Account lifecycle (add_account/remove_account/account/update_config/remove)
/// and transport lifecycle (add_transport) are implemented in P10-3.
pub mod account;
pub mod call;
pub mod transport;

pub mod api;
pub mod event;
pub mod state;

pub mod audio;

pub mod ffi;

pub mod runtime;

pub mod security;

pub mod build;

pub mod tests;

// model/ module is unconditionally compiled — only sqlite_schema submodule
// is gated behind `sqlite-storage` feature inside model/mod.rs.
pub mod model;

// ── Public API re-exports ──────────────────────────────────────────
//
// These re-exports form the crate's public API surface. Application code
// should use these types via `siprs::SipClient`, `siprs::ClientConfig`, etc.

pub use client::SipClient;
pub use config::{AuthConfig, AuthCredentials, AuthMode, ConfigError, ServerConfig};
pub use config::client_config_spec::{
    ClientAudioConfig, ClientConfig, LogLevel, RawSipEventConfig, TimeoutConfig,
};
pub use config::transport_ice_spec::{
    IceConfig, StunServerConfig, TcpTransportConfig, TransportConfig, TurnServerConfig,
    TurnTransport, UdpTransportConfig,
};
pub use error::SipError;
pub use error::SipErrorKind;
pub use security::SecretString;
pub use event::{
    AccountEventReceiver,
    AccountInfoSnapshot,
    CallDirection,
    CallMediaState,
    CallResumedInfo,
    CallState,
    ConnectedCallInfo,
    DtmfReceivedInfo,
    DtmfSentInfo,
    EventBus,
    EventDirection,
    EventMeta,
    EventTimestamp,
    MediaActiveInfo,
    MediaErrorInfo,
    NativeEvent,
    RegistrationFailure,
    RegistrationInfo,
    RegistrationState,
    SentDtmfError,
    SipEvent,
    SipEventPayload,
    Subscription,
};
pub use account::SipAccountHandle;
pub use api::call_types::{AuthOverride, CallMediaPreferences, Codec, OutgoingCallRequest};
pub use api::call_api_semantics::CallApiSemantics;
pub use call::{HangupReason, SipCall};
pub use api::audio_subscribe_bp::{AudioTapHandle, AudioTapMode, AudioTapSender};
pub use audio::{
    AudioOrchestrationError, AudioPipeline, AudioPipelineConfig, ChannelSelector, ProcessedFrame,
};
pub use config::account_config_spec::{
    AccountCodecPolicy, AccountConfig, AccountMediaConfig, AccountTransportPolicy, DtmfMethod,
    DtmfPolicy, OpusConfig, SrtpPolicy,
};
#[cfg(feature = "tls")]
pub use config::transport_ice_spec::TlsConfig;
// config::StunServerConfig is gone and transport_ice_spec::StunServerConfig is
// the single unified definition re-exported above.
