---
ticket_id: 143
title: "build.rs: prebuilt auto-deploy after source build"
slug: buildrs-prebuilt-auto-deploy-after-source-build
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0143-buildrs-prebuilt-auto-deploy-after-source-build/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0143-buildrs-prebuilt-auto-deploy-after-source-build/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0143-buildrs-prebuilt-auto-deploy-after-source-build/review.md
---
# build.rs: prebuilt auto-deploy after source build

## Summary

現在 `cargo build --features pjsip` を実行するたびに cmake ビルドが走る。
これは毎回 20 秒近い待ち時間を発生させている。本チケットでは cmake ビルド成功後、
自動的に `vendor/prebuilt/{TARGET}/lib/` へ全 .a ファイルをコピーする処理を build.rs
に追加する。2 回目以降は prebuilt が検出され、cmake をスキップして即座にリンクされる。
OS ごとの差異は target-triple で自動吸収される。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§28.1)

## Background

### なぜ必要か

RFC §28.1 は「prebuilt 優先 → source build fallback」の二段階戦略を定めているが、
現状は source build で生成されたライブラリを prebuilt ディレクトリへ自動配置しない。
そのため 1 度 cmake ビルドが成功しても次回の `cargo clean` または別の開発環境で
再度 cmake が実行される。source build の成果物を `vendor/prebuilt/{TARGET}/` に
永続化することで、チーム全体でのビルド時間短縮と CI 効率化を図る。

### target-triple による OS 吸収

```
vendor/prebuilt/
├── aarch64-apple-darwin/lib/*.a   ← macOS ARM64
├── x86_64-apple-darwin/lib/*.a    ← macOS Intel
├── x86_64-unknown-linux-gnu/lib/*.a ← Linux
└── x86_64-pc-windows-msvc/lib/*.lib ← Windows
```

同一 target-triple の環境では cmake 再実行不要となる。

## Investigation

### 証拠 1: 毎回 cmake が再実行される

```bash
$ cargo build -p siprs --features pjsip -vv 2>&1 | grep PJSIP
warning: siprs@0.1.0: Configuring PJSIP...
warning: siprs@0.1.0: Building PJSIP...
warning: siprs@0.1.0: PJSIP build completed
```

`vendor/prebuilt/` が空のため、`prebuilt_available()` が毎回 `false` を返し、
必ず cmake ビルドパスが実行される。cmake ビルドには約 20 秒かかる。

### 証拠 2: prebuilt_available() の確認ロジック

`prebuilt_lib_dir` に全必須ライブラリの `.a` ファイルが存在すれば `true` を返す。
実装は整っており、prebuilt 配置後の検出ロジックは修正不要。

### 証拠 3: ビルド成果物の実ファイル

cmake ビルド後の最新 OUT_DIR:
```
.../out/pjsip-install/bin/
├── libpjlib.a, libpjlib-util.a, libpjmedia.a, ...
└── pjproject/third_party/
    ├── libspeex.a, libresample.a, libgsm.a, ...
```

`collect_libraries()` は `find` ですべての `.a` を検出済み。
あとは同一ファイル群を `vendor/prebuilt/{TARGET}/lib/` へコピーするだけ。

## Scope

### ビルドスクリプト: `build.rs` のみ

新規関数 `deploy_prebuilt()` を追加し、`main()` の source build 成功パス内で呼び出す。

```rust
/// cmake ビルド成果物を vendor/prebuilt/{TARGET}/ に永続化する。
///
/// 次回以降のビルドは prebuilt 優先パスが使われ、cmake がスキップされる。
fn deploy_prebuilt(install_prefix: &Path, target: &str) -> Result<(), String> {
    let prebuilt_lib_dir = PathBuf::from("vendor/prebuilt").join(target).join("lib");
    let prebuilt_inc_dir = PathBuf::from("vendor/prebuilt").join(target).join("include");

    // lib/ ディレクトリを作成し、全 .a をコピー
    std::fs::create_dir_all(&prebuilt_lib_dir)
        .map_err(|e| format!("failed to create prebuilt lib dir: {e}"))?;

    let output = Command::new("find")
        .arg(install_prefix)
        .arg("-name").arg("*.a").arg("-type").arg("f")
        .output()
        .map_err(|e| format!("find failed: {e}"))?;

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let lib_path = PathBuf::from(line);
        if lib_path.exists() {
            let dest = prebuilt_lib_dir.join(lib_path.file_name().unwrap());
            std::fs::copy(&lib_path, &dest)
                .map_err(|e| format!("failed to copy {}: {e}", lib_path.display()))?;
        }
    }

    // include/ ディレクトリをコピー
    let src_include = install_prefix.join("include");
    if src_include.exists() {
        let _ = std::fs::remove_dir_all(&prebuilt_inc_dir);
        copy_dir_recursive(&src_include, &prebuilt_inc_dir)
            .map_err(|e| format!("failed to copy include dir: {e}"))?;
    }

    Ok(())
}

/// ディレクトリを再帰的にコピーする。
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}
```

### main() への組み込み箇所

現在の source build 成功パス（build.rs 内）:

```rust
// Step 2: source build fallback
if src_dir.exists() {
    match build_pjsip_from_source(&src_dir, &out_dir) {
        Ok(install_prefix) => {
            let flat_lib_dir = out_dir.join("pjsip-lib");
            match collect_libraries(&install_prefix, &flat_lib_dir) {
                Ok(lib_dirs) => {
                    // ★ 追加: prebuilt へ自動配置
                    let _ = deploy_prebuilt(&install_prefix, &target);
                    // ...
```

`deploy_prebuilt()` の成否はビルドの継続に影響しない（エラーでも cmake 成果物でリンクは可能）。そのため `let _ = deploy_prebuilt(...)` でエラーを握り潰し、ビルドを阻害しない。

## Non-scope

- **Windows 対応の完全性**: `find` コマンドは Unix 前提。Windows では `dir /s /b *.a` 相当の処理が必要だが、本チケットでは macOS/Linux を優先し、Windows は後続対応とする。
- **cmake crate の再導入**: 現在 `std::process::Command` で直接 cmake を呼んでいる。prebuilt 配置に cmake crate は不要。
- **prebuilt のバージョン管理**: `vendor/prebuilt/` が git 管理下に入るかどうかは本チケットの対象外。

## Test Plan

build.rs はユニットテスト不可能。以下を手動検証する:

| # | 検証内容 | コマンド | 期待結果 |
|---|---------|---------|---------|
| 1 | 初回: prebuilt なし → cmake ビルド + 自動配置 | `cargo build -p siprs --features pjsip` | cmake 実行後 `vendor/prebuilt/{TARGET}/lib/` に `.a` が存在 |
| 2 | 2回目: prebuilt あり → cmake スキップ | `cargo build -p siprs --features pjsip` | "Using prebuilt PJSIP" の warning が出力され cmake がスキップされる |
| 3 | 配置された .a ファイルの数 | `ls vendor/prebuilt/{TARGET}/lib/*.a \| wc -l` | 18 以上 |
| 4 | include/ がコピーされている | `ls vendor/prebuilt/{TARGET}/include/pjlib/` | ディレクトリが存在 |
| 5 | デグレ確認 | `cargo test -p siprs && make check-be` | 全テスト通過 |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | cmake ビルド + ファイル配置 | PJSIP ソースと cmake が必要。build.rs 内でしか実行不可 |
| 2 | prebuilt 検出後の cmake スキップ | 同上 |

## Boy Scout Rule — 翻訳可能性計画

- `deploy_prebuilt()` 関数名は「prebuilt を配置する」という動詞句として読める。
- `main()` の三段階フローは変更せず、source build 成功パス内の 1 行追加で済ませる。
- `copy_dir_recursive()` は標準的な再帰コピーパターンで、コメントなしでも動作が明白。

## Acceptance Criteria

- [ ] `cargo build -p siprs --features pjsip`（初回）で cmake ビルド後、`vendor/prebuilt/{TARGET}/lib/` に全 .a が自動コピーされること
- [ ] `cargo build -p siprs --features pjsip`（2 回目）で "Using prebuilt PJSIP" が出力され cmake がスキップされること
- [ ] `cargo test -p siprs`（全 390）通過
- [ ] `cargo test -p siprs --features pjsip`（全 389）通過
- [ ] `make check-be` 成功
- [ ] `cargo fmt --check` 通過

## Notes

### 依存・関連チケット

| チケット | 関係 |
|---------|------|
| #141 (M19-1) | 先行: build.rs 三段階フロー実装済み |
| #142 (M19-1b) | 先行: build.rs cmake 直接呼び出し実装済み |
| #131 (M17-1) | 先行: bindgen + prebuilt_available() 実装済み |
