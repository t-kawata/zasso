//! build.rs — プリビルドネイティブライブラリのリンク設定
//!
//! 移植元: ~/shyme/mycute/build.rs（Tauri依存を削除し、voiput用に整理）
//!
//! 本ファイルは M6-1 で完成する。現時点ではスケルトンとして、
//! プリビルドライブラリが存在しなくても cargo build が通るようにする。

use std::env;
use std::path::PathBuf;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let prebuilt = manifest_dir.join("prebuilt");

    if target_os == "windows" {
        let win_dir = prebuilt.join("windows");
        let lib_path = win_dir.join("speech_helper.lib");
        let dll_path = win_dir.join("SpeechHelper.dll");

        if lib_path.exists() {
            println!("cargo:rustc-link-lib=SpeechHelper");
            println!("cargo:rustc-link-search=native={}", win_dir.display());
        } else {
            println!(
                "cargo:warning=speech_helper.lib not found at {}. \
                      Run native/cs/build.ps1 to build it.",
                win_dir.display()
            );
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
            "ole32", "oleaut32", "advapi32", "bcrypt", "crypt32", "iphlpapi", "kernel32",
            "mswsock", "ntdll", "secur32", "user32", "ws2_32",
        ] {
            println!("cargo:rustc-link-lib={}", lib);
        }
        println!("cargo:rustc-link-arg=/IGNORE:4099");
    } else if target_os == "macos" {
        let mac_dir = prebuilt.join("macos");
        let lib_path = mac_dir.join("libspeech_helper.a");

        if lib_path.exists() {
            println!("cargo:rustc-link-lib=static=SpeechHelper");
            println!("cargo:rustc-link-search=native={}", mac_dir.display());
        } else {
            println!(
                "cargo:warning=libspeech_helper.a not found at {}. \
                      Run native/swift/build.sh to build it.",
                mac_dir.display()
            );
        }

        if let Ok(output) = std::process::Command::new("swiftc")
            .args(["-print-target-info"])
            .output()
        {
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
    } else {
        println!(
            "cargo:warning=voiput: unsupported target OS '{}'. \
             Only OpenAI engine will be available.",
            target_os
        );
    }

    println!("cargo:rerun-if-changed=prebuilt/");
}
