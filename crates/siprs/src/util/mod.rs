//! ユーティリティモジュール。
//!
//! ID 型・内部データ構造・FFI ヘルパーなどを提供する。

pub mod bimap;   // 双方向 ID マッピング（RuntimeId ↔ NativeId）
pub mod id;      // AccountId / CallId / AudioSourceId newtype 定義
pub mod pj_str;  // PjOwnedStr — pj_str_t 安全ラッパー

pub use self::pj_str::PjOwnedStr;
