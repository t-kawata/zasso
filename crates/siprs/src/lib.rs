//! # siprs — Safe asynchronous SIP voice communication via PJSUA
//!
//! This crate provides a tokio-native API for managing SIP accounts,
//! transports, calls, audio processing, DTMF, ICE/TURN/STUN, TLS, SRTP,
//! and event delivery for application integration.
//!
//! ## Feature Flags
//!
//! - `serde`: Enable serde Serialize/Deserialize for public types.
//!
//! ## Versioning Policy
//!
//! See [`api::versioning_policy`] for the versioning contract.
//! See `CHANGELOG.md` for the 0.x phase operation rules.

pub mod api;
