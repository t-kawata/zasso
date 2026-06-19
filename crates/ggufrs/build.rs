//! build.rs — GGUF モデルファイル自動ダウンロード
//!
//! 移植元: crates/voiput/build.rs（同一方式）
//!
//! ビルド時に2つのビルトインモデル（Qwen3.5-0.8B-Q4_K_M, Qwen3.5-2B-Q4_K_M）を
//! Hugging Face から自動ダウンロードする。ダウンロードは curl（Unix）または
//! powershell（Windows）で行い、新規依存クレートを追加しない。

use std::path::PathBuf;
use std::process::Command;

/// ダウンロードするモデルファイル一覧（ファイル名, URL）
///
/// Hugging Face unsloth リポジトリから2つのビルトインモデルをダウンロードする。
/// ファイル名は ModelConfig のビルトインコンストラクタ（model_path）と一致させる。
const MODEL_FILES: &[(&str, &str)] = &[
    (
        "Qwen3.5-0.8B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    ),
    (
        "Qwen3.5-2B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    ),
];

/// curl ダウンロードのタイムアウト（秒）
///
/// consts/settings.rs の CURL_TIMEOUT_SECS（60）と整合させる。
const CURL_TIMEOUT_SECS: &str = "60";

fn main() {
    let model_dir = model_directory();

    // モデル格納ディレクトリを作成する
    std::fs::create_dir_all(&model_dir).expect("failed to create models/ directory");

    // 存在しないモデルファイルのみダウンロードする
    for (filename, url) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            println!("cargo:warning=Downloading {}...", filename);
            download_file(url, &file_path);
        }
    }

    // 全モデルファイルの存在を確認する
    for (filename, _) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        assert!(
            file_path.exists(),
            "Model file not found: {}. Try running `cargo build` again.",
            file_path.display()
        );
    }

    // モデルディレクトリの内容が変更された場合のみ再ビルドする
    println!("cargo:rerun-if-changed=models/");
}

/// モデル格納ディレクトリのパスを返す
///
/// CARGO_MANIFEST_DIR/models/ を基準とする。
fn model_directory() -> PathBuf {
    let manifest_dir =
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set by Cargo");
    PathBuf::from(manifest_dir).join("models")
}

/// Unix 環境で curl を使用してファイルをダウンロードする
#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &PathBuf) {
    let status = Command::new("curl")
        .args([
            "-sS",
            "-L",
            "-m",
            CURL_TIMEOUT_SECS,
            "-o",
            &dest.to_string_lossy(),
            url,
        ])
        .status()
        .expect("Failed to execute curl. Is curl installed?");
    assert!(status.success(), "Failed to download: {url}");
}

/// Windows 環境で PowerShell を使用してファイルをダウンロードする
#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &PathBuf) {
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "[Net.ServicePointManager]::SecurityProtocol = \
                 [Net.SecurityProtocolType]::Tls12; \
                 Invoke-WebRequest -Uri '{url}' -OutFile '{dest}'",
            ),
        ])
        .status()
        .expect("Failed to execute PowerShell.");
    assert!(status.success(), "Failed to download: {url}");
}
