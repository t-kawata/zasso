---
ticket_id: 131
title: "M17-1: bindgen 設定と生成"
slug: m17-1-bindgen
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0131-m17-1-bindgen/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0131-m17-1-bindgen/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0131-m17-1-bindgen/review.md
---

# M17-1: `bindgen` 設定と生成

## Summary

PJSIP 2.17 C ライブラリの Rust FFI バインディングを `bindgen` で自動生成する。`build.rs` で bindgen を実行し、allowlist で必要最小限のシンボルのみ生成。手書きの unsafe 宣言を排除し、PJSIP バージョン更新時の追従を自動化する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27.1)

## Background

### なぜ必要か

siprs クレートは pure Rust の Layer 0-2 実装が完了し、現在は PJSIP 2.17 の FFI 層（Layer 4）の構築フェーズに入っている。FFI バインディングの自動生成は以下の理由で不可欠である：

1. **手動 unsafe 宣言の排除**: PJSIP は 1000+ の関数を持つ大規模 C API。手動での FFI 宣言は人為的ミス・メモリ安全性リスク・メンテナンス負荷が極めて高い
2. **バージョン追従の自動化**: PJSIP のマイナーバージョン更新時に `bindgen` を再実行するだけで追従可能
3. **ビルドの再現性**: `build.rs` + `wrapper.h` + allowlist で宣言的に管理
4. **型安全性**: `bindgen` が C の型を Rust の型に正しくマッピングする（`pj_status_t` → `i32`、`pj_str_t` → 構造体等）

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §27.1 | build.rs は platform 別に include path と define を設定し、必要ヘッダのみを対象とする |
| §27.1 | allowlist による関数・型・変数の選択的生成 |
| §27.2 | PjOwnedStr は bindgen 生成後の型（pj_str_t）をラップする |

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M0-1 (#55) | `SipError` / `SipErrorKind`（bindgen 生成コードでエラーハンドリングに使用） |
| M19-1 | build.rs の PJSIP library linking（本チケットの build.rs を拡張する。直列依存） |

**M19-1 との関係**: M17-1 は build.rs に bindgen 設定ブロックを作成する。M19-1 は同じ build.rs に PJSIP ライブラリの探索・ビルド・リンク設定を追加する。本チケット完了後、M19-1 が build.rs の全体を完成させる。本チケットの段階では PJSIP ライブラリがシステムにインストール済みであることを前提とする。

### 設計判断

1. **allowlist で必要最小限に制限**: `pjsua_*`, `pj_*` の全許可ではなく、実際に FFI 層（M17-2〜M17-4, M18）で使用するシンボルのみを許可する。過剰な allowlist はコンパイル時間とバインディングサイズを増大させる。

2. **`--no-layout-tests`**: 現段階ではレイアウトテストを省略する（`unsafe` の FFI 層で後段の結合テストで検証）。

3. **blocklist で不要な型を抑制**: プラットフォーム固有の型（`FILE*`, `time_t` 等）や競合する POSIX 宣言を blocklist で除外する。

4. **PJ_AUTOCONF の扱い**: PJSIP は `autoconf` で生成された `pj/config.h` が platform によって include path を切り替える。`wrapper.h` で必要な定義を事前に `#define` することで autoconf 依存を解決する。

5. **`build.rs` は M17-1 で作成**: 本チケットで最初の `build.rs` を作成する。現時点では bindgen の実行のみ行い、PJSIP ライブラリのリンク（`cargo:rustc-link-lib`）は M19-1 で追加する。

## Investigation

### 証拠 1: build.rs が存在しない

- `ls crates/siprs/build.rs` → `No such file or directory`
- `Cargo.toml` に `[build-dependencies]` セクションも存在しない

### 証拠 2: src/ffi/ ディレクトリが存在しない

- `ls crates/siprs/src/ffi/` → `No such file or directory`
- `src/lib.rs` に `pub mod ffi;` の宣言もない

### 証拠 3: wrapper.h が存在しない

- `find crates/siprs -name "wrapper.h"` → 0 hits

### 証拠 4: Cargo.toml に bindgen の build-dependency がない

- `[build-dependencies]` セクション自体が存在しない
- 現状の依存: `crossbeam-queue`, `dashmap`, `rubato`, `secrecy`, `serde(optional)`, `thiserror`, `tokio`, `tracing`

### 証拠 5: 全 pure Rust モジュールは実装済み

```rust
// src/lib.rs:10-19
pub mod account;
pub mod audio;
pub mod call;
pub mod client;
pub mod config;
pub mod error;
pub mod event;
pub mod runtime;
pub mod transport;
pub mod util;
```

### 証拠 6: 本チケット完了時点で cargo build はリンクエラーになる

M17-1 は bindgen によるコード生成がゴールであり、PJSIP ライブラリのリンク設定は含まない。このため `cargo build` の時点で未定義シンボルのリンクエラーが発生する。これは既知の制約であり、M19-1 で解決する。`cargo check --lib` はリンクを行わないため、型レベルの検証はこれで行う。

## Scope

### 新規ファイル

#### 1. `crates/siprs/wrapper.h` — C ヘッダラッパー

```c
#ifndef SIPRS_WRAPPER_H
#define SIPRS_WRAPPER_H

// PJ_AUTOCONF の代替定義（autoconf 非依存）
#if defined(__APPLE__)
#  define PJ_IS_LITTLE_ENDIAN 1
#  define PJ_IS_BIG_ENDIAN 0
#elif defined(__linux__)
#  define PJ_IS_LITTLE_ENDIAN 1
#  define PJ_IS_BIG_ENDIAN 0
#endif

// ビデオ無効化（必須: §28.3 PJMEDIA_WITH_VIDEO=OFF）
#define PJMEDIA_HAS_VIDEO 0

// PJSIP コアヘッダ
#include <pjsip.h>
#include <pjsip_ua.h>
#include <pjsua-lib/pjsua.h>

// メディアコーデック（Opus 等）
#include <pjmedia-codec/opus.h>

// エラーヘルパー（pj_status_t → 文字列変換用）
#include <pjsip/sip_errno.h>

#endif /* SIPRS_WRAPPER_H */
```

- `PJMEDIA_HAS_VIDEO 0` でビデオ関連コードの生成を抑制（必須）
- `#include` は必要最小限に留める（コンパイル時間短縮）

#### 2. `crates/siprs/build.rs` — bindgen 設定スクリプト

関数抽出により翻訳可能性を確保する：

```rust
use std::env;
use std::path::PathBuf;

/// bindgen 生成バインディングの出力先パスを返す。
fn output_path() -> PathBuf {
    PathBuf::from(env::var("OUT_DIR").unwrap()).join("pjsip_bindings.rs")
}

/// プラットフォーム別の clang include 引数を返す。
///
/// 優先順:
/// 1. PJSIP_INCLUDE_DIR 環境変数（最も確実）
/// 2. 空（システム標準パス、M19-1 で vendor/ 対応を含め拡張）
fn collect_clang_args() -> Vec<String> {
    let mut args = Vec::new();
    if let Ok(dir) = env::var("PJSIP_INCLUDE_DIR") {
        args.push(format!("-I{}", dir));
    }
    args
}

/// allowlist された関数パターンを返す。
fn allowed_functions() -> &'static [&'static str] {
    &[
        "pjsua_.*", "pjsip_.*", "pj_.*", "pjmedia_.*", "pjsua2_.*",
    ]
}

/// allowlist された型パターンを返す。
fn allowed_types() -> &'static [&'static str] {
    &[
        "pjsua_.*", "pjsip_.*", "pj_.*", "pjmedia_.*",
        "pj_str_t", "pj_status_t", "pj_pool_t", "pj_caching_pool",
        "pjsua_acc_id", "pjsua_call_id",
    ]
}

/// allowlist された定数パターンを返す。
fn allowed_vars() -> &'static [&'static str] {
    &["PJSUA_.*", "PJ_.*", "PJSIP_.*"]
}

/// blocklist する型（競合回避）を返す。
fn blocked_types() -> &'static [&'static str] {
    &["FILE", "time_t", "struct_timeval", "sockaddr", "sockaddr_in", "sockaddr_in6"]
}

/// bindgen ビルダーを生成する。
fn create_bindgen_builder(clang_args: &[String]) -> bindgen::Builder {
    let mut builder = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_args(clang_args)
        .derive_debug(true)
        .derive_default(false)
        .generate_comments(true)
        .generate_inline_functions(false)
        .layout_tests(false)
        .prepend_enum_name(false)
        .size_t_is_usize(true);

    for pattern in allowed_functions() {
        builder = builder.allowlist_function(pattern);
    }
    for pattern in allowed_types() {
        builder = builder.allowlist_type(pattern);
    }
    for pattern in allowed_vars() {
        builder = builder.allowlist_var(pattern);
    }
    for pattern in blocked_types() {
        builder = builder.blocklist_type(pattern);
    }

    builder
}

/// バインディングをファイルに書き込む。
fn write_bindings(bindings: bindgen::Bindings, path: &PathBuf) {
    bindings
        .write_to_file(path)
        .expect("bindgen: failed to write bindings");
}

fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");
    let out_path = output_path();
    let clang_args = collect_clang_args();
    let builder = create_bindgen_builder(&clang_args);
    let bindings = builder.generate().expect("bindgen: failed to generate bindings");
    write_bindings(bindings, &out_path);

    // M19-1: PJSIP library linking + source build fallback をここに追加
}
```

#### 3. `crates/siprs/src/ffi/mod.rs` — FFI モジュールルート

```rust
//! # FFI バインディング
//!
//! PJSIP 2.17 C ライブラリの自動生成 FFI バインディング。
//! このモジュール自体は手動編集せず、`build.rs` → `bindgen` で生成される
//! `OUT_DIR/pjsip_bindings.rs` をインクルードする。
//!
//! # Allow 属性
//!
//! 以下の allow は bindgen 生成コードの特性に起因するものであり、
//! 手動コードと同様の lint 基準は適用しない:
//! - `non_upper_case_globals`: C 定数は大文字アンダースコアが慣習
//! - `non_camel_case_types`: C の型名（pjsua_*）は snake_case
//! - `non_snake_case`: C の関数名（pjsua_*）は snake_case
//! - `unused`: 生成コード全体に対する部分利用前提の lint 抑制

#![allow(
    non_upper_case_globals,
    non_camel_case_types,
    non_snake_case,
    unused,
    clippy::all
)]

/// bindgen 生成の PJSIP FFI バインディング。
pub mod bindings {
    include!(concat!(env!("OUT_DIR"), "/pjsip_bindings.rs"));
}

// M17-2 以降で safe ラッパーを追加
```

#### 4. `crates/siprs/src/ffi/bindings.rs`

作成しない。`ffi/mod.rs` の `bindings` サブモジュールが `include!` で自動生成ファイルを読み込むため、このファイルは不要。

### 既存ファイル変更

#### 5. `crates/siprs/Cargo.toml` — build-dependencies 追加

```toml
[build-dependencies]
bindgen = { version = "0.71", default-features = false }
```

- `bindgen 0.71` は 2026年6月時点の最新安定版
- `default-features = false` で `clap` 等の不要依存を抑制
- `clang-sys` 等の必須依存は自動解決される

#### 6. `crates/siprs/src/lib.rs` — ffi モジュール宣言追加

既存のモジュール宣言の末尾に以下を追加：

```rust
/// PJSIP FFI バインディング（bindgen 自動生成）。
pub mod ffi;
```

### 生成バインディングの確認指標

`cargo build` 実行後、以下の主要シンボルが `OUT_DIR/pjsip_bindings.rs` に含まれることを確認する：

| カテゴリ | シンボル | 用途（将来チケット） |
|----------|----------|---------------------|
| 初期化/終了 | `pjsua_create()`, `pjsua_init()`, `pjsua_destroy()` | M17-4 PjsuaBackend |
| イベントループ | `pjsua_handle_events()` | M17-4 |
| アカウント操作 | `pjsua_acc_add()`, `pjsua_acc_del()`, `pjsua_acc_get_count()`, `pjsua_acc_get_info()` | M17-4 |
| 通話操作 | `pjsua_call_make_call()`, `pjsua_call_hangup()`, `pjsua_call_answer()`, `pjsua_call_set_hold()`, `pjsua_call_set_hold2()` | M17-4 |
| コールバック構造体 | `pjsua_callback` | M17-3 Callback bridge |
| 文字列型 | `pj_str_t` | M17-2 PjOwnedStr |
| ステータス型 | `pj_status_t` | M17-2 エラー変換 |
| メディア | `pjsua_conf_port_id` | M18-1 RustMediaPort |
| プール型 | `pj_pool_t`, `pj_caching_pool`, `pj_pool_factory`, `pj_pool_create()`, `pj_pool_release()` | M17-2/M18 |
| 定数 | `PJSUA_INVALID_ID` | アカウント/通話 ID の無効値 |
| 定数 | `PJ_SUCCESS`, `PJ_TRUE`, `PJ_FALSE` | ステータス判定 |

## Non-scope

- **PJSIP ライブラリのリンク設定**: `cargo:rustc-link-lib` や `cargo:rustc-link-search` は M19-1 のスコープ
- **手動 unsafe 宣言**: `extern "C"` での手動 FFI 宣言は禁止。すべて bindgen に任せる
- **safe ラッパー（PjOwnedStr 等）**: M17-2 のスコープ
- **Callback bridge**: M17-3 のスコープ
- **PjsuaBackend**: M17-4 のスコープ
- **build.rs の PJSIP ソースビルド/探索**: M19-1 のスコープ
- **vendor/ ディレクトリ構成**: M19-1 で整備
- **CI でのクロスプラットフォーム検証**: M19-1（prebuilt/source build の仕組みが必要）および M20-1 で実施

## Test Plan

### ユニットテスト計画

本チケットが生成するコードはビルド時に自動生成されるものであり、従来のユニットテストによる検証が困難である。代わりに、以下の代替検証手段を計画する。

#### 代替検証 1: build.rs のコンパイル検証

```bash
# build.rs 自体の構文チェックは cargo check が自動で行う
cargo check -p siprs --lib 2>&1
# 注: リンカ設定がないため --lib での型チェックのみ成功する
```

#### 代替検証 2: 生成バインディングの内容確認

```bash
# cargo build 実行後、生成ファイルを検索
find ./target -name "pjsip_bindings.rs" -type f | head -1 | xargs head -100

# 主要シンボルの存在確認
BINDINGS=$(find ./target -name "pjsip_bindings.rs" -type f | head -1)
grep -q "pub fn pjsua_create" "$BINDINGS" && echo "OK: pjsua_create"
grep -q "pub fn pjsua_init" "$BINDINGS" && echo "OK: pjsua_init"
grep -q "pub fn pjsua_acc_add" "$BINDINGS" && echo "OK: pjsua_acc_add"
grep -q "pub fn pjsua_call_make_call" "$BINDINGS" && echo "OK: pjsua_call_make_call"
grep -q "pub type pj_status_t" "$BINDINGS" && echo "OK: pj_status_t"
grep -q "pub struct pj_str_t" "$BINDINGS" && echo "OK: pj_str_t"
grep -q "PJSUA_INVALID_ID" "$BINDINGS" && echo "OK: PJSUA_INVALID_ID"

# 不要なシンボルがblocklistで除外されていること（blocklistがない場合でも生成されないことを確認）
! grep -q "pub struct FILE" "$BINDINGS" && echo "OK: FILE blocked"
! grep -q "pub type time_t" "$BINDINGS" && echo "OK: time_t blocked"
```

#### 代替検証 3: clang 不在時のエラーハンドリング

```bash
# LIBCLANG_PATH を無効な値にしてエラーメッセージを確認
LIBCLANG_PATH=/nonexistent cargo check -p siprs --lib 2>&1 | grep -i "clang\|libclang\|error"
```

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 生成されたバインディングのコンパイル成功 | PJSIP ライブラリのリンク設定がないため。M19-1 完了後に自動検証可能 |
| 2 | クロスプラットフォーム（macOS/Linux/Windows）での bindgen 生成 | 本番 CI 環境が必要。本チケットでは手動確認 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`build.rs`（新規作成）**: 各処理ブロックを関数に抽出し、関数名で処理内容を語らせる（既に設計判断で反映済み）。`main()` は3行で処理の流れが読める。

2. **`src/ffi/mod.rs`（新規作成）**: `#![allow(...)]` に各理由をコメントで記述（既に反映済み）。`include!` のコメントで「何を include しているか」ではなく「なぜこの方法を取るか」を説明。

3. **`wrapper.h（新規作成）`**: `#define` には必須理由をコメントする。include ガードのコメントは最小限に。

### スコープ外

FFI 層（フェーズ8）は新規作成が中心であり、既存コードへの大規模な Boy Scout 改善は行わない。

## Acceptance Criteria

- [ ] `cargo check -p siprs --lib` が成功すること（lib ターゲットのみの型チェック）
- [ ] `build.rs` が clang 未インストール時に明確なエラーメッセージを出力すること
- [ ] bindgen 生成が完了し、`$OUT_DIR/pjsip_bindings.rs` が作成されること
- [ ] allowlist で許可した主要関数（`pjsua_create`, `pjsua_init`, `pjsua_acc_add`, `pjsua_call_make_call`, `pjsua_call_hangup`, `pjsua_destroy`）が生成バインディングに含まれること
- [ ] allowlist で許可した主要型（`pj_str_t`, `pj_status_t`, `pjsua_acc_id`, `pjsua_call_id`, `pjsua_callback`）が生成バインディングに含まれること
- [ ] 主要定数（`PJSUA_INVALID_ID`, `PJ_SUCCESS`）が生成バインディングに含まれること
- [ ] blocklist でブロックした型（`FILE`, `time_t`）が生成バインディングに含まれないこと
- [ ] `#![allow(...)]` が適切に設定され、clippy 警告を抑制していること
- [ ] `cargo fmt` が build.rs, ffi/mod.rs, wrapper.h に適用可能であること
- [ ] 翻訳可能性: build.rs の関数名が動詞句で処理内容を語っていること

## Notes

### M19-1 との連携

```text
M17-1 (#131) ──→ build.rs 作成（bindgen 設定のみ）
                     │
                     ↓
M19-1         ──→ build.rs 拡張（PJSIP library linking + source build fallback）
```

M17-1 で作成した `build.rs` に、M19-1 で以下を追加する:
- `vendor/prebuilt/{target}/lib/` の探索による `cargo:rustc-link-search` の設定
- 各 PJSIP ライブラリに対する `cargo:rustc-link-lib=...` の出力
- CMake によるソースビルドフォールバック
- `cargo:rerun-if-changed=vendor/` の追加
- OS 別 system framework のリンク（macOS: CoreAudio 等）

### STUB 対応

本チケットはフェーズ8 の最初のチケットであり、既存の STUB（フェーズ7 以前）が本チケットで解決されることはない。

### システム要件（bindgen の前提）

- **macOS**: `brew install llvm`（libclang が必要）
- **Linux**: `apt-get install llvm-dev libclang-dev`
- **Windows**: `choco install llvm`（`LIBCLANG_PATH` 環境変数が必要）

bindgen は `LIBCLANG_PATH` 環境変数で clang のパスを指定可能。
