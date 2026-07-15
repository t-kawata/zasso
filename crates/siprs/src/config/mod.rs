// Module declarations for the config subsystem.
//
// Each submodule corresponds to one RFC design node. Submodules whose
// dependency tickets are not yet resolved carry a [::STUB::] marker.

pub mod account_config;            // [::STUB::] P0-5: AccountConfig + validation
pub mod account_validation;        // [::STUB::] P0-5: Account validation rules
pub mod audio_device_policy;       // [::STUB::] external ticket
pub mod backpressure_policy;       // [::STUB::] external ticket
pub mod client_config;
pub mod codec_explicit_mode;       // [::STUB::] external ticket
pub mod codec_mode_priority;       // [::STUB::] external ticket
pub mod codec_policy;              // [::STUB::] external ticket
pub mod config_defaults;           // [::STUB::] P1-1: default values separation
pub mod default_policies;          // [::STUB::] external ticket
pub mod ice_stun_turn;             // [::STUB::] P1-1: IceConfig / StunServerConfig / TurnServerConfig
pub mod metrics;                   // [::STUB::] external ticket
pub mod observability;             // [::STUB::] external ticket
pub mod persistence;               // [::STUB::] external ticket
pub mod tracing;                   // [::STUB::] external ticket
pub mod transport_config;          // [::STUB::] P0-5: TransportConfig enum

// Re-export primary types from the client_config module for external consumers.
// [::STUB::] P0-5 / P1-1 / N0056: ClientConfig and ClientAudioConfig are
// commented out in client_config.rs pending dependency resolution. Re-add
// them to this re-export list when uncommented.
pub use self::client_config::{
    LogLevel, RawSipEventConfig, ResamplerQuality, TimeoutConfig,
};
