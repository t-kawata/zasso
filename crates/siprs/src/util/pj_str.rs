//! # PjOwnedStr（非推奨: `ffi::strings` に移行）
//!
//! このファイルは M17-2 以前の互換性のために維持されている。
//! 新しいコードは `crate::ffi::strings::PjOwnedStr` を直接使用すること。

use crate::ffi;

/// [`ffi::strings::PjOwnedStr`] への非推奨エイリアス。
#[deprecated(since = "0.1.0", note = "use crate::ffi::strings::PjOwnedStr instead")]
#[allow(deprecated)]
pub type PjOwnedStr = ffi::strings::PjOwnedStr;
