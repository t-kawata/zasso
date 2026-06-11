//! build.rs — プリビルドネイティブライブラリのリンク設定 + ONNX モデル自動ダウンロード
//!
//! 移植元: ~/shyme/mycute/build.rs（Tauri依存を削除し、voiput用に整理）

use std::env;
use std::path::PathBuf;
use std::process::Command;

// ダウンロードするモデルファイル一覧（MYCUTE Makefile の download-models ターゲットと同一）
const MODEL_FILES: &[(&str, &str)] = &[
    (
        "silero_vad.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/silero_vad.onnx",
    ),
    (
        "silero_vad.int8.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/silero_vad.int8.onnx",
    ),
    (
        "ten_vad.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/ten_vad.onnx",
    ),
    (
        "ten-vad.int8.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/ten-vad.int8.onnx",
    ),
    (
        "gtcrn.onnx",
        "https://huggingface.co/t-kawata/mycute/resolve/main/gtcrn.onnx",
    ),
    (
        "tokens.txt",
        "https://huggingface.co/t-kawata/mycute/resolve/main/tokens.txt",
    ),
];

fn main() {
    // ============================================================
    // ONNX モデルファイルの自動ダウンロード
    // ============================================================
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let models_dir = manifest_dir.join("models");

    // モデルディレクトリがなければ作成
    std::fs::create_dir_all(&models_dir).expect("Failed to create models/ directory");

    // cargo:rerun-if-changed で models/ 下の変更を検出
    println!("cargo:rerun-if-changed={}", models_dir.display());

    // 各モデルファイルを確認し、なければダウンロード
    for (filename, url) in MODEL_FILES {
        let file_path = models_dir.join(filename);
        if !file_path.exists() {
            println!("cargo:warning=Downloading model: {}...", filename);
            download_file(url, &file_path);
        }
    }

    // 全ファイルの存在を最終確認（1つでも欠けていれば panic! でビルド停止）
    let mut all_ok = true;
    for (filename, _) in MODEL_FILES {
        let file_path = models_dir.join(filename);
        if !file_path.exists() {
            println!(
                "cargo:warning=MODEL FILE NOT FOUND: {}",
                file_path.display()
            );
            all_ok = false;
        }
    }
    assert!(
        all_ok,
        "Required model files are missing in {}. \
         Automatic download failed. Please run `make download-models` or \
         manually place the .onnx files from https://huggingface.co/t-kawata/mycute",
        models_dir.display()
    );

    // ============================================================
    // プリビルドネイティブライブラリのリンク
    // ============================================================
    let prebuilt = manifest_dir.join("prebuilt");

    #[cfg(target_os = "windows")]
    link_windows(&prebuilt);
    #[cfg(target_os = "macos")]
    link_macos(&prebuilt);
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        println!(
            "cargo:warning=voiput: unsupported target OS. \
             Only OpenAI engine will be available."
        );
    }

    println!("cargo:rerun-if-changed=prebuilt/");
}

#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &PathBuf) {
    let status = Command::new("curl")
        .args(["-sS", "-m", "60", "-L", "-o"])
        .arg(dest)
        .arg(url)
        .status()
        .expect("Failed to execute curl. Please install curl.");

    if !status.success() {
        println!(
            "cargo:warning=curl failed (exit: {:?}) for: {}",
            status.code(),
            url
        );
        // 失敗したファイルを削除（不完全なファイルを残さない）
        let _ = std::fs::remove_file(dest);
    }
}

#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &PathBuf) {
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
        .expect("Failed to execute PowerShell.");

    if !status.success() {
        println!(
            "cargo:warning=powershell download failed (exit: {:?}) for: {}",
            status.code(),
            url
        );
        let _ = std::fs::remove_file(dest);
    }
}

#[cfg(target_os = "macos")]
fn link_macos(prebuilt: &PathBuf) {
    let mac_dir = prebuilt.join("macos");
    let lib_path = mac_dir.join("libSpeechHelper.a");

    if lib_path.exists() {
        println!("cargo:rustc-link-lib=static=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", mac_dir.display());
    } else {
        // スタブ .a を自動生成（M6-1 で本物に差し替え）
        let _ = std::process::Command::new("ar")
            .args(["crs", &lib_path.to_string_lossy(), "/dev/null"])
            .status();
        if lib_path.exists() {
            println!("cargo:rustc-link-lib=static=SpeechHelper");
            println!("cargo:rustc-link-search=native={}", mac_dir.display());
            println!("cargo:warning=Using stub libSpeechHelper.a. \
                      Replace with real library at M6-1.");
        } else {
            // ar が使えない環境用（稀）: 最小限の ar archive を自力生成
            let data = create_minimal_coff_lib();
            std::fs::write(&lib_path, &data).expect("Failed to create stub libSpeechHelper.a");
            println!("cargo:rustc-link-lib=static=SpeechHelper");
            println!("cargo:rustc-link-search=native={}", mac_dir.display());
        }
    }

    if let Ok(output) = Command::new("swiftc").args(["-print-target-info"]).output() {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            if let Some(paths_start) = stdout.find("\"runtimeLibraryPaths\"") {
                if let Some(list_start) = stdout[paths_start..].find('[') {
                    let list_start = paths_start + list_start;
                    if let Some(list_end) = stdout[list_start..].find(']') {
                        let list_end = list_start + list_end;
                        let paths_str = &stdout[list_start + 1..list_end];
                        for path in paths_str.split(',') {
                            let path = path.trim().trim_matches('"').trim();
                            if !path.is_empty() {
                                println!("cargo:rustc-link-search=native={}", path);
                            }
                        }
                    }
                }
            }
        }
    }

    for rpath in &["/usr/lib/swift", "@executable_path/", "@loader_path/"] {
        println!("cargo:rustc-link-arg=-Wl,-rpath,{}", rpath);
    }

    for fw in &["Foundation", "AVFoundation", "Speech", "CoreFoundation"] {
        println!("cargo:rustc-link-lib=framework={}", fw);
    }
}

#[cfg(target_os = "windows")]
fn link_windows(prebuilt: &PathBuf) {
    let win_dir = prebuilt.join("windows");
    let lib_path = win_dir.join("speech_helper.lib");
    let dll_path = win_dir.join("SpeechHelper.dll");

    if lib_path.exists() {
        println!("cargo:rustc-link-lib=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", win_dir.display());
    } else {
        // スタブ .lib を自動生成（M6-1 で本物に差し替え）
        std::fs::write(&lib_path, create_minimal_coff_lib())
            .expect("Failed to create stub speech_helper.lib");
        println!("cargo:rustc-link-lib=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", win_dir.display());
        println!("cargo:warning=Using stub speech_helper.lib. \
                  Replace with real library at M6-1.");
    }

    if dll_path.exists() {
        if let Some(out_dir) = env::var_os("OUT_DIR") {
            let dest = PathBuf::from(&out_dir)
                .join("..")
                .join("..")
                .join("..")
                .join("SpeechHelper.dll");
            let _ = std::fs::copy(&dll_path, &dest);
        }
    }

    for lib in &[
        "ole32", "oleaut32", "advapi32", "bcrypt", "crypt32", "iphlpapi", "kernel32", "mswsock",
        "ntdll", "secur32", "user32", "ws2_32",
    ] {
        println!("cargo:rustc-link-lib={}", lib);
    }
    println!("cargo:rustc-link-arg=/IGNORE:4099");
}

/// 最小限の COFF 書庫（.lib）を生成する。M6-1 までのスタブ。
/// フォーマット: COFF archive magic + 空のリンカメンバ
fn create_minimal_coff_lib() -> Vec<u8> {
    let mut data = b"!<arch>\n".to_vec(); // magic
    let name = b"/               ";       // linker member name (16 bytes)
    let size = 4u32;
    let size_str = format!("{:<12}", size);
    data.extend_from_slice(name);
    data.extend_from_slice(size_str.as_bytes());
    data.extend_from_slice(b"`\n");       // trailing
    data.extend_from_slice(&0u32.to_le_bytes()); // 0 symbols
    data.push(b'\n');
    data
}
