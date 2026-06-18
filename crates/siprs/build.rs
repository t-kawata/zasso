use std::env;
use std::path::PathBuf;

/// bindgen 生成バインディングの出力先パスを返す。
///
/// 出力先は `OUT_DIR/pjsip_bindings.rs` 固定。
fn output_path() -> PathBuf {
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is not set"));
    out_dir.join("pjsip_bindings.rs")
}

/// プラットフォーム別の clang include 引数を収集する。
///
/// # 優先順
///
/// 1. `PJSIP_INCLUDE_DIR` 環境変数（最も確実）
/// 2. 空リスト（システム標準パスに委譲、M19-1 で vendor/ 対応を含め拡張）
fn collect_clang_args() -> Vec<String> {
    let mut args: Vec<String> = Vec::new();
    if let Ok(dir) = env::var("PJSIP_INCLUDE_DIR") {
        args.push(format!("-I{dir}"));
    }
    args
}

/// PJSIP ヘッダ不在時など、bindgen 失敗時にユーザーに案内するエラーメッセージを表示する。
fn print_installation_guide() {
    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    eprintln!();
    eprintln!("============================================================");
    eprintln!("  PJSIP headers not found. Install PJSIP 2.17 or set");
    eprintln!("  PJSIP_INCLUDE_DIR to the path containing pjsip headers.");
    eprintln!("============================================================");
    eprintln!();
    match os.as_str() {
        "macos" => {
            eprintln!("  macOS:");
            eprintln!("    brew install pkg-config cmake");
            eprintln!("    # Then install PJSIP 2.17 (manual or package)");
            eprintln!("    export PJSIP_INCLUDE_DIR=/path/to/pjsip/include");
        }
        "linux" => {
            eprintln!("  Linux:");
            eprintln!("    sudo apt-get install build-essential cmake \\");
            eprintln!("      libasound2-dev libssl-dev libcrypto-dev libuuid-dev");
            eprintln!("    # Then install PJSIP 2.17 (manual or package)");
            eprintln!("    export PJSIP_INCLUDE_DIR=/path/to/pjsip/include");
        }
        "windows" => {
            eprintln!("  Windows:");
            eprintln!("    # Install PJSIP 2.17 (prebuilt or source)");
            eprintln!("    set PJSIP_INCLUDE_DIR=C:\\path\\to\\pjsip\\include");
        }
        _ => {
            eprintln!("  See docs/rust-sip-client-rfc.md §28.4 for platform-specific");
            eprintln!("  system package requirements.");
        }
    }
    eprintln!();
    eprintln!("  Note: PJSIP library linking will be added in M19-1.");
    eprintln!("  This ticket (M17-1) only covers bindgen code generation.");
    eprintln!("============================================================");
    eprintln!();
}

/// allowlist する関数パターンの一覧を返す。
fn allowed_functions() -> &'static [&'static str] {
    &["pjsua_.*", "pjsip_.*", "pj_.*", "pjmedia_.*", "pjsua2_.*"]
}

/// allowlist する型パターンの一覧を返す。
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

/// allowlist する定数パターンの一覧を返す。
fn allowed_vars() -> &'static [&'static str] {
    &["PJSUA_.*", "PJ_.*", "PJSIP_.*"]
}

/// blocklist する型の一覧を返す。
///
/// これらの型は POSIX やプラットフォーム固有の宣言と競合するため除外する。
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

/// bindgen ビルダーを生成し、allowlist / blocklist を適用する。
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

/// 生成されたバインディングをファイルに書き込む。
fn write_bindings(bindings: bindgen::Bindings, path: &PathBuf) {
    bindings
        .write_to_file(path)
        .expect("bindgen: failed to write bindings to output path");
}

/// PJSIP 不在時に生成するスタブバインディングをファイルに書き込む。
///
/// 実バインディングは M19-1 で vendor/ からの PJSIP ソースビルドにより生成される。
/// それまでは全ての FFI 型を手動定義（ffi/strings.rs, ffi/callbacks.rs）で代替する。
fn write_stub_bindings(path: &PathBuf) {
    use std::io::Write;
    let mut file = std::fs::File::create(path)
        .unwrap_or_else(|e| panic!("failed to create stub bindings at {}: {e}", path.display()));
    writeln!(
        file,
        "// [::STUB::] M19-1 (build.rs) で bindgen による実バインディングに置き換える。"
    )
    .unwrap();
    writeln!(file, "// 現状は FFI 型を手動定義 (ffi/strings.rs, ffi/callbacks.rs) で代替するため空で問題ない。").unwrap();
    writeln!(file, "#[allow(dead_code)]").unwrap();
    writeln!(file, "const _PJSIP_BINDGEN_NOT_AVAILABLE: bool = false;").unwrap();
}

fn main() {
    // wrapper.h が変更されたら bindgen を再実行する。
    println!("cargo:rerun-if-changed=wrapper.h");

    let out_path = output_path();
    let clang_args = collect_clang_args();
    let builder = create_bindgen_builder(&clang_args);
    match builder.generate() {
        Ok(bindings) => {
            write_bindings(bindings, &out_path);
        }
        Err(e) => {
            print_installation_guide();
            eprintln!("bindgen error: {e}");
            eprintln!("---");
            eprintln!("Writing stub bindings instead. Real bindings will be generated");
            eprintln!("in M19-1 when PJSIP headers are available.");
            write_stub_bindings(&out_path);
            println!("cargo:warning=PJSIP headers not found — using stub bindings (see M19-1)");
        }
    }

    // M19-1: PJSIP library linking + source build fallback をここに追加
}
