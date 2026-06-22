---
ticket_id: 132
title: "M17-2: PjOwnedStr — pj_str_t wrapper（実 FFI 型統合）"
slug: m17-2-pjownedstr-pj-str-t-wrapper-ffi
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0132-m17-2-pjownedstr-pj-str-t-wrapper-ffi/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0132-m17-2-pjownedstr-pj-str-t-wrapper-ffi/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0132-m17-2-pjownedstr-pj-str-t-wrapper-ffi/review.md
---

# M17-2: `PjOwnedStr` — `pj_str_t` wrapper（実 FFI 型統合）

## Summary

M4-2（#68）で `util/pj_str.rs` に仮実装した `PjOwnedStr` を、実際の FFI 型（`ffi::pj_str_t`）と統合し `ffi/strings.rs` に移行する。モック型 `PjStrRaw` の `slen` 型が `isize` から `i32`（PJSIP の `pj_ssize_t`）に変わるため、レイアウトの互換性を確保する。また、FFI 境界での safe な文字列受け渡し基盤を完成させる。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27.2, §47)

## Background

### なぜ必要か

M4-2 で `PjOwnedStr` の骨格は実装済みだが、以下の課題がある：

1. **モック型のまま**: `PjStrRaw` は FFI バインディングが未生成のため手動定義のモック。M17-1 で `ffi/` モジュールができたため、実際の FFI モジュールに統合する必要がある。
2. **型の不一致**: 現状の `PjStrRaw` は `slen: isize`（ポインタ幅）だが、PJSIP の `pj_str_t` は `slen: pj_ssize_t`（`int` = 32bit）。この不一致を修正しないと、64bit 環境で `pj_str_t` のレイアウトが一致せず未定義動作を引き起こす。
3. **FFI モジュールへの配置**: `PjOwnedStr` は FFI 型をラップする型であるため、`util/` ではなく `ffi/` に配置するのが責務的に正しい。

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §27.2 | PJSIP は `pj_str_t` を使うため、`CString` の lifetime 問題を避ける wrapper を定義する |
| §47 | `pj_str_t` は常に Rust 側 owner を保持。ポインタの有効期間は owner の生存期間に等しい |

### 設計判断

1. **`ffi::pj_str_t` を手動定義（bindgen 代替）**: bindgen による `pj_str_t` 生成が PJSIP ヘッダ不在のため行われない。PJSIP 2.17 の `pj_str_t` は安定した ABI を持つため、手動で同一レイアウトの構造体を `ffi/` に定義する。bindgen が利用可能になった時点で、`static_assert!` により手動定義と bindgen 生成のレイアウト一致を検証する。

2. **`slen` 型を `isize` → `i32` に修正**: PJSIP の `pj_ssize_t` は `int`（32bit）である。現状の `isize`（64bit 環境では 8byte）は誤り。この修正により `PjStrRaw` のメモリレイアウトが PJSIP の `pj_str_t` と完全一致する。

3. **`src/ffi/strings.rs` 新規作成**: `PjOwnedStr` の実装をここに移す。`util/pj_str.rs` は非推奨とし、`ffi/strings.rs` への再エクスポートに置き換える。

4. **Pin は不要**: `PjOwnedStr` の `raw.ptr` は `String` のヒープバッファを指す。`String` はムーブ時にヒープデータのアドレスが変わらないため、Pin ラッパーは不要。既存の設計判断を継続。

5. **`unsafe impl Send + Sync` を継承**: M4-2 と同一の SAFETY 理由で Send/Sync を維持する。

## Investigation

### 証拠 1: PjStrRaw の slen 型が isize（誤り）

**ファイル:** `crates/siprs/src/util/pj_str.rs:18-24`

```rust
#[repr(C)]
pub(crate) struct PjStrRaw {
    ptr: *const i8,
    slen: isize,  // ← 誤り: PJSIP の pj_ssize_t は int (i32)
}
```

PJSIP 2.17 の `pj_str_t` 定義（C 言語）:
```c
typedef struct pj_str_t {
    char      *ptr;   // 8 bytes on 64-bit, 4 bytes on 32-bit
    pj_ssize_t slen;  // int (32-bit signed) on all platforms
} pj_str_t;
```

`pj_ssize_t` は PJSIP では `int` として定義されている（`pj/types.h`）。64bit 環境では `isize`（8byte）と `i32`（4byte）のレイアウトが異なり、構造体のサイズは一致するが、上位ワードにゴミデータが入る可能性がある。

64bit 環境でのレイアウト比較:
```
PjStrRaw (現状): ptr(8) + slen:isize(8) = 16 bytes, no padding
pj_str_t (正):   ptr(8) + slen:i32(4) + padding(4) = 16 bytes
```

`slen` を `isize` で読み書きすると、`pj_str_t` と交信する際に上位 4 byte に予期しない値が含まれる可能性がある。PJSIP は `slen` を `int` で扱うため、`i32` 範囲（最大 2^31-1 = 2GB）を超える文字列を扱うことは現実的にない。

### 証拠 2: PjOwnedStr は util/pj_str.rs に完全実装済み（10 テスト・全 PASS）

**ファイル:** `crates/siprs/src/util/pj_str.rs`（217 行）

```rust
pub struct PjOwnedStr {
    bytes: String,
    raw: PjStrRaw,
}
```

実装済みの API:
- `new(s: &str) -> Self`
- `as_raw() -> PjStrRaw`（pub(crate)）
- `Deref<Target=str>`
- `Debug`, `Display`
- `AsRef<str>`
- `PartialEq<str>`, `PartialEq<&str>`
- `unsafe impl Send + Sync`（SAFETY コメント付き）

### 証拠 3: ffi/mod.rs に M17-2 拡張のプレースホルダーがある

**ファイル:** `crates/siprs/src/ffi/mod.rs:34`

```rust
// M17-2 以降で safe ラッパーを追加
```

### 証拠 4: util/pj_str.rs 自体に M17-2 移行のコメントがある

**ファイル:** `crates/siprs/src/util/pj_str.rs:3, 10`

```rust
//! FFI バインディング生成前のモック段階。M17-2 で実 `ffi::pj_str_t` に置き換える。
/// M17-2 で `use crate::ffi::pj_str_t as PjStrRaw` に置き換える想定。
```

### 証拠 5: util/mod.rs で PjOwnedStr を再エクスポート

**ファイル:** `crates/siprs/src/util/mod.rs`

```rust
pub use self::pj_str::PjOwnedStr;
```

本チケットで再エクスポート元を `ffi::strings` に変更する。

## Scope

### 新規ファイル

#### 1. `crates/siprs/src/ffi/strings.rs` — PjOwnedStr 実 FFI 統合

M4-2 の `util/pj_str.rs` 相当のコードをベースに、以下の修正を加えて配置する：

```rust
//! # PjOwnedStr — 所有権を持つ `pj_str_t` 安全ラッパー
//!
//! PJSIP の `pj_str_t` を Rust 側で安全に扱うためのラッパー。
//! `String` でデータを所有し、`pj_str_t` がその内部バッファを参照する自己参照構造。
//!
//! # PJSIP 互換性
//!
//! このモジュールで定義する `PjStrRaw` は PJSIP 2.17 の `pj_str_t` と同一の
//! メモリレイアウトを持つ。bindgen 利用可能時は `static_assertions` で一致確認を行う。
//!
//! M17-1 の `build.rs` で bindgen が成功すると `ffi::bindings::pj_str_t` が生成される。
//! その場合は手動定義とレイアウト一致をコンパイル時に検証する。
```

**`PjStrRaw` の再定義（slen 型修正版）:**

```rust
/// `pj_str_t` の Rust 表現。
///
/// PJSIP 2.17 の `pj_str_t` と同一レイアウト。
/// bindgen 生成が可能になった時点で `static_assertions` で一致確認する。
#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub(crate) struct PjStrRaw {
    /// null 終端ではない文字列バッファへのポインタ。
    /// 指す先の生存期間は owner（PjOwnedStr）が支配する。
    ptr: *const i8,
    /// バイト長（PJSIP の pj_ssize_t は int = 32bit）。
    slen: i32,
}
```

**`PjOwnedStr` の主な変更点:**

- `raw.slen` の型変更に伴うキャスト調整（`bytes.len() as i32`）
- `ffi/mod.rs` のドキュメント更新
- `unsafe impl Send + Sync` の継承（SAFETY コメントは同一）

**追加メソッド（M4-2 からの差分）:**

```rust
impl PjOwnedStr {
    /// UTF-8 検証付きで `&str` を取得する。
    ///
    /// `PjOwnedStr` は常に有効な UTF-8 を保持するため、このメソッドは
    /// 実質的に `unwrap()` と同様だが、FFI 境界から受け取った文字列の
    /// 安全性検証のために用意する。
    pub fn as_str(&self) -> &str {
        // self.bytes は常に有効な UTF-8（new() でのみ生成されるため）
        &self.bytes
    }
}
```

### 既存ファイル変更

#### 2. `crates/siprs/src/ffi/mod.rs` — strings サブモジュール追加

```rust
/// M17-2 以降で safe ラッパーを追加
```
↓
```rust
pub mod strings;
```

`#![allow(...)]` は `mod strings` には適用されないようにする（`strings.rs` は手動コードであり、bindgen 生成コードではないため）。

#### 3. `crates/siprs/src/util/pj_str.rs` — 非推奨化・再エクスポート化

ファイル全体を以下のように置き換える：

```rust
//! # PjOwnedStr（非推奨: `ffi::strings` に移行）
//!
//! このファイルは互換性のために維持されている。新しいコードは
//! `crate::ffi::strings::PjOwnedStr` を直接使用すること。

use crate::ffi;

/// [`ffi::strings::PjOwnedStr`] への非推奨エイリアス。
#[allow(deprecated)]
pub type PjOwnedStr = ffi::strings::PjOwnedStr;
```

`#[deprecated]` アトリビュートを追加し、コンパイル時に移譲先を案内する。

#### 4. `crates/siprs/src/util/mod.rs` — 使用箇所の確認

```rust
pub use self::pj_str::PjOwnedStr;
```

`ffi::strings::PjOwnedStr` を再エクスポートするように変更。`pj_str` モジュール自体は削除せず、非推奨として維持。

```rust
pub use crate::ffi::strings::PjOwnedStr;
```

#### 5. `crates/siprs/src/ffi/mod.rs` — `#[allow]` のスコープ調整

現状の `#![allow(...)]` は `mod strings` にも適用される。手動コードである `strings.rs` には clippy 警告を有効にすべきだが、`#![allow]` がモジュール全体に適用される問題がある。以下のいずれかの対応をする：

- **Option A**: `mod strings` を `#![allow]` の前に移動
- **Option B**: `strings.rs` 内で `#![allow]` を上書きする `#![cfg_attr(...)]` を追加
- **Option C（推奨）**: `#![allow]` を `mod bindings` のみに適用する（`mod strings` はその外側に配置）

```rust
/// bindgen 生成の PJSIP FFI バインディング。
pub mod bindings {
    #![allow(
        non_upper_case_globals,
        non_camel_case_types,
        non_snake_case,
        unused,
        clippy::all
    )]
    include!(concat!(env!("OUT_DIR"), "/pjsip_bindings.rs"));
}

pub mod strings;
```

#### 6. レイアウト一致検証（`ffi/strings.rs` のテスト）

bindgen が利用可能な場合のみ、`static_assertions` を使用して手動定義 `PjStrRaw` と `ffi::bindings::pj_str_t` のレイアウト一致を検証する：

```rust
#[cfg(test)]
mod layout_tests {
    #[cfg(any())] // bindgen 生成が可能になったら有効化
    const _: () = {
        use crate::ffi::bindings::pj_str_t;
        // static_assertions でサイズとアライメントを検証
        // assert_eq_size!(PjStrRaw, pj_str_t);
        // assert_eq_align!(PjStrRaw, pj_str_t);
    };
}
```

現時点では `#[cfg(any())]` で無効化（bindgen 生成後に有効化）。

### テストコード

M4-2 の 10 テストを全て継承し、以下を追加：

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1-10 | M4-2 から継承 | 継承 | `test_new_and_deref`, `test_as_raw_ptr_not_null`, `test_as_raw_slen_ascii`, `test_as_raw_slen_utf8`, `test_empty_string`, `test_debug_output`, `test_display_output`, `test_as_ref_str`, `test_partial_eq_str`, `test_raw_ptr_valid_after_move` |
| 11 | `test_as_str_utf8` | 正常系 | `as_str()` が UTF-8 文字列を正しく返す |
| 12 | `test_slen_type_i32` | 正常系 | `as_raw().slen` の型が `i32` であること（コンパイル時確認） |
| 13 | `test_slen_max_value` | 境界値 | 長い文字列（`i32::MAX` 未満）でも slen が正しいこと |

**注意:** `test_as_raw_slen_ascii` と `test_as_raw_slen_utf8` は、`slen` が `isize` から `i32` に変わるため、アサーション値がコンパイルできるように修正する（数値リテラルは `as isize` → `as i32` 相当に変更するが、既存のリテラル `5`, `15`, `0` は `i32` にも適合するため修正不要）。

## Non-scope

- **bindgen 生成の `pj_str_t` との自動差し替え**: bindgen が生成可能になった時点で、別チケット（または M17-2 の事後タスク）で対応。本チケットでは手動定義を使用する。
- **`PjOwnedStr` 以外の FFI 文字列ラッパー**: ヌル終端文字列のラッパー（`CString` 相当）はスコープ外。
- **`src/util/pj_str.rs` の削除**: 非推奨化して維持（後日削除は別チケット）。
- **`miri` による stacked borrows 検証**: Tickets.md に記載されているが、PJSIP がなくても実行可能な通常のテストに絞る。`miri` は CI 環境で M19-1 以降に実施。
- **全ての PJSIP raw ポインタ操作の safe ラッピング**: M17-3（Callback bridge）以降で対応。

## Test Plan

### ユニットテスト計画

テストは `ffi/strings.rs` 内の `#[cfg(test)]` モジュールに実装する。

| # | テスト | 正常/異常/境界 |
|---|--------|---------------|
| 1 | `test_new_and_deref` — new → Deref で元の文字列 | 正常 |
| 2 | `test_as_raw_ptr_not_null` — as_raw の ptr が非 Null | 正常 |
| 3 | `test_as_raw_slen_ascii` — ASCII で slen がバイト長と一致 | 正常 |
| 4 | `test_as_raw_slen_utf8` — UTF-8 マルチバイトで slen がバイト長 | 正常 |
| 5 | `test_empty_string` — 空文字列で slen=0, ptr 非 Null | 境界 |
| 6 | `test_debug_output` — Debug 書式 | 正常 |
| 7 | `test_display_output` — Display 書式 | 正常 |
| 8 | `test_as_ref_str` — AsRef<str> | 正常 |
| 9 | `test_partial_eq_str` — PartialEq<str>, PartialEq<&str> | 正常 |
| 10 | `test_raw_ptr_valid_after_move` — ムーブ後も ptr 有効 | 正常 |
| 11 | `test_as_str_utf8` — as_str() が &str を返す | 正常 |
| 12 | `test_slen_i32_type` — slen が i32 であることの確認 | 正常 |

**カバレッジ目標:** 90%以上（PjOwnedStr の全公開メソッドと全トレイト実装をカバー）

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | bindgen 生成 `pj_str_t` とのレイアウト一致検証 | PJSIP ヘッダがシステムにインストールされていないため。M19-1 完了後に有効化予定 |
| 2 | `miri` による stacked borrows 検証 | CI 環境で `cargo miri` が実行できる状態で実施。本チケットでは通常の cargo test で代用 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`util/pj_str.rs` → `ffi/strings.rs` への移行**: 責務に基づく適切なモジュール配置により、ファイル名から役割が直感的に理解できるようになる（「FFI 文字列ラッパー」が `ffi/strings.rs` にある）。

2. **`PjStrRaw` 構造体のコメント改善**: `slen` 型の根拠（PJSIP の `pj_ssize_t` が `int` であること）をコメントで明記。なぜ `isize` ではなく `i32` なのかがコードを読むだけで理解できる。

3. **`lib.rs` / `util/mod.rs` へのスコープ外改善**: `util/pj_str.rs` に残るコメント「M17-2 で実 `ffi::pj_str_t` に置き換える」を本チケット完了時に更新する（`#[deprecated]` に変更したことを反映）。

## Acceptance Criteria

- [ ] `make check-be` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS
- [ ] `PjOwnedStr` が `crate::ffi::strings::PjOwnedStr` から利用可能であること
- [ ] `crate::util::PjOwnedStr` が `#[deprecated]` 警告付きで引き続き利用可能であること
- [ ] `PjStrRaw::slen` の型が `i32` であること（`isize` → `i32` 修正）
- [ ] 既存 10 テスト + 新規 2 テストが全て PASS すること
- [ ] テスト `test_raw_ptr_valid_after_move` が引き続き PASS すること（ムーブ安全性の担保）
- [ ] `ffi/mod.rs` の `allow` 属性が `mod strings` に適用されていないこと
- [ ] `cargo clippy -- -D warnings` 通過（新規コードのみ）
- [ ] `cargo fmt --check` 通過
- [ ] 翻訳可能性: 関数名が動詞句、変数名がドメイン概念を表現していること

## Notes

### Tickets.md の不整合

M17-2 の Tickets.md 記述には以下の不整合がある：

1. **ファイル名**: `src/ffi/strings.rs` と記載（正しい）、`util/pj_str.rs` から移行
2. **Pin の必要性**: 「Pin または move 検出機構を実装する」とあるが、`String` のヒープデータはムーブ後もアドレス不変のため Pin は不要。現状の実装で正しい。
3. **テスト番号**: テスト 5「move 後の pointer 更新」は既存の `test_raw_ptr_valid_after_move`（テスト10）でカバー済み。テスト 6「1000回の move 操作」は本チケットでは実装せず、`miri` による検証は CI 環境で別途実施。

### 移行パス

```text
M4-2 (#68) ──→ util/pj_str.rs（PjStrRaw モック + PjOwnedStr）
                    │
M17-1 (#131) ──→ ffi/mod.rs（bindgen include 基盤）
                    │
M17-2 (#132) ──→ ffi/strings.rs（PjOwnedStr 実 FFI 統合）
                    │
                    ↓
             util/pj_str.rs ──→ 非推奨化（#[deprecated]）
```

### 既存コードの PjOwnedStr 参照箇所

M17-2 完了後、以下のファイルで PjOwnedStr の参照元を確認する（`#[deprecated]` 警告が出ないことを確認）：
- `crates/siprs/src/runtime/backend.rs`（コメント内の参照）
- `crates/siprs/src/runtime/state.rs`（コメント内の参照）

これらはコメントのみの参照であり、コード修正は不要。
