use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

/// bindgen 生成バインディングの出力先パスを返す。
///
/// 出力先は `OUT_DIR/pjsip_bindings.rs` 固定。
fn output_path() -> PathBuf {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    out_dir.join("pjsip_bindings.rs")
}

/// Cargo feature flag が有効か判定する。
fn cfg_enabled(feature: &str) -> bool {
    let env_var = format!("CARGO_FEATURE_{}", feature.to_uppercase());
    env::var(env_var).is_ok()
}

/// リンク対象の PJSIP ライブラリ名を依存順（ボトムアップ）で返す。
fn required_libraries() -> &'static [&'static str] {
    &[
        // Third-party foundation（pjmedia から利用）
        "srtp",
        "speex",
        "resample",
        "gsm",
        "g7221",
        "ilbc",
        // PJLIB コア
        "pjlib",
        "pjlib-util",
        // NAT 支援
        "pjnath",
        // メディア
        "pjmedia",
        "pjmedia-audiodev",
        "pjmedia-codec",
        "pjmedia-videodev",
        // SIP プロトコル
        "pjsip",
        "pjsip-simple",
        "pjsip-ua",
        // PJSUA
        "pjsua-lib",
        "pjsua2",
    ]
}

/// リンカ指示を出力する。
fn emit_link_directives(search_dirs: &[&Path]) {
    for dir in search_dirs {
        println!("cargo:rustc-link-search={}", dir.display());
    }
    for lib in required_libraries() {
        println!("cargo:rustc-link-lib=static={lib}");
    }
}

/// プラットフォーム固有のシステムフレームワーク／ライブラリをリンクする。
fn emit_platform_link_directives() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    match target_os.as_str() {
        "macos" => {
            println!("cargo:rustc-link-lib=framework=CoreAudio");
            println!("cargo:rustc-link-lib=framework=CoreFoundation");
            println!("cargo:rustc-link-lib=framework=CoreServices");
            println!("cargo:rustc-link-lib=framework=AudioToolbox");
            // Apple Security Framework は pjlib の SSL ソケット実装
            // （ssl_sock_apple.m, ssl_sock_darwin.c）から常に参照されるため、
            // tls feature の有無に関わらずリンクする。
            println!("cargo:rustc-link-lib=framework=Security");
        }
        "linux" => {
            println!("cargo:rustc-link-lib=asound");
            println!("cargo:rustc-link-lib=uuid");
            if cfg_enabled("tls") {
                println!("cargo:rustc-link-lib=ssl");
                println!("cargo:rustc-link-lib=crypto");
            }
        }
        _ => {}
    }
}

/// prebuilt ディレクトリに全必須ライブラリが存在するか確認する。
fn prebuilt_available(prebuilt_lib_dir: &Path) -> bool {
    if !prebuilt_lib_dir.exists() {
        return false;
    }
    let extensions: &[&str] = if cfg!(target_os = "windows") {
        &[".lib"]
    } else {
        &[".a"]
    };
    required_libraries().iter().all(|lib| {
        extensions
            .iter()
            .any(|ext| prebuilt_lib_dir.join(format!("lib{lib}{ext}")).exists())
    })
}

/// PJSIP 不在時に生成するスタブバインディングを書き込む。
fn write_stub_bindings(path: &Path) {
    use std::io::Write;
    let mut file = std::fs::File::create(path)
        .unwrap_or_else(|e| panic!("failed to create stub bindings at {}: {e}", path.display()));
    writeln!(
        file,
        "// This file was generated because PJSIP was not available."
    )
    .unwrap();
    writeln!(file, "// To enable real bindings:").unwrap();
    writeln!(file, "//   1. Place PJSIP 2.17 source in vendor/pjsip/").unwrap();
    writeln!(file, "//   2. Run: cargo build -p siprs --features pjsip").unwrap();
    writeln!(file, "#[allow(dead_code)]").unwrap();
    writeln!(file, "const _PJSIP_BINDGEN_NOT_AVAILABLE: bool = true;").unwrap();
}

/// PJSIP のインストール手順を表示する。
fn print_installation_guide(target: &str) {
    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    eprintln!();
    eprintln!("============================================================");
    eprintln!("  PJSIP 2.17 not found.");
    eprintln!("  Using stub bindings — real PJSIP features are unavailable.");
    eprintln!("============================================================");
    eprintln!();
    eprintln!("  Option A: Prebuilt binaries in vendor/prebuilt/{target}/");
    eprintln!("  Option B: Source build from vendor/pjsip/");
    eprintln!("    cargo build -p siprs --features pjsip");
    eprintln!();
    match os.as_str() {
        "macos" => eprintln!("  macOS: brew install pkg-config cmake"),
        "linux" => {
            eprintln!("  Linux: apt-get install build-essential cmake libasound2-dev libssl-dev")
        }
        _ => {}
    }
    eprintln!("============================================================");
    eprintln!();
}

// ---------------------------------------------------------------------------
// bindgen 設定
// ---------------------------------------------------------------------------

fn allowed_functions() -> &'static [&'static str] {
    &["pjsua_.*", "pjsip_.*", "pj_.*", "pjmedia_.*", "pjsua2_.*"]
}

fn allowed_types() -> &'static [&'static str] {
    &[
        "pjsua_.*",
        "pjsip_.*",
        "pj_.*",
        "pjmedia_.*",
        "pj_str_t",
        "pj_status_t",
        "pj_pool_t",
        "pj_caching_pool",
        "pjsua_acc_id",
        "pjsua_call_id",
    ]
}

fn allowed_vars() -> &'static [&'static str] {
    &["PJSUA_.*", "PJ_.*", "PJSIP_.*"]
}

fn blocked_types() -> &'static [&'static str] {
    &[
        "FILE",
        "time_t",
        "struct_timeval",
        "sockaddr",
        "sockaddr_in",
        "sockaddr_in6",
    ]
}

fn create_bindgen_builder(clang_args: &[String]) -> bindgen::Builder {
    let mut builder = bindgen::Builder::default()
        .header("wrapper.h")
        .clang_args(clang_args)
        .derive_debug(true)
        .derive_default(false)
        // C のコメントをそのまま Rust doc に反映しない。
        // 生成コード内の C コード例が doctest で誤ってコンパイルされるのを防ぐ。
        .generate_comments(false)
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

fn write_bindings(bindings: bindgen::Bindings, path: &Path) {
    bindings
        .write_to_file(path)
        .expect("bindgen: failed to write bindings to output path");
}

/// libclang が利用可能か確認する。
///
/// bindgen は内部で libclang をロードするが、macOS では Homebrew の libclang.dylib が
/// DYLD_LIBRARY_PATH 経由でしか見つからないことがある。見つからない場合、bindgen は
/// SIGABRT でプロセスごと終了するため、事前チェックが必要。
fn libclang_available() -> bool {
    // LIBCLANG_PATH 環境変数が設定されている場合、そのパスを信頼する。
    if let Ok(path) = env::var("LIBCLANG_PATH") {
        if !path.is_empty() {
            return true;
        }
    }

    // DYLD_LIBRARY_PATH / LD_LIBRARY_PATH に libclang が含まれているか確認する。
    let var = if cfg!(target_os = "macos") {
        "DYLD_LIBRARY_PATH"
    } else {
        "LD_LIBRARY_PATH"
    };
    let lib_name = if cfg!(target_os = "macos") {
        "libclang.dylib"
    } else if cfg!(target_os = "linux") {
        "libclang.so"
    } else {
        return true; // Windows では別の機構でロードされるためスキップ
    };
    if let Ok(paths) = env::var(var) {
        for dir in paths.split(':') {
            let lib_path = std::path::Path::new(dir).join(lib_name);
            if lib_path.exists() {
                return true;
            }
        }
    }

    // Homebrew の標準パス（macOS）
    #[cfg(target_os = "macos")]
    {
        let homebrew_path = std::path::Path::new("/opt/homebrew/opt/llvm/lib").join(lib_name);
        if homebrew_path.exists() {
            return true;
        }
    }

    // システム標準パス（Linux の libclang-dev）
    #[cfg(target_os = "linux")]
    {
        let system_path = std::path::Path::new("/usr/lib").join(lib_name);
        if system_path.exists() {
            return true;
        }
    }

    false
}

/// bindgen を実行する。
///
/// libclang が利用できない場合はスタブバインディングを生成する。
fn generate_bindings(include_dirs: &[&Path]) {
    let out_path = output_path();

    if !libclang_available() {
        eprintln!("libclang not found — skipping bindgen, using stub bindings");
        eprintln!("  Set LIBCLANG_PATH or DYLD_LIBRARY_PATH to the directory containing");
        eprintln!("  libclang.dylib (e.g. /opt/homebrew/opt/llvm/lib)");
        write_stub_bindings(&out_path);
        return;
    }

    let mut clang_args: Vec<String> = Vec::new();
    for dir in include_dirs {
        clang_args.push(format!("-I{}", dir.display()));
    }
    if let Ok(dir) = env::var("PJSIP_INCLUDE_DIR") {
        clang_args.push(format!("-I{dir}"));
    }
    let builder = create_bindgen_builder(&clang_args);
    match builder.generate() {
        Ok(bindings) => write_bindings(bindings, &out_path),
        Err(e) => {
            eprintln!("bindgen error: {e}");
            write_stub_bindings(&out_path);
        }
    }
}

// ---------------------------------------------------------------------------
// PJSIP source build
// ---------------------------------------------------------------------------

/// CMake が利用可能か確認する。
fn cmake_available() -> bool {
    Command::new("cmake").arg("--version").output().is_ok()
}

/// PJSIP ソースを CMake でビルドし、インストール先のパスを返す。
fn build_pjsip_from_source(src_dir: &Path, out_dir: &Path) -> Result<PathBuf, String> {
    if !cmake_available() {
        return Err("cmake not found. Please install cmake.".into());
    }

    let install_prefix = out_dir.join("pjsip-install");
    let build_dir = out_dir.join("pjsip-build");

    // cmake configure
    println!("cargo:warning=Configuring PJSIP...");
    let mut cmd = Command::new("cmake");
    cmd.arg("-B")
        .arg(&build_dir)
        .arg("-S")
        .arg(src_dir)
        .arg(format!(
            "-DCMAKE_INSTALL_PREFIX={}",
            install_prefix.display()
        ))
        .arg("-DPJMEDIA_WITH_VIDEO=OFF")
        .arg(if cfg_enabled("tls") {
            "-DPJ_HAS_SSL=ON"
        } else {
            "-DPJ_HAS_SSL=OFF"
        })
        .arg(if cfg_enabled("srtp") {
            "-DPJMEDIA_HAS_SRTP=ON"
        } else {
            "-DPJMEDIA_HAS_SRTP=OFF"
        })
        .arg("-G")
        .arg("Unix Makefiles");

    let status = cmd
        .status()
        .map_err(|e| format!("failed to run cmake: {e}"))?;
    if !status.success() {
        return Err("cmake configure failed".into());
    }

    // cmake build + install
    println!("cargo:warning=Building PJSIP...");
    let status = Command::new("cmake")
        .arg("--build")
        .arg(&build_dir)
        .arg("--target")
        .arg("install")
        .arg("-j")
        .arg(num_cpus())
        .status()
        .map_err(|e| format!("failed to run cmake --build: {e}"))?;
    if !status.success() {
        return Err("PJSIP build failed".into());
    }

    println!("cargo:warning=PJSIP build completed");
    Ok(install_prefix)
}

/// インストール先から .a ファイルを検索し、フラットな lib/ ディレクトリに配置する。
fn collect_libraries(install_prefix: &Path, flat_lib_dir: &Path) -> Result<Vec<PathBuf>, String> {
    std::fs::create_dir_all(flat_lib_dir)
        .map_err(|e| format!("failed to create {}: {e}", flat_lib_dir.display()))?;

    let output = Command::new("find")
        .arg(install_prefix)
        .arg("-name")
        .arg("*.a")
        .arg("-type")
        .arg("f")
        .output()
        .map_err(|e| format!("find failed: {e}"))?;

    let mut lib_dirs: Vec<PathBuf> = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let lib_path = PathBuf::from(line);
        if !lib_path.exists() {
            continue;
        }
        // 親ディレクトリをリンクサーチパスに追加
        if let Some(parent) = lib_path.parent() {
            if !lib_dirs.contains(&parent.to_path_buf()) {
                lib_dirs.push(parent.to_path_buf());
            }
        }
    }
    Ok(lib_dirs)
}

/// PJSIP の include ディレクトリを収集する。
///
/// ソースの include ディレクトリと cmake 生成の autoconf 互換ヘッダの両方を収集する。
fn collect_include_dirs(src_dir: &Path, build_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    // インストール先の include/pjproject/
    let installed = build_dir.join("include").join("pjproject");
    if installed.exists() {
        dirs.push(installed);
    }

    // ソースツリーの include ディレクトリ
    for sub in &["pjlib", "pjlib-util", "pjmedia", "pjnath", "pjsip"] {
        let src_inc = src_dir.join(sub).join("include");
        if src_inc.exists() {
            dirs.push(src_inc);
        }
        // cmake 生成ヘッダ（os_auto.h, config_auto.h 等）
        let build_inc = src_dir.join("build").join(sub).join("include");
        if build_inc.exists() {
            dirs.push(build_inc);
        }
    }

    dirs
}

/// cmake ビルド成果物を vendor/prebuilt/{TARGET}/ に永続化する。
///
/// 次回以降のビルドは prebuilt 優先パスが使われ、cmake がスキップされる。
fn deploy_prebuilt(install_prefix: &Path, target: &str) -> Result<(), String> {
    let prebuilt_lib_dir = PathBuf::from("vendor/prebuilt").join(target).join("lib");
    let prebuilt_inc_dir = PathBuf::from("vendor/prebuilt")
        .join(target)
        .join("include");

    // lib/ ディレクトリを作成し、全 .a をコピー
    std::fs::create_dir_all(&prebuilt_lib_dir)
        .map_err(|e| format!("failed to create prebuilt lib dir: {e}"))?;

    let output = Command::new("find")
        .arg(install_prefix)
        .arg("-name")
        .arg("*.a")
        .arg("-type")
        .arg("f")
        .output()
        .map_err(|e| format!("find failed: {e}"))?;

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let lib_path = PathBuf::from(line);
        if lib_path.exists() {
            let dest = prebuilt_lib_dir.join(lib_path.file_name().unwrap());
            let _ = std::fs::copy(&lib_path, &dest);
        }
    }

    // include/ ディレクトリをコピー
    let src_include = install_prefix.join("include");
    if src_include.exists() {
        let _ = std::fs::remove_dir_all(&prebuilt_inc_dir);
        let _ = copy_dir_recursive(&src_include, &prebuilt_inc_dir);
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

/// CPU コア数を返す（cmake --build -j 用）。
fn num_cpus() -> String {
    // macOS では sysctl、Linux では nproc
    if let Ok(output) = Command::new("sysctl")
        .arg("-n")
        .arg("hw.logicalcpu")
        .output()
    {
        if let Ok(s) = String::from_utf8(output.stdout) {
            if let Ok(n) = s.trim().parse::<usize>() {
                return n.to_string();
            }
        }
    }
    if let Ok(output) = Command::new("nproc").output() {
        if let Ok(s) = String::from_utf8(output.stdout) {
            if let Ok(n) = s.trim().parse::<usize>() {
                return n.to_string();
            }
        }
    }
    "4".to_string() // デフォルト
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    println!("cargo:rerun-if-changed=wrapper.h");
    println!("cargo:rerun-if-changed=vendor/");

    let target = env::var("TARGET").expect("TARGET is not set");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    let prebuilt_lib_dir = PathBuf::from("vendor/prebuilt").join(&target).join("lib");
    let prebuilt_inc_dir = PathBuf::from("vendor/prebuilt")
        .join(&target)
        .join("include");
    let src_dir = PathBuf::from("vendor/pjsip");

    // Step 1: prebuilt 優先
    if prebuilt_available(&prebuilt_lib_dir) {
        println!("cargo:warning=Using prebuilt PJSIP for {target}");
        emit_link_directives(&[&prebuilt_lib_dir]);
        emit_platform_link_directives();
        generate_bindings(&[&prebuilt_inc_dir]);
        return;
    }

    // Step 2: source build fallback
    if src_dir.exists() {
        match build_pjsip_from_source(&src_dir, &out_dir) {
            Ok(install_prefix) => {
                let flat_lib_dir = out_dir.join("pjsip-lib");
                match collect_libraries(&install_prefix, &flat_lib_dir) {
                    Ok(lib_dirs) => {
                        let refs: Vec<&Path> = lib_dirs.iter().map(|d| d.as_path()).collect();
                        emit_link_directives(&refs);
                        emit_platform_link_directives();
                        let inc_dirs = collect_include_dirs(&src_dir, &install_prefix);
                        let inc_refs: Vec<&Path> = inc_dirs.iter().map(|d| d.as_path()).collect();
                        generate_bindings(&inc_refs);
                        // ビルド成功後、vendor/prebuilt/{target}/ へ永続化して次回以降の cmake をスキップ
                        let _ = deploy_prebuilt(&install_prefix, &target);
                    }
                    Err(e) => {
                        print_installation_guide(&target);
                        panic!("Failed to collect PJSIP libraries: {e}");
                    }
                }
            }
            Err(e) => {
                print_installation_guide(&target);
                panic!("PJSIP build failed: {e}");
            }
        }
        return;
    }

    // Step 3: PJSIP 不在 → スタブ
    println!("cargo:warning=PJSIP not found — using stub bindings");
    print_installation_guide(&target);
    generate_bindings(&[]);
}
