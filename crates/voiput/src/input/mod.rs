//! クリップボード操作 + キーボード注入モジュール
//!
//! arboard によるクリップボード read/write、CGEvent (macOS) / SendInput (Windows)
//! によるキーボード注入を提供する。
//!
//! # 移植元
//!
//! - `mycute/src/input/mod.rs`
//! - `mycute/src/input/clipboard.rs`
//! - `mycute/src/input/keyboard_mac.rs`
//! - `mycute/src/input/keyboard_win.rs`

pub mod clipboard;

#[cfg(target_os = "macos")]
pub mod keyboard_mac;
#[cfg(target_os = "macos")]
pub use keyboard_mac as keyboard;

#[cfg(target_os = "windows")]
pub mod keyboard_win;
#[cfg(target_os = "windows")]
pub use keyboard_win as keyboard;
