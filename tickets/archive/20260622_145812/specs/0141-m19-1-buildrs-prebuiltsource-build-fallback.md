---
ticket_id: 141
title: "M19-1: build.rs — prebuilt優先・source build fallback"
slug: m19-1-buildrs-prebuiltsource-build-fallback
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0141-m19-1-buildrs-prebuiltsource-build-fallback/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0141-m19-1-buildrs-prebuiltsource-build-fallback/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0141-m19-1-buildrs-prebuiltsource-build-fallback/review.md
---
# M19-1: `build.rs` — prebuilt優先・source build fallback

## Summary

現在の `build.rs` は PJSIP ヘッダ不在時にスタブバインディングを生成するだけである。
M19-1 では、`vendor/prebuilt/{target}/` のプレビルドライブラリを優先し、
存在しない場合は `vendor/pjsip/` のソースコードを CMake でビルドする二段階戦略を実装する。
これにより `cargo build -p siprs` 一発で PJSIP リンク済みの実バインディングが生成される。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§28, §28.1, §28.2, §28.3, §28.4)

## Background

### なぜ必要か

現在の `build.rs` は PJSIP がない環境でもコンパイルを通すためにスタブを生成している。
その結果、以下の問題がある:

1. **FFI 型が手動定義** (`ffi/strings.rs`, `ffi/callbacks.rs`, `ffi/media.rs`) であり、
   bindgen の自動生成型と乖離するリスクがある
2. **PjsuaBackend が全メソッド unimplemented!()** — PJSIP なしでは実際の SIP 処理ができない
3. **`AudioBridge::connect_to_conference()` がスタブ** — PJSIP conference bridge に接続できない
4. **`cargo:rustc-link-lib` / `cargo:rustc-link-search` が未出力** — PJSIP ライブラリがリンクされない

これらの問題を解決するため、`build.rs` に PJSIP の検索・ビルド・リンクの全自動パイプラインを実装する。

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §28 | build.rs 戦略全体: prebuilt優先 → source build fallback |
| §28.1 | 探索順序: `vendor/prebuilt/{target-triple}/lib/` → `vendor/pjsip/` CMake build |
| §28.2 | build script 擬似実装: 4 関数 (prebuilt_available, emit_link_directives, build_pjsip_from_source, generate_bindings) |
| §28.3 | cmake flags: `PJMEDIA_WITH_VIDEO=OFF` mandatory, TLS/SRTP feature flag 連動 |
| §28.4 | OS別システムパッケージ依存関係: Ubuntu (alsa, ssl, uuid), macOS (CoreAudio, CoreFoundation), Windows (MSVC, vcpkg) |

## Investigation

### 証拠 1: 現在の build.rs は探索ロジックを持たない

**ファイル:** `crates/siprs/build.rs:160-183`

```rust
fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");
    let out_path = output_path();
    let clang_args = collect_clang_args();
    let builder = create_bindgen_builder(&clang_args);
    match builder.generate() {
        Ok(bindings) => { write_bindings(bindings, &out_path); }
        Err(e) => {
            print_installation_guide();
            // ...
            write_stub_bindings(&out_path);
        }
    }
    // M19-1: PJSIP library linking + source build fallback をここに追加
}
```

`main()` は bindgen 生成のみを行い、ライブラリ探索・リンク指示を一切行っていない。
M19-1 でこのコメント箇所に本実装を追加する。

### 証拠 2: vendor/ ディレクトリは未作成

```bash
$ ls crates/siprs/vendor/
ls: cannot access 'crates/siprs/vendor/': No such file or directory
```

`vendor/prebuilt/{target}/lib/` と `vendor/pjsip/` の両ディレクトリが存在しない。
本チケットではディレクトリ構造のみ作成し（空ディレクトリ）、PJSIP ソースの取得は
利用者（開発者）の手動操作に委ねる。

### 証拠 3: cmake はインストール済み（macOS）

```bash
$ which cmake && cmake --version
/opt/homebrew/bin/cmake
cmake version 4.2.3
```

CMake は利用可能だが `pkg-config` は未インストール。
macOS では `brew install pkg-config cmake` が §28.4 の必要条件。

### 証拠 4: Cargo.toml に cmake build-dependency がない

```toml
[build-dependencies]
bindgen = { version = "0.71", default-features = false }
```

`cmake` crate (https://crates.io/crates/cmake) を build-dependency として追加する必要がある。
この crate は CMake の呼び出しを抽象化し、`cmake::Config::new("vendor/pjsip")` のような
Rustic な API を提供する。

### 証拠 5: 全 M19-1 参照スタブ（解決対象）

`grep` 結果から、M19-1 の解決により影響を受けるスタブは以下の 5 箇所:

| ファイル | 行 | スタブ内容 | 解決内容 |
|----------|-----|-----------|---------|
| `build.rs:152` | スタブバインディング | bindgen による実バインディング生成に置き換え（可能な場合） |
| `build.rs:182` | `// M19-1: ...追加` | リンク指示 + source build fallback を実装 |
| `ffi/pjsua_backend.rs:102` | 全メソッド unimplemented!() | `#[cfg(feature = "pjsip")]` で実 impl に切り替え可能に |
| `ffi/media.rs:231` | connect_to_conference スタブ | `pjsua_conf_connect()` 呼び出し（cfg 切替） |
| `ffi/media.rs:247` | disconnect スタブ | `pjsua_conf_disconnect()` 呼び出し（cfg 切替） |
| `runtime/reactor.rs:178` | AccountConfigPatch スタブ | 引き続き保留（M19-2 以降） |

**注意:** 上記のうち `pjsua_backend.rs` と `media.rs` のスタブは「PJSIP 利用可能時に本物の
API を呼び出す実装」への置き換えを意味する。これは `#[cfg(feature = "pjsip")]` の条件付き
コンパイルにより行い、`pjsip` feature 無効時は引き続きスタブを使用する。

### 証拠 6: wrapper.h に PJSIP ヘッダが直接インクルードされている

```c
#include <pjsip.h>
#include <pjsip_ua.h>
#include <pjsua-lib/pjsua.h>
#include <pjmedia-codec/opus.h>
#include <pjsip/sip_errno.h>
```

これらのヘッダは PJSIP インストールが存在する環境でのみ利用可能。
source build 成功後は `OUT_DIR/pjsip-build/include/` 以下に配置される。

### 証拠 7: pjsip feature フラグは既に定義済み

`Cargo.toml`:
```toml
[features]
pjsip = []
```

この feature フラグは既に存在する。M19-1 ではこれを build.rs の条件分岐で参照する。
ただし現状では `cargo build` に `--features pjsip` を渡しても PJSIP がリンクされないため
意味をなさない。M19-1 の完了により `--features pjsip` が実質的な意味を持つ。

## Scope

### 1. `crates/siprs/Cargo.toml` — cmake build-dependency 追加

```toml
[build-dependencies]
bindgen = { version = "0.71", default-features = false }
cmake = "0.1"  # 追加
```

`cmake` crate (v0.1) は CMake ラッパーとして定番。CMake の呼び出し・生成物パスの解決を提供する。

### 2. `crates/siprs/build.rs` — 全体的な再構成

**新規関数:**

```rust
/// 必須 PJSIP ライブラリ名の一覧を返す。
fn required_libraries() -> &'static [&'static str] {
    &["pjsua2", "pj", "pjlib-util", "pjmedia", "pjnath", "pjsip", "resample"]
}

/// prebuilt ディレクトリに全必須ライブラリが存在するか確認する。
fn prebuilt_available(prebuilt_lib_dir: &Path) -> bool {
    // .a / .so / .dylib / .lib の存在確認
}

/// リンカ指示を出力する。
fn emit_link_directives(lib_dir: &Path) {
    // cargo:rustc-link-search={lib_dir}
    // cargo:rustc-link-lib=static=pjsua2 など
}

/// PJSIP ソースを CMake でビルドする。
fn build_pjsip_from_source(src_dir: &Path, build_dir: &Path) -> PathBuf {
    // cmake::Config::new(src_dir)
    //   .define("PJMEDIA_WITH_VIDEO", "OFF")
    //   .define("CMAKE_INSTALL_PREFIX", build_dir)
    //   .build();
    // build_dir.join("lib") を返す
}

/// bindgen を実行する（共通化）。
fn generate_bindings(clang_include_dir: Option<&Path>) {
    // collect_clang_args() に vendor/ include パスを追加可能に
}
```

**`main()` の制御フロー:**

```rust
fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");
    println!("cargo:rerun-if-changed=vendor/");

    let target = env::var("TARGET").expect("TARGET is not set");
    let prebuilt_lib_dir = PathBuf::from("vendor/prebuilt").join(&target).join("lib");

    // Step 1: prebuilt 探索
    if prebuilt_available(&prebuilt_lib_dir) {
        println!("cargo:warning=Using prebuilt PJSIP for {target}");
        emit_link_directives(&prebuilt_lib_dir);
        generate_bindings(Some(&prebuilt_lib_dir.join("include")));
        return;
    }

    // Step 2: source build fallback
    let src_dir = PathBuf::from("vendor/pjsip");
    if src_dir.exists() {
        println!("cargo:warning=Building PJSIP from source ({})", src_dir.display());
        match build_pjsip_from_source(&src_dir) {
            Ok(build_dir) => {
                emit_link_directives(&build_dir.join("lib"));
                generate_bindings(Some(&build_dir.join("include")));
            }
            Err(e) => {
                print_cmake_instructions(&target);
                panic!("PJSIP build failed: {e}");
            }
        }
        return;
    }

    // Step 3: PJSIP 不在 → スタブ（development mode）
    eprintln!("cargo:warning=PJSIP not found — using stub bindings");
    write_stub_bindings(&output_path());
}
```

**`build_pjsip_from_source` の CMake 設定:**

```rust
fn build_pjsip_from_source(src_dir: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dst = cmake::Config::new(src_dir)
        .define("PJMEDIA_WITH_VIDEO", "OFF")
        .define("PJ_HAS_SSL", if cfg_enabled("tls") { "ON" } else { "OFF" })
        .define("PJMEDIA_HAS_SRTP", if cfg_enabled("srtp") { "ON" } else { "OFF" })
        .build();
    Ok(dst)
}
```

**`cfg_enabled` ヘルパー:**

```rust
fn cfg_enabled(feature: &str) -> bool {
    env::var(format!("CARGO_FEATURE_{}", feature.to_uppercase())).is_ok()
}
```

### 3. `crates/siprs/build.rs` — collect_clang_args の拡張

現在の `collect_clang_args()` は `PJSIP_INCLUDE_DIR` のみを参照する。
M19-1 では `vendor/prebuilt/{target}/include/` および
`OUT_DIR/pjsip-build/include/` も検索パスに追加する:

```rust
fn collect_clang_args(prebuilt_include: Option<&Path>) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(dir) = prebuilt_include {
        args.push(format!("-I{}", dir.display()));
    }
    if let Ok(dir) = env::var("PJSIP_INCLUDE_DIR") {
        args.push(format!("-I{dir}"));
    }
    args
}
```

### 4. 既存スタブの解決（conditionally）

以下のスタブは `#[cfg(feature = "pjsip")]` の条件付きコンパイルで
実際の PJSIP API 呼び出しに切り替わる準備をする:

- **`ffi/pjsua_backend.rs`**: `#[cfg(feature = "pjsip")]` ブロック内の
  コメントアウトされた実装を有効化（todo!() → 実際の呼び出しは後続チケット）
- **`ffi/media.rs`**: `connect_to_conference()` / `disconnect()` の
  PJSIP API 呼び出しスタブを `#[cfg(feature = "pjsip")]` で条件分岐

### 5. vendor/ ディレクトリ構造の作成

```text
crates/siprs/vendor/
├── pjsip/          # ← 利用者が手動配置（git clone または tarball）
└── prebuilt/
    └── {target}/
        └── lib/    # ← 利用者が手動配置（prebuilt バイナリ）
```

`vendor/` ディレクトリ自体は git 管理するが、中身（`vendor/pjsip/` のソース等）は
`.gitignore` で除外する。空の `.gitkeep` を配置してディレクトリ構造のみ管理する。

## Non-scope

- **PJSIP ソースの自動ダウンロード**: 本チケットでは `vendor/pjsip/` の自動取得は行わない。
  利用者は事前に `vendor/pjsip/` に PJSIP 2.17 ソースを配置する必要がある。
  自動ダウンロードは将来の改善チケットで対応する。
- **PjsuaBackend の完全実装**: `#[cfg(feature = "pjsip")]` の条件分岐まで。
  実際の `pjsua_create()` → `pjsua_init()` → ... の呼び出しは別チケットで対応。
- **M19-2 (feature flags)**: TLS/SRTP feature flag の定義は既に存在する。
  build.rs で参照するのみで、コード全体への cfg 適用は M19-2。
- **M19-3 (metrics)**: 本チケットでは metrics は扱わない。
- **prebuilt バイナリの作成**: prebuilt バイナリ自体をこのチケットで作るわけではない。
  利用者が別途ビルドしたバイナリを `vendor/prebuilt/` に配置する運用。
- **CI での PJSIP ビルド**: CI 設定は M20 のスコープ。

## Test Plan

### build.rs のテスト方法

build.rs はユニットテスト不可能（ビルドスクリプトは `#[cfg(test)]` にコンパイルされない）。
代わりに以下の検証を行う:

#### 検証 1: `cargo build -p siprs`（PJSIP なし → スタブ）

```bash
cd crates/siprs && cargo check 2>&1
```

- PJSIP 不在時のスタブバインディング生成が成功すること
- 既存の全テストが通過すること

#### 検証 2: `cargo build -p siprs --features pjsip`（vendor/pjsip なし → エラー）

```bash
cd crates/siprs && cargo check --features pjsip 2>&1
```

- `vendor/pjsip/` がない場合、「PJSIP ソースが見つかりません」という
  明確なエラーメッセージが表示されること

#### 検証 3: vendor/pjsip 配置後のビルド（手動）

- PJSIP 2.17 ソースを `vendor/pjsip/` に配置し、`cargo build --features pjsip` が成功すること
- ビルドログに "Building PJSIP from source" が含まれること
- `PJMEDIA_WITH_VIDEO=OFF` が CMake ログで確認できること

#### 検証 4: リンク指示の確認

```bash
cd crates/siprs && cargo build --features pjsip -vv 2>&1 | grep "cargo:rustc-link"
```

- 全必須ライブラリ（pjsua2, pj, pjlib-util, pjmedia, pjnath, pjsip, resample）が
  リンク指示に含まれていること

#### 検証 5: bindgen 実バインディングの確認

- `OUT_DIR/pjsip_bindings.rs` にスタブでない実コードが生成されていること
- 生成コードに `pjsua_create`, `pjsua_init`, `pjsua_start` 等の関数宣言が含まれていること

#### 検証 6: cmake 不在時のエラーメッセージ

- cmake がインストールされていない環境でソースビルドが開始された場合、
  "Please install cmake" のエラーメッセージが表示されること

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | CMake による実際の PJSIP ビルド | PJSIP 2.17 ソースが必要。自動テスト環境では提供不可。手動テストで検証 |
| 2 | prebuilt 優先ロジック | prebuilt バイナリが必要。手動テストで検証 |
| 3 | bindgen 実バインディング生成 | PJSIP ヘッダが必要。手動テストで検証 |
| 4 | 全 OS でのビルド確認 | macOS arm64 / Ubuntu x86_64 / Windows x86_64 の各環境が必要。CI で検証（M20） |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`build.rs` の関数分割**: 現在の `main()` は責務が混在している。
   M19-1 で `prebuilt_available()` / `emit_link_directives()` / `build_pjsip_from_source()` /
   `generate_bindings()` に分割することで、`main()` が「探索→ビルド→リンク→バインディング生成」
   という一文として読めるようにする。

2. **`print_installation_guide()` の改善**: 現在のエラーメッセージは「PJSIP headers not found」
   とだけ表示し、`vendor/pjsip/` への参照がない。OS 別のより具体的な手順に更新する。

3. **`write_stub_bindings()` のメッセージ改善**: 「Real bindings will be generated in M19-1」
   から「Run `cargo build -p siprs --features pjsip` with PJSIP source in vendor/pjsip/」に変更し、
   利用者が次のアクションを即座に理解できるようにする。

4. **`cfg_enabled()` ヘルパーの導入**: feature flag の有無を判定するロジックを
   名前付き関数に抽出することで、コードとしての翻訳可能性を高める。

### その他の修正

- `build.rs` 内の `// M19-1: ...` コメントを削除（本チケットで解決するため）
- スタブバインディングファイルに「legacy stub — prebuilt/source build failed」の注記を追加

## Acceptance Criteria

- [ ] `cargo check -p siprs`（PJSIP なし）が成功し、スタブバインディングが生成されること
- [ ] `cargo test -p siprs`（PJSIP なし）が全テスト通過すること（390 テスト維持）
- [ ] `cmake` crate が build-dependencies に追加されていること
- [ ] `vendor/` ディレクトリ構造が作成されていること（`.gitkeep`）
- [ ] `vendor/pjsip/` なしで `--features pjsip` → 明確なエラーメッセージ
- [ ] `cargo:rerun-if-changed=vendor/` が設定されていること
- [ ] `build.rs` の `main()` が「prebuilt 探索 → source build → stub fallback」の三段階フローとして読めること
- [ ] 全 M19-1 参照スタブが評価され、解決可能なものは条件付きで実装に置き換えられていること
- [ ] `cargo fmt --check` 通過
- [ ] `make check-be` 成功（プロジェクト全体のビルドに影響しないこと）

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| M17-1 (#131) | 先行: bindgen 設定済み（本チケットで実バインディング化） |
| M17-4 (#138) | 依存: PjsuaBackend の cfg 条件分岐の準備 |
| M18-1 (#139) | 依存: RustMediaPort の cfg 条件分岐の準備 |
| M18-2 (#140) | 依存: AudioBridge の PJSIP API 呼び出しの準備 |
| M19-2 (#142) | 後続: feature flags の本格的なコード適用 |
| M19-3 (#143) | 後続: metrics カウンター |

### M19 マイルストーン

```text
M19-1 (#141) ──→ build.rs prebuilt優先・source build fallback
                     │
M19-2 (#142)    ──→ feature flags 設定
                     │
M19-3 (#143)    ──→ metrics カウンター配線
```

### スタブ解決ポリシー

M19-1 では以下の方針でスタブを解決する:

1. **build.rs 内のスタブ**: 完全解決。本物の探索・ビルド・リンクロジックに置き換える。
   PJSIP 不在時はスタブフォールバックを維持（ただし improved message）。
2. **pjsua_backend.rs / media.rs のスタブ**: `#[cfg(feature = "pjsip")]` 条件付きで
   実装パスを追加する。実際の PJSIP API 呼び出しは行わず、`todo!()` のままとする。
   これは「PJSIP feature 有効時には unimplemented!() ではなく build を通すための準備」。
3. **reactor.rs の AccountConfigPatch スタブ**: 本チケットでは解決しない（M19-2 以降）。
