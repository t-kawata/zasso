//! # FFI バインディング
//!
//! PJSIP 2.17 C ライブラリの自動生成 FFI バインディングと safe ラッパー。
//!
//! - `bindings`: bindgen 生成コード（allow 属性は内部で設定）
//! - `strings`: `PjOwnedStr` — `pj_str_t` 安全ラッパー

/// bindgen 生成の PJSIP FFI バインディング。
///
/// # Allow 属性
///
/// 以下の allow は bindgen 生成コードの特性に起因し、手動コードには適用しない:
/// - `non_upper_case_globals`: C 定数は大文字アンダースコアが慣習
/// - `non_camel_case_types`: C の型名 (`pjsua_*`) は snake_case
/// - `non_snake_case`: C の関数名 (`pjsua_*`) は snake_case
/// - `unused`: 生成コード全体に対する部分利用前提の lint 抑制
/// - `unnecessary_transmutes`: bindgen 生成のビットフィールドアクセスが古い transmute パターンを生成する
pub mod bindings {
    #![allow(
        non_upper_case_globals,
        non_camel_case_types,
        non_snake_case,
        unused,
        unnecessary_transmutes,
        clippy::all
    )]
    include!(concat!(env!("OUT_DIR"), "/pjsip_bindings.rs"));
}

/// `PjOwnedStr` — `pj_str_t` 安全ラッパー。
pub mod strings;

/// `RustMediaPort` — lock-free メディアポート。
pub mod media;

/// Callback bridge — PJSIP C callback → NativeEvent enqueue。
pub mod callbacks;

/// PjsuaBackend — SipBackend trait の PJSUA 実装。
///
/// テスト時も常にコンパイルし、スタブ実装で trait 境界の検証を行う。
#[cfg(any(feature = "pjsip", test))]
pub mod pjsua_backend;
