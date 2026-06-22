//! ユーティリティモジュール。
//!
//! ID 型・内部データ構造・FFI ヘルパーなどを提供する。

pub mod bimap; // 双方向 ID マッピング（RuntimeId ↔ NativeId）
pub mod id; // AccountId / CallId / AudioSourceId / TransportId newtype 定義
pub mod pj_str; // PjOwnedStr（非推奨: ffi::strings に移行）

pub use crate::ffi::strings::PjOwnedStr;
