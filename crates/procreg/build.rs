//! process-registry ビルドスクリプト
//!
//! watchdog バイナリをコンパイルし、ライブラリに埋め込む。
//! rustc を直接呼び出して minimal な監視バイナリを生成する。

use std::path::PathBuf;

fn main() {
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let target = std::env::var("TARGET").unwrap();

    // 出力ファイル名（プラットフォームによって拡張子が異なる）
    let exe_name = if target.contains("windows") {
        "procreg-watchdog.exe"
    } else {
        "procreg-watchdog"
    };
    let output_path = out_dir.join(exe_name);

    // watchdog ソースのパス（Cargo.toml のあるディレクトリからの相対パス）
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let watchdog_src = manifest_dir.join("watchdog").join("src").join("main.rs");

    if !watchdog_src.exists() {
        panic!(
            "Watchdog source not found at: {}",
            watchdog_src.display()
        );
    }

    // rustc を呼び出して watchdog をコンパイルする
    let status = std::process::Command::new("rustc")
        .args([
            watchdog_src.to_str().unwrap(),
            "-o",
            output_path.to_str().unwrap(),
            "--edition",
            "2021",
            "--target",
            &target,
            "--crate-type",
            "bin",
        ])
        .status()
        .expect("rustc not found — ensure Rust toolchain is installed");

    assert!(
        status.success(),
        "Watchdog compilation failed for target {target}"
    );

    // OUT_DIR をライブラリコンパイル時に参照可能にする
    println!(
        "cargo:rustc-env=PROCREG_OUT_DIR={}",
        out_dir.display()
    );

    // ソースが変更された場合のみ再ビルド
    println!("cargo:rerun-if-changed=watchdog/src/main.rs");
}
