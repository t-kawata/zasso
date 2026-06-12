//! # PjOwnedStr — 所有権を持つ `pj_str_t` 安全ラッパー
//!
//! FFI バインディング生成前のモック段階。M17-2 で実 `ffi::pj_str_t` に置き換える。

use std::fmt;
use std::ops::Deref;

/// `pj_str_t` のモック構造体。
///
/// FFI バインディング生成前の仮定義。M17-2 で `use crate::ffi::pj_str_t as PjStrRaw` に
/// 置き換える想定。
///
/// # 安全性
///
/// `ptr` が指すメモリは、この `PjStrRaw` を生成した `PjOwnedStr` の生存期間中のみ有効。
/// `PjOwnedStr` が drop された後の `ptr` 利用は未定義動作を引き起こす。
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub(crate) struct PjStrRaw {
    /// null 終端ではない文字列バッファへのポインタ。
    ptr: *const i8,
    /// バイト長。
    slen: isize,
}

// ---------------------------------------------------------------------------
// 所有権を持つ pj_str_t 安全ラッパー
// ---------------------------------------------------------------------------

// SAFETY:
// PjOwnedStr は内部に生ポインタを持つ PjStrRaw を含むため、コンパイラは自動的に
// Send/Sync を導出しない。しかし以下の理由から Send および Sync は安全である：
//
// 1. `raw.ptr` は常に `self.bytes`（String）のヒープバッファを指す自己参照である。
// 2. `String` はムーブ時にヒープデータのポインタ・サイズ・キャパシティの3ワードのみ
//    コピーするため、ムーブ後もヒープデータのアドレスは不変であり `raw.ptr` は有効。
// 3. `&self` 経由のアクセスは読み取り専用であり、データ競合は発生しない。
unsafe impl Send for PjOwnedStr {}
unsafe impl Sync for PjOwnedStr {}

/// 所有権を持つ `pj_str_t` 安全ラッパー。
///
/// `String` で文字列データを所有し、`PjStrRaw` がそのバッファを参照する。
/// FFI 境界を越えてもポインタが有効であることを保証する。
///
/// # ポインタの安全性
///
/// - `as_raw()` で取得したポインタは、この構造体が drop されるまで有効。
/// - ムーブ後も有効（`String` のヒープデータは移動しない）。
/// - 不変参照経由の `as_raw()` でも問題ない（読み取り専用のため）。
pub struct PjOwnedStr {
    /// 文字列データの実体。この `String` が drop されるまで `raw.ptr` は有効。
    bytes: String,
    /// `pj_str_t` 互換の raw 表現。
    raw: PjStrRaw,
}

impl PjOwnedStr {
    /// `&str` から `PjOwnedStr` を生成する。
    ///
    /// 入力文字列の内容をコピーして所有する。
    pub fn new(s: &str) -> Self {
        let bytes = s.to_string();
        // as_ptr の返すポインタは bytes の生存期間中有効。u8 → i8 は表現が同一。
        let ptr = bytes.as_ptr().cast::<i8>();
        let slen = bytes.len() as isize;
        let raw = PjStrRaw { ptr, slen };
        Self { bytes, raw }
    }

    /// 内部の `PjStrRaw`（`pj_str_t` 互換）を返す。
    ///
    /// M17-2 以降で FFI 境界を越える文字列受け渡しに使用する内部 API。
    /// 公開 API の利用者はこのメソッドを直接呼ぶ必要はない。
    #[allow(dead_code)]
    pub(crate) fn as_raw(&self) -> PjStrRaw {
        self.raw
    }
}

impl Deref for PjOwnedStr {
    type Target = str;

    fn deref(&self) -> &str {
        &self.bytes
    }
}

impl fmt::Debug for PjOwnedStr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PjOwnedStr")
            .field("bytes", &self.bytes)
            .field("raw", &self.raw)
            .finish()
    }
}

impl fmt::Display for PjOwnedStr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.bytes.fmt(f)
    }
}

impl AsRef<str> for PjOwnedStr {
    fn as_ref(&self) -> &str {
        &self.bytes
    }
}

impl PartialEq<str> for PjOwnedStr {
    fn eq(&self, other: &str) -> bool {
        self.bytes == other
    }
}

impl PartialEq<&str> for PjOwnedStr {
    fn eq(&self, other: &&str) -> bool {
        self.bytes == *other
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// new → Deref で元の文字列が復元されることを確認する。
    #[test]
    fn test_new_and_deref() {
        let owned = PjOwnedStr::new("hello");
        assert_eq!(&*owned, "hello");
    }

    /// as_raw() の ptr が非 Null であることを確認する。
    #[test]
    fn test_as_raw_ptr_not_null() {
        let owned = PjOwnedStr::new("hello");
        assert!(!owned.as_raw().ptr.is_null());
    }

    /// ASCII 文字列で slen がバイト長と一致することを確認する。
    #[test]
    fn test_as_raw_slen_ascii() {
        let owned = PjOwnedStr::new("hello");
        assert_eq!(owned.as_raw().slen, 5);
    }

    /// UTF-8 マルチバイト文字列で slen がバイト長を返すことを確認する（文字数ではない）。
    #[test]
    fn test_as_raw_slen_utf8() {
        // 「こんにちは」は 5 文字だが、UTF-8 では 15 バイト。
        let owned = PjOwnedStr::new("こんにちは");
        assert_eq!(owned.as_raw().slen, 15);
    }

    /// 空文字列で panic せず、ptr が非 Null で slen が 0 であることを確認する。
    #[test]
    fn test_empty_string() {
        let owned = PjOwnedStr::new("");
        assert_eq!(&*owned, "");
        assert!(!owned.as_raw().ptr.is_null());
        assert_eq!(owned.as_raw().slen, 0);
    }

    /// Debug 出力が構造体名と内容を含むことを確認する。
    #[test]
    fn test_debug_output() {
        let owned = PjOwnedStr::new("hello");
        let debug = format!("{:?}", owned);
        assert!(debug.contains("PjOwnedStr"));
        assert!(debug.contains("hello"));
    }

    /// Display 出力が元の文字列と等しいことを確認する。
    #[test]
    fn test_display_output() {
        let owned = PjOwnedStr::new("hello");
        assert_eq!(format!("{}", owned), "hello");
    }

    /// AsRef<str> が正しい文字列スライスを返すことを確認する。
    #[test]
    fn test_as_ref_str() {
        let owned = PjOwnedStr::new("hello");
        let ref_str: &str = owned.as_ref();
        assert_eq!(ref_str, "hello");
    }

    /// PartialEq<str> および PartialEq<&str> が正しく比較できることを確認する。
    #[test]
    fn test_partial_eq_str() {
        let owned = PjOwnedStr::new("hello");
        assert_eq!(owned, "hello");
        assert_ne!(owned, "world");
        assert_eq!(owned, &"hello" as &str);
        assert_ne!(owned, &"world" as &str);
    }

    /// ムーブ後も as_raw() のポインタが有効であることを確認する。
    #[test]
    fn test_raw_ptr_valid_after_move() {
        let owned = PjOwnedStr::new("hello");
        let raw_before = owned.as_raw();

        let moved = owned; // ムーブ後、owned は使用不可。
        let raw_after = moved.as_raw();

        // ムーブ前後でポインタと長さが一致 → ヒープデータのアドレスが不変。
        assert_eq!(raw_before.ptr, raw_after.ptr);
        assert_eq!(raw_before.slen, raw_after.slen);
        assert_eq!(&*moved, "hello");
    }
}
