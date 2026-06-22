//! build.rs — GGUF モデルファイル自動ダウンロード
//!
//! 移植元: crates/voiput/build.rs（同一方式）
//!
//! ビルド時にビルトインモデル（Qwen3.5-0.8B-Q4_K_M, Qwen3.5-2B-Q4_K_M、
//! Gemma4 E2B, Gemma4 E4B）4つの GGUF モデルを Hugging Face から自動ダウンロードする。
//! また、cargo feature（metal / cuda）に応じて cmake 環境変数を設定し、
//! llama-cpp-2 の GPU バックエンドビルドを制御する。
//! ダウンロードは curl（Unix）または powershell（Windows）で行い、
//! 新規依存クレートを追加しない。

use std::path::{Path, PathBuf};
use std::process::Command;

/// ダウンロードするモデルファイル一覧（ファイル名, URL）
///
/// Hugging Face unsloth リポジトリから2つのビルトイン GGUF モデル（Qwen3.5 シリーズ）、
/// および2つの Gemma4 GGUF モデルをダウンロードする。
/// ファイル名（相対パス）は ModelConfig のビルトインコンストラクタ（model_path）と一致させる。
const MODEL_FILES: &[(&str, &str)] = &[
    // Qwen3.5 GGUF モデル（維持: 将来 mistralrs 対応時の再利用に備える）
    (
        "Qwen3.5-0.8B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    ),
    (
        "Qwen3.5-2B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    ),
    // Gemma4 E2B GGUF モデル（≈3.1GB, Q4_K_M 量子化）
    (
        "gemma-4-E2B-it-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
    ),
    // Gemma4 E4B GGUF モデル（≈5.0GB, Q4_K_M 量子化）
    (
        "gemma-4-E4B-it-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
    ),
];

/// curl ダウンロードのタイムアウト（秒）
///
/// consts/settings.rs の CURL_TIMEOUT_SECS（600）と整合させる。
/// 3.1GB（Gemma4 E2B）のダウンロードには十分な余裕を持たせる。
const CURL_TIMEOUT_SECS: &str = "600";

fn main() {
    // cargo feature に応じて cmake 環境変数を設定する
    // llama-cpp-2 の build.rs がこれらの環境変数を読み取り、
    // llama.cpp の C++ ソースを対応する GPU バックエンド付きでコンパイルする
    #[cfg(feature = "metal")]
    {
        println!("cargo:rustc-cfg=feature=\"metal\"");
        std::env::set_var("LLAMA_METAL", "ON");
    }

    #[cfg(feature = "cuda")]
    {
        std::env::set_var("LLAMA_CUDA", "ON");
    }

    let model_dir = model_directory();

    // モデル格納ディレクトリを作成する
    std::fs::create_dir_all(&model_dir).expect("failed to create models/ directory");

    // 存在しないモデルファイルのみダウンロードする
    // ダウンロード失敗時は警告を出力するが、ビルド自体は継続する
    // （モデルファイルが存在しない場合、test-run 等の実行時にエラーとなる）
    for (filename, url) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            // 全モデルは models/ 直下に配置するため parent は常に models/ 以下になる
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent).expect("failed to create model subdirectory");
            }
            println!("cargo:warning=Downloading {}...", filename);
            if !download_file(url, &file_path) {
                println!("cargo:warning=Failed to download {filename}. Run `cargo build` again to retry.");
            }
        }
    }

    // 全モデルファイルの存在確認（不足時は警告のみ）
    for (filename, _) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            println!(
                "cargo:warning=Model file not found: {}. Run `cargo build` again to retry.",
                file_path.display()
            );
        }
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
///
/// 成功時に `true`、失敗時に `false` を返す（ビルドは継続する）。
#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &Path) -> bool {
    let status = match Command::new("curl")
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
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("cargo:warning=Failed to execute curl: {e}");
            return false;
        }
    };
    status.success()
}

/// Windows 環境で PowerShell を使用してファイルをダウンロードする
///
/// 成功時に `true`、失敗時に `false` を返す（ビルドは継続する）。
#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &Path) -> bool {
    let status = match Command::new("powershell")
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
    {
        Ok(s) => s,
        Err(e) => {
            eprintln!("cargo:warning=Failed to execute PowerShell: {e}");
            return false;
        }
    };
    status.success()
}
