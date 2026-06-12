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
    println!("cargo:rerun-if-changed=native/");
    println!("cargo:rerun-if-changed=libs/");

    // ============================================================
    // ランタイムライブラリ収集
    // ============================================================
    #[cfg(target_os = "macos")]
    collect_runtime_libs_macos(&manifest_dir);
    #[cfg(target_os = "windows")]
    collect_runtime_libs_windows(&manifest_dir);
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
    std::fs::create_dir_all(&mac_dir).expect("Failed to create prebuilt/macos/ directory");
    let lib_path = mac_dir.join("libSpeechHelper.a");

    // Swift Concurrency ランタイムの利用可否を判定する。
    // 実ライブラリ（Swift）は Tahoe (macOS 26+) が使用する libswift_Concurrency.dylib を
    // 実行時に必要とする。当該 dylib が /usr/lib/swift/ に存在しない環境では
    // 実ライブラリをリンクすると実行時クラッシュするため、スタブを使用する。
    // M6-1.5 でランタイム dylib を同梱するまでは、このチェックでフォールバックする。
    fn can_use_real_library() -> bool {
        std::path::Path::new("/usr/lib/swift/libswift_Concurrency.dylib").exists()
    }

    // 本物のライブラリ（100KB以上想定）が存在し、Swift Concurrency が利用可能ならそれを使う
    if lib_path.exists()
        && std::fs::metadata(&lib_path).map(|m| m.len()).unwrap_or(0) > 100_000
        && can_use_real_library()
    {
        println!("cargo:rustc-link-lib=static=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", mac_dir.display());
        println!("cargo:warning=Using real libSpeechHelper.a.");
        return;
    }

    // 本物のライブラリが存在しない（または Swift Concurrency 不足）場合、
    // native/swift/build.sh による自動ビルドを試行する
    let manifest_dir = prebuilt.parent().unwrap(); // prebuilt/ の親 = CARGO_MANIFEST_DIR
    let build_script = manifest_dir.join("native/swift/build.sh");
    if build_script.exists() {
        println!("cargo:warning=Auto-building libSpeechHelper.a from native/swift/...");
        let status = Command::new("bash")
            .arg(&build_script)
            .status()
            .expect("Failed to execute native/swift/build.sh");
        if status.success() && lib_path.exists()
            && std::fs::metadata(&lib_path).map(|m| m.len()).unwrap_or(0) > 100_000
        {
            if can_use_real_library() {
                println!("cargo:rustc-link-lib=static=SpeechHelper");
                println!("cargo:rustc-link-search=native={}", mac_dir.display());
                println!("cargo:warning=Auto-built libSpeechHelper.a successfully.");
                return;
            } else {
                println!(
                    "cargo:warning=Auto-built libSpeechHelper.a but Swift Concurrency runtime \
                     not available on this OS version. Using stub for now. \
                     M6-1.5 will bundle the runtime."
                );
            }
        } else {
            println!("cargo:warning=Auto-build failed or produced invalid library. Falling back to stub.");
        }
    }

    // スタブ C ソースを生成しコンパイル（最終手段、リンク解決のみ）
    let stub_c = mac_dir.join("stub.c");
    let stub_o = mac_dir.join("stub.o");
        std::fs::write(
            &stub_c,
            r#"#include <stdint.h>

// SpeechHelper FFI stubs — リンク解決のための最小実装。
// M6-1 で本物の libSpeechHelper.a に差し替えること。

int32_t speech_helper_init(double speech_timeout_sec) { return -1; }
int32_t speech_helper_request_authorization(void) { return 0; }
void speech_helper_set_result_callback(void (*cb)(const char*, int32_t)) { (void)cb; }
void speech_helper_set_error_callback(void (*cb)(const char*)) { (void)cb; }
void speech_helper_set_ready_callback(void (*cb)(void)) { (void)cb; }
void speech_helper_set_audio_data_callback(void (*cb)(const float*, int32_t, int32_t)) { (void)cb; }
int32_t speech_helper_start_capture(void) { return -1; }
void speech_helper_stop_capture(void) {}
int32_t speech_helper_start(const char* locale) { (void)locale; return -1; }
void speech_helper_stop(void) {}
void speech_helper_cleanup(void) {}
void speech_helper_tick(void) {}
int32_t tahoe_helper_init(const char* locale, double speech_timeout_sec) { (void)locale; (void)speech_timeout_sec; return -1; }
int32_t tahoe_helper_start(const char* locale) { (void)locale; return -1; }
void tahoe_helper_stop(void) {}
"#,
        )
        .expect("Failed to write stub.c");

        let cc = std::env::var("CC").unwrap_or_else(|_| "cc".to_string());
        let cc_status = Command::new(&cc)
            .args([
                "-c",
                "-o",
                &stub_o.to_string_lossy(),
                &stub_c.to_string_lossy(),
            ])
            .status()
            .expect("Failed to execute C compiler for stub generation");

        if cc_status.success() {
            // 古いライブラリ（実ライブラリ）を削除してからスタブを作成する。
            // ar crs は既存メンバを保持したまま追加するため、削除が必要。
            let _ = std::fs::remove_file(&lib_path);
            let ar_status = Command::new("ar")
                .args(["crs", &lib_path.to_string_lossy(), &stub_o.to_string_lossy()])
                .status()
                .expect("Failed to execute ar for stub generation");

            if ar_status.success() && lib_path.exists() {
                println!("cargo:rustc-link-lib=static=SpeechHelper");
                println!("cargo:rustc-link-search=native={}", mac_dir.display());
                println!(
                    "cargo:warning=Using stub libSpeechHelper.a ({}). \
                          Auto-built library pending runtime resolution (M6-1.5).",
                    lib_path.display()
                );
                let _ = std::fs::remove_file(&stub_c);
                let _ = std::fs::remove_file(&stub_o);
            } else {
                panic!("Failed to create stub archive. Install Xcode Command Line Tools.");
            }
        } else {
            // C コンパイラが使えない環境 → ar fallback (シンボルなし)
            let _ = Command::new("ar")
                .args(["crs", &lib_path.to_string_lossy(), "/dev/null"])
                .status();
            if lib_path.exists() {
                println!("cargo:rustc-link-lib=static=SpeechHelper");
                println!("cargo:rustc-link-search=native={}", mac_dir.display());
                println!("cargo:warning=Using symbol-less stub libSpeechHelper.a. Link may fail.");
            } else {
                let data = create_minimal_coff_lib();
                std::fs::write(&lib_path, &data)
                    .expect("Failed to create fallback stub libSpeechHelper.a");
                println!("cargo:rustc-link-lib=static=SpeechHelper");
                println!("cargo:rustc-link-search=native={}", mac_dir.display());
            }
        }

    // Swift ランタイムライブラリのパスを swiftc から取得してリンク検索パスに追加する。
    // 出力 JSON の paths.runtimeLibraryPaths 配列をパースする。
    if let Ok(output) = Command::new("swiftc").args(["-print-target-info"]).output() {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            // "paths" オブジェクトを探す
            if let Some(paths_obj) = stdout.find("\"paths\"") {
                let after_paths = &stdout[paths_obj..];
                if let Some(rlp_start) = after_paths.find("\"runtimeLibraryPaths\"") {
                    let from_rlp = &after_paths[rlp_start..];
                    if let Some(list_start) = from_rlp.find('[') {
                        let from_list = &from_rlp[list_start..];
                        if let Some(list_end) = from_list.find(']') {
                            let paths_str = &from_list[1..list_end];
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
    }

    // Swift ランタイムパスを rpath に追加する。
    // 実ライブラリがリンクされると Swift ランタイム（libswift_Concurrency.dylib 等）が
    // 実行時に必要になる。swiftc が報告する runtimeLibraryPaths を rpath に追加する。
    if let Ok(output) = Command::new("swiftc").args(["-print-target-info"]).output() {
        if let Ok(stdout) = String::from_utf8(output.stdout) {
            if let Some(paths_obj) = stdout.find("\"paths\"") {
                let after_paths = &stdout[paths_obj..];
                if let Some(rlp_start) = after_paths.find("\"runtimeLibraryPaths\"") {
                    let from_rlp = &after_paths[rlp_start..];
                    if let Some(list_start) = from_rlp.find('[') {
                        let from_list = &from_rlp[list_start..];
                        if let Some(list_end) = from_list.find(']') {
                            let paths_str = &from_list[1..list_end];
                            for path in paths_str.split(',') {
                                let path = path.trim().trim_matches('"').trim();
                                if !path.is_empty() {
                                    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", path);
                                }
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
    std::fs::create_dir_all(&win_dir).expect("Failed to create prebuilt/windows/ directory");
    let lib_path = win_dir.join("SpeechHelper.lib");
    let dll_path = win_dir.join("SpeechHelper.dll");

    // 本物のライブラリ（100KB以上想定）が存在すればそれを使う
    if lib_path.exists() && std::fs::metadata(&lib_path).map(|m| m.len()).unwrap_or(0) > 100_000 {
        println!("cargo:rustc-link-lib=SpeechHelper");
        println!("cargo:rustc-link-search=native={}", win_dir.display());
    } else {
        // スタブ C ソースを生成しコンパイル（M6-1 で本物に差し替え）
        let stub_c = win_dir.join("stub.c");
        std::fs::write(
            &stub_c,
            r#"// SpeechHelper FFI stubs — リンク解決のための最小実装。
// M6-1 で本物の SpeechHelper.lib に差し替えること。
// ヘッダー非依存（MSVC 環境変数未設定でもコンパイル可能）

int __stdcall speech_helper_init(double speech_timeout_sec) { (void)speech_timeout_sec; return -1; }
void __stdcall speech_helper_set_result_callback(void (*cb)(const char*, int)) { (void)cb; }
void __stdcall speech_helper_set_error_callback(void (*cb)(const char*)) { (void)cb; }
void __stdcall speech_helper_set_ready_callback(void (*cb)(void)) { (void)cb; }
void __stdcall speech_helper_set_audio_data_callback(void (*cb)(const float*, unsigned int, unsigned int)) { (void)cb; }
int __stdcall speech_helper_start_capture(void) { return -1; }
void __stdcall speech_helper_stop_capture(void) {}
int __stdcall speech_helper_start(const char* locale) { (void)locale; return -1; }
void __stdcall speech_helper_stop(void) {}
void __stdcall speech_helper_cleanup(void) {}
void __stdcall speech_helper_tick(void) {}
void __stdcall speech_helper_disable_ime(void) {}
void __stdcall speech_helper_restore_ime(void) {}
int __stdcall speech_helper_check_health(void) { return 0; }
"#,
        )
        .expect("Failed to write Windows stub.c");

    // cl.exe と同じディレクトリに lib.exe もあるので、両方同じ探索で取得
    let cl_exe = find_msvc_tool("cl.exe");

    if let Some(ref cl) = cl_exe {
        // cl.exe で .c → .obj コンパイルを試行
        let cl_output = Command::new(cl)
            .args(["/nologo", "/c", &stub_c.to_string_lossy(),
                   &format!("/Fo{}", win_dir.join("stub.obj").to_string_lossy())])
            .output();

        if let Ok(output) = cl_output {
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("cargo:warning=cl.exe compilation failed: {}", stderr);
            } else {
                let lib_exe = find_msvc_tool("lib.exe");
                if let Some(ref lib) = lib_exe {
                    let lib_status = Command::new(lib)
                        .args(["/nologo",
                               &format!("/OUT:{}", lib_path.to_string_lossy()),
                               &win_dir.join("stub.obj").to_string_lossy()])
                        .status();
                    if let Ok(ls) = lib_status {
                        if ls.success() && lib_path.exists() {
                            let _ = std::fs::remove_file(&stub_c);
                            let _ = std::fs::remove_file(win_dir.join("stub.obj"));
                            println!("cargo:rustc-link-lib=SpeechHelper");
                            println!("cargo:rustc-link-search=native={}", win_dir.display());
                            println!(
                                "cargo:warning=Using stub speech_helper.lib ({}). \
                                      Auto-built library pending runtime resolution (M6-1.6).",
                                lib_path.display()
                            );
                            return;
                        }
                    }
                }
            }
        }
    }

    // cl.exe + lib.exe による stub.c コンパイルが使えなかった場合、
    // lib.exe のみで空の .lib を生成する（シンボルなし → test-run のリンクは失敗する）
    create_stub_windows_lib(&lib_path);

        if lib_path.exists() {
            println!("cargo:rustc-link-lib=SpeechHelper");
            println!("cargo:rustc-link-search=native={}", win_dir.display());
            println!(
                "cargo:warning=Using stub speech_helper.lib (no symbols). \
                      Link may fail. Auto-built library pending runtime resolution (M6-1.6)."
            );
        } else {
            panic!(
                "Failed to create stub library at {}. \
                 Ensure MSVC tools (cl.exe, lib.exe) are available.",
                lib_path.display()
            );
        }
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

/// MSVC lib.exe で空のスタブ .lib を生成する。
/// 手書き COFF アーカイブは MSVC リンカが認識しないため、
/// 正規のツールチェーン経由で作成する。
#[cfg(target_os = "windows")]
fn create_stub_windows_lib(lib_path: &std::path::Path) {
    let lib_exe = find_msvc_lib_exe();

    match lib_exe {
        Some(exe) => {
            let out_filename = lib_path.file_name().unwrap().to_str().unwrap();
            let status = std::process::Command::new(&exe)
                .args([
                    "/NOLOGO",
                    &format!("/OUT:{}", out_filename),
                    "/MACHINE:X64",
                    "/DEF:",
                ])
                .current_dir(lib_path.parent().unwrap())
                .status()
                .expect("Failed to execute MSVC lib.exe");

            if !status.success() {
                panic!("MSVC lib.exe failed (exit: {:?})", status.code());
            }
        }
        None => {
            // lib.exe が見つからない場合: 手書き COFF アーカイブで妥協
            // （MSVC リンカが認識しない可能性があるが、ないよりはマシ）
            println!("cargo:warning=MSVC lib.exe not found. Creating minimal COFF stub.");
            let data = create_minimal_coff_lib();
            std::fs::write(lib_path, &data).expect("Failed to create stub speech_helper.lib");
        }
    }
}

/// MSVC ツール（cl.exe, lib.exe 等）を発見する。以下の順で探索:
/// 1. 環境変数から派生したパス
/// 2. link.exe と同じディレクトリ（rustc が使うリンカと同じ場所）
/// 3. Program Files / Program Files (x86) 以下の既知の配置
#[cfg(target_os = "windows")]
fn find_msvc_tool(tool_name: &str) -> Option<std::path::PathBuf> {
    // 1. 環境変数から VC ルートを取得
    if let (Ok(vc_dir), Ok(vc_ver)) = (env::var("VCINSTALLDIR"), env::var("VCTOOLSVERSION")) {
        let candidate = std::path::PathBuf::from(&vc_dir)
            .join("Tools")
            .join("MSVC")
            .join(&vc_ver)
            .join("bin")
            .join("Hostx64")
            .join("x64")
            .join(tool_name);
        if candidate.exists() {
            return Some(candidate);
        }
    }

    // 2. rustc が使っている link.exe と同じディレクトリを探す
    //    （cargo の build script では LINKER 環境変数経由で取得可能）
    if let Ok(linker) = env::var("LINKER") {
        let linker_path = std::path::PathBuf::from(&linker);
        if let Some(parent) = linker_path.parent() {
            let candidate = parent.join(tool_name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    // 3. Program Files / Program Files (x86) から探索
    let search_roots = [
        "C:/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC",
        "C:/Program Files/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/2019/Community/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/2019/BuildTools/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/17/Community/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/17/BuildTools/VC/Tools/MSVC",
        "C:/Program Files (x86)/Microsoft Visual Studio/18/BuildTools/VC/Tools/MSVC",
    ];
    for root in &search_roots {
        let tools_dir = std::path::PathBuf::from(root);
        if !tools_dir.exists() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&tools_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("bin/Hostx64/x64").join(tool_name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    None
}

/// MSVC lib.exe を発見する（find_msvc_tool のラッパー）
#[cfg(target_os = "windows")]
fn find_msvc_lib_exe() -> Option<std::path::PathBuf> {
    find_msvc_tool("lib.exe")
}

/// 最小限の ar アーカイブ（.a / .lib）を生成する。
/// macOS の ar フォールバック、および Windows の lib.exe 不在時の最終手段。
fn create_minimal_coff_lib() -> Vec<u8> {
    let mut data = b"!<arch>\n".to_vec(); // magic
    let name = b"/               "; // linker member name (16 bytes)
    let size = 4u32;
    let size_str = format!("{:<12}", size);
    data.extend_from_slice(name);
    data.extend_from_slice(size_str.as_bytes());
    data.extend_from_slice(b"`\n"); // trailing
    data.extend_from_slice(&0u32.to_le_bytes()); // 0 symbols
    data.push(b'\n');
    data
}

// ============================================================================
// ランタイムライブラリ収集
// ============================================================================

/// macOS 用ランタイムライブラリを target/ から libs/macos/ に収集する。
///
/// sherpa-onnx の共有ライブラリ（dylib）を OUT_DIR からコピーする。
/// 収集後、必須ファイルの存在を確認する（欠落時 panic!）。
#[cfg(target_os = "macos")]
fn collect_runtime_libs_macos(manifest_dir: &std::path::Path) {
    let target_dir = std::path::PathBuf::from(env::var("OUT_DIR").unwrap())
        .join("../../.."); // target/debug/ または target/release/ の先
    let libs_dir = manifest_dir.join("libs").join("macos");
    std::fs::create_dir_all(&libs_dir).expect("Failed to create libs/macos/ directory");

    // sherpa-onnx dylib 一覧
    let dylibs = ["libsherpa-onnx-c-api.dylib", "libonnxruntime.1.24.4.dylib"];

    for name in &dylibs {
        let src = target_dir.join(name);
        if src.exists() {
            let dest = libs_dir.join(name);
            let _ = std::fs::copy(&src, &dest);
            println!("cargo:warning=Runtime lib collected: {}/{}", libs_dir.display(), name);
        }
    }

    // 必須ファイルの存在確認
    let mut all_ok = true;
    for name in &dylibs {
        if !libs_dir.join(name).exists() {
            println!("cargo:warning=MISSING runtime library: {}/{}", libs_dir.display(), name);
            all_ok = false;
        }
    }
    assert!(all_ok, "Required macOS runtime libraries are missing in libs/macos/");
}

/// Windows 用ランタイムライブラリを target/ から libs/windows/ に収集する。
///
/// sherpa-onnx の DLL + SpeechHelper.dll + VC++ 再頒布可能 DLL をコピーする。
#[cfg(target_os = "windows")]
fn collect_runtime_libs_windows(manifest_dir: &std::path::Path) {
    let target_dir = std::path::PathBuf::from(env::var("OUT_DIR").unwrap())
        .join("../../..");
    let prebuilt_dir = manifest_dir.join("prebuilt").join("windows");
    let libs_dir = manifest_dir.join("libs").join("windows");
    std::fs::create_dir_all(&libs_dir).expect("Failed to create libs/windows/ directory");

    // sherpa-onnx DLL をコピー
    let dlls = ["sherpa-onnx-c-api.dll", "onnxruntime.dll"];
    for name in &dlls {
        let src = target_dir.join(name);
        if src.exists() {
            let _ = std::fs::copy(&src, libs_dir.join(name));
        }
    }

    // SpeechHelper.dll を prebuilt/ からコピー
    let speech_helper_dll = prebuilt_dir.join("SpeechHelper.dll");
    if speech_helper_dll.exists() {
        let _ = std::fs::copy(&speech_helper_dll, libs_dir.join("SpeechHelper.dll"));
    }

    // VC++ 再頒布可能 DLL をシステムからコピー
    for dll in &["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"] {
        let dest = libs_dir.join(dll);
        if !dest.exists() {
            if let Some(system_path) = find_system_dll(dll) {
                let _ = std::fs::copy(&system_path, &dest);
                println!("cargo:warning=VC++ redist copied: {} from {}", dll, system_path.display());
            }
        }
    }

    // 必須ファイルの存在確認
    let required = ["sherpa-onnx-c-api.dll", "onnxruntime.dll", "SpeechHelper.dll"];
    let mut all_ok = true;
    for name in &required {
        if !libs_dir.join(name).exists() {
            println!("cargo:warning=MISSING runtime library: {}/{}", libs_dir.display(), name);
            all_ok = false;
        }
    }
    assert!(all_ok, "Required Windows runtime libraries are missing in libs/windows/");
}

/// Windows システム DLL のパスを探索する。
#[cfg(target_os = "windows")]
fn find_system_dll(dll_name: &str) -> Option<std::path::PathBuf> {
    // System32 または SysWOW64 から検索
    let system32 = std::path::PathBuf::from(std::env::var_os("SystemRoot")?)
        .join("System32");
    let candidate = system32.join(dll_name);
    if candidate.exists() { Some(candidate) } else { None }
}
