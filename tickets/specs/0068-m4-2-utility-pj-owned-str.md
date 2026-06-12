---
ticket_id: 68
title: "M4-2: ユーティリティ（PjOwnedStr の safe ラッパー骨格 / SecretString 検証）"
slug: m4-2-utility-pj-owned-str
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0068-m4-2-utility-pj-owned-str/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0068-m4-2-utility-pj-owned-str/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0068-m4-2-utility-pj-owned-str/review.md
---

# M4-2: ユーティリティ（`PjOwnedStr` の safe ラッパー骨格 / `SecretString` 検証）

## Summary

PJSUA の `pj_str_t` を安全にラップする `PjOwnedStr` 構造体を実装する。現段階では FFI バインディングが未生成（M17-1）のため、`pj_str_t` 相当のモック型を仮定義し、M17-2 で実 FFI 型に差し替える。

`SecretString` 検証（空文字チェック）は M3-2（#66）で既に実装済みのため、本チケットでは `PjOwnedStr` の実装に集中する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§27.2, §35)

## Background

### RFC 準拠

RFC §27.2 で「PJSIP は `pj_str_t` を使うため、`CString` の lifetime 問題を避ける wrapper を定義する」と規定されている。§35 で「`SecretString` により password の accidental debug print を防止」と規定されている。

`PjOwnedStr` は `Vec<u8>` で文字列データを所有し、`pj_str_t` 互換の raw 表現を内部に保持する。これにより、`pj_str_t` が外部のメモリをポインタで参照する設計からくる lifetime 問題を回避する。

### 既存チケットからの依存関係

- **M0-1（#52）**: `SipError` / `SipErrorKind` — 本チケットでは未使用（Pure Rust のためエラー型不要）
- **M0-2（#53）**: `util/mod.rs` / `util/id.rs` — 同一 util モジュールに新規ファイル追加
- **M3-2（#66）**: `SecretString` 検証（`validate_password`）— **既に実装済み**

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| **M17-1** (#TBD) | bindgen 生成後に `ffi::pj_str_t` が利用可能になる |
| **M17-2** (#TBD) | 本チケットのモック型を `ffi::pj_str_t` に置き換え |
| **M17-3** (#TBD) | callback bridge で PJSUA との文字列受け渡しに使用 |
| **M17-4** (#TBD) | PjsuaBackend 実装で設定文字列の FFI 変換に使用 |

### 設計判断

- **ファイル分割**: `pj_str.rs` として util モジュールに新規追加（`id.rs` が既に肥大化しているため別ファイル）
- **モック FFI 型**: `ffi::pj_str_t` が未生成のため、同一ファイル内に `#[repr(C)]` なモック構造体 `PjStrRaw` を定義する。M17-2 で `use crate::ffi::pj_str_t as PjStrRaw` のエイリアスに置き換える想定
- **所有権モデル**: `PjOwnedStr` は内部に `Vec<u8>` を持ち文字列データを所有。`PjStrRaw` はその `Vec<u8>` のバッファをポインタで参照する
- **メソッド構成**: `new(s: &str) -> Self`、`as_raw() -> PjStrRaw`、`Deref<Target=str>` の 3 操作
- **`SecretString` 検証**: M3-2（#66）の `validate_password` で既に Empty チェックを実装済み。本チケットでは追加実装不要

## Scope

### `crates/siprs/src/util/pj_str.rs`（新規）

```rust
use std::fmt;
use std::ops::Deref;

/// `pj_str_t` のモック構造体。
///
/// FFI バインディング生成前の仮定義。M17-2 で `ffi::pj_str_t` に置き換える。
#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct PjStrRaw {
    ptr: *const i8,
    slen: isize,
}

/// 所有権を持つ `pj_str_t` 安全ラッパー。
///
/// `Vec<u8>` で文字列データを所有し、`PjStrRaw` がそのバッファを参照する。
/// FFI 境界を越えてもポインタが有効であることを保証する。
pub struct PjOwnedStr {
    /// 文字列データの実体。この `Vec` が drop されるまで `raw.ptr` は有効。
    bytes: Vec<u8>,
    /// `pj_str_t` 互換の raw 表現。
    raw: PjStrRaw,
}

impl PjOwnedStr {
    /// `&str` から `PjOwnedStr` を生成する。
    ///
    /// 入力文字列のバイト列をコピーして所有する。
    pub fn new(s: &str) -> Self;

    /// 内部の `PjStrRaw` （`pj_str_t` 互換）を返す。
    pub fn as_raw(&self) -> PjStrRaw;
}

impl Deref for PjOwnedStr {
    type Target = str;
    fn deref(&self) -> &str;
}

impl fmt::Debug for PjOwnedStr;
impl fmt::Display for PjOwnedStr;
impl AsRef<str> for PjOwnedStr;
impl PartialEq<str> for PjOwnedStr;
impl PartialEq<&str> for PjOwnedStr;
```

### `crates/siprs/src/util/mod.rs`（修正）

- `pub mod pj_str;` を追加
- `pub use self::pj_str::PjOwnedStr;` を追加（crate 全体で利用するため）

### lib.rs

- 変更不要（`util` モジュール経由で `crate::util::PjOwnedStr` としてアクセス可能）

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_new_and_deref` | `PjOwnedStr::new("hello")` の `Deref` が `"hello"` を返す |
| 2 | `test_as_raw_ptr_not_null` | `as_raw()` の `ptr` が非 Null であること |
| 3 | `test_as_raw_slen_ascii` | ASCII 文字列で `slen` がバイト長と一致すること |
| 4 | `test_as_raw_slen_utf8` | UTF-8 マルチバイト文字列で `slen` がバイト長を返すこと（文字数ではない） |
| 5 | `test_empty_string` | 空文字列で panic しないこと |
| 6 | `test_debug_output` | Debug 出力が内容を含むこと |
| 7 | `test_display_output` | Display 出力が元の文字列と等しいこと |
| 8 | `test_as_ref_str` | `AsRef<str>` が正しい文字列スライスを返すこと |
| 9 | `test_partial_eq_str` | `PartialEq<str>` / `PartialEq<&str>` が正しく比較できること |
| 10 | `test_raw_ptr_valid_after_move` | ムーブ後も `as_raw()` のポインタが有効であること |

## Non-scope

- `ffi::pj_str_t` との結合 — M17-2 で実施
- `SecretString` の新規検証 — M3-2（#66）で完了済み
- `From<&str>` / `From<String>` 実装 — 必要になった時点で追加
- `Into<Vec<u8>>` 実装 — 同上
- シリアライズ — `serde` feature が必要になった時点で追加

## Test Plan

### 基本方針

純粋 Rust のユニットテストで全操作の正常系・異常系を網羅する。FFI 境界を越えないため、モックやスタブは不要。

特に以下の観点を重点的に検証する：
- **所有権の安全性**: ムーブ後も `as_raw()` のポインタが有効であること
- **文字列完全性**: `Deref` / `Display` / `AsRef` で元の文字列が正確に復元されること
- **境界値**: 空文字列、Unicode マルチバイト文字列

### ユニットテスト不可能な項目（例外）

- **FFI 結合後の動作保証**: 実 `ffi::pj_str_t` との互換性は M17-2 の結合テストで検証する。本チケットではモック型での動作のみ保証
- **メモリ安全性の動的検証**: MIRI による検証は CI 環境が整備された後に行う

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 162 テスト + 新規 10 テスト）
- [ ] `src/util/pj_str.rs` が作成されている
- [ ] `util/mod.rs` に `pub mod pj_str;` + `pub use self::pj_str::PjOwnedStr;` が追加されている
- [ ] `PjOwnedStr` が `new()` / `as_raw()` / `Deref<Target=str>` / `Debug` / `Display` / `AsRef<str>` / `PartialEq<str, &str>` を持つ
- [ ] モック `PjStrRaw` が `#[repr(C)]` で定義され、`ptr: *const i8` と `slen: isize` のフィールドを持つ
- [ ] 全テストで `unwrap()` 不使用（テストは panic ではなく assert で検証）
- [ ] 既存の `config.rs` の `SecretString` 検証を壊していないこと（回帰テスト）

## Notes

### ファイル名について

本チケットのファイル名は `sync.rs` ではなく `pj_str.rs` を採用する。理由：
- ファイル名が内容（`pj_str_t` ラッパー）を直接説明する
- RFC §27.2 の型名 `PjOwnedStr` との一貫性がある
- util モジュールの既存ファイル（`bimap.rs`、`id.rs`）と同様の命名パターン

### SecretString 検証の扱い

M3-2（#66）で以下の検証を実装済みのため、本チケットでは新規実装なし：
- `validate_password()` — `SecretString` が空の場合に `SipError::invalid_config()` を返す
- `secrecy::ExposeSecret` トレイト経由の安全な内容アクセス

### M4 マイルストーン

```text
M4-1 (#67): BiMap<RuntimeId, NativeId> 実装 ← 完了済み
M4-2 (#68): ユーティリティ（PjOwnedStr ラッパー骨格 / SecretString 検証） ← 本チケット
```
