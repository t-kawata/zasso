//! # siprs — Async Rust SIP Client
//!
//! tokio ネイティブの非同期 SIP クライアント。PJSUA 2.17 を FFI 経由で駆動し、
//! 複数アカウント・発着信・音声処理・DTMF・ICE/TURN/STUN・TLS・SRTP を提供する。
//!
//! ## フェーズ1: 基盤型定義
//!
//! このモジュール階層は実装進行に伴い拡張される。

pub mod audio;
pub mod config;
pub mod error;
pub mod event;
pub mod transport;
pub mod util;

// Phase 2 以降で順次追加:
// pub mod client; // M12: SipClient
