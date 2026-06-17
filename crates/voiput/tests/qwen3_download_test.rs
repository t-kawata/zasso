//! Qwen3-ASR モデルファイルのダウンロード検証テスト
//!
//! build.rs が自動ダウンロードするモデルファイルが、新しいダウンロード元
//! (t-kawata/mycute) から正しく取得できることを確認する。
//!
//! # 実行方法
//!
//! ```bash
//! cargo test --test qwen3_download_test -- --ignored
//! ```
//!
//! ダウンロードされたファイルは tempfile::TempDir により自動削除される。
//!
//! # 注意
//!
//! 全ファイルのダウンロードには回線速度に応じて数分かかる（decoder.int8.onnx
//! は約 756MB）。--nocapture を付けると進捗が表示される。

use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

/// Qwen3-ASR モデルファイルのダウンロード URL 一覧（build.rs の QWEN3_MODEL_FILES と同一）
const QWEN3_MODEL_FILES: &[(&str, &str)] = &[
    (
        "encoder.int8.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/encoder.int8.onnx",
    ),
    (
        "decoder.int8.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/decoder.int8.onnx",
    ),
    (
        "conv_frontend.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/conv_frontend.onnx",
    ),
    (
        "tokenizer/vocab.json",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/tokenizer/vocab.json",
    ),
    (
        "tokenizer/merges.txt",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/tokenizer/merges.txt",
    ),
    (
        "tokenizer/tokenizer_config.json",
        "https://huggingface.co/t-kawata/mycute/resolve/main/qwen3-asr/tokenizer/tokenizer_config.json",
    ),
];

/// 各ファイルに期待する最小サイズ（バイト）
///
/// エラーページ（HTML）と実モデルファイルを区別するための閾値。
const MIN_EXPECTED_BYTES: &[(&str, u64)] = &[
    ("encoder.int8.onnx", 1_000_000),     // ~182MB
    ("decoder.int8.onnx", 1_000_000),     // ~756MB
    ("conv_frontend.onnx", 100_000),      // ~44MB
    ("tokenizer/vocab.json", 100_000),    // ~数百KB
    ("tokenizer/merges.txt", 10_000),     // ~数十KB
    ("tokenizer/tokenizer_config.json", 100), // ~数百バイト
];

/// 全 Qwen3-ASR モデルファイルをダウンロードし、正常に取得できることを確認する。
///
/// デフォルトではスキップされる（`#[ignore]`）。実行するには
/// `cargo test --test qwen3_download_test -- --ignored` を使用する。
///
/// ダウンロード先は OS のテンポラリディレクトリを使用し、テスト終了時に
/// 全てのファイルは自動削除される。
#[test]
#[ignore = "実際にモデルファイルをダウンロードするため通常はスキップ。cargo test -- --ignored で実行"]
fn test_download_all_qwen3_models() {
    // テンポラリディレクトリを作成（スコープを抜けると自動削除）
    let temp_dir = TempDir::new().expect("テンポラリディレクトリを作成できません");
    let download_dir = temp_dir.path().to_path_buf();

    // tokenizer/ サブディレクトリを作成
    let tokenizer_dir = download_dir.join("tokenizer");
    std::fs::create_dir_all(&tokenizer_dir)
        .expect("tokenizer/ サブディレクトリを作成できません");

    let mut all_ok = true;

    for (filename, url) in QWEN3_MODEL_FILES {
        let dest = download_dir.join(filename);
        print!("  Downloading {} ... ", filename);
        let _ = std::io::Write::flush(&mut std::io::stdout());

        match download_file(url, &dest) {
            Ok(()) => {
                // ファイルサイズを確認
                let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
                let min_size = MIN_EXPECTED_BYTES
                    .iter()
                    .find(|(name, _)| *name == *filename)
                    .map(|(_, min)| *min)
                    .unwrap_or(1_000);

                if size < min_size {
                    println!("FAILED (too small: {} bytes, expected >= {} bytes)", size, min_size);
                    all_ok = false;
                } else {
                    println!("OK ({} bytes)", size);
                }
            }
            Err(e) => {
                println!("FAILED: {}", e);
                all_ok = false;
            }
        }
    }

    // テンポラリディレクトリは temp_dir の Drop により自動削除される
    // （明示的な cleanup は不要）

    assert!(
        all_ok,
        "一部のモデルファイルのダウンロードに失敗しました。\
         詳細は上記の出力を確認してください。"
    );
}

// ============================================================================
// プラットフォーム別ダウンロード関数
// ============================================================================

/// 指定された URL からファイルをダウンロードする（macOS / Linux）。
#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let status = Command::new("curl")
        .args([
            "-sS",   // サイレント + エラー表示
            "-m", "300", // タイムアウト（秒）
            "-L",    // リダイレクト追従
            "-o",
        ])
        .arg(dest)
        .arg(url)
        .status()
        .map_err(|e| format!("curl の実行に失敗: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("curl が exit code {:?} で失敗しました", status.code()))
    }
}

/// 指定された URL からファイルをダウンロードする（Windows）。
#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
                 Invoke-WebRequest -Uri '{}' -OutFile '{}'",
                url,
                dest.display()
            ),
        ])
        .status()
        .map_err(|e| format!("PowerShell の実行に失敗: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("PowerShell が exit code {:?} で失敗しました", status.code()))
    }
}
