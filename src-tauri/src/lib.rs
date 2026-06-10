//! # zasso — Tauri アプリケーションエントリポイント
//!
//! `setup()` フックで以下の初期化を順に実行し、アプリケーションと全サイドカーが
//! 運命共同体（Fate Sharing）として動作することを保証する：
//!
//! 1. `ensure_edition_data_dir()` — エディションデータディレクトリ作成
//! 2. `init_edition_home()` → `edition_home()` — エディションホーム初期化
//! 3. `ensure_bifrost_binary()` — Bifrost バイナリ展開
//! 4. registry.start_all(sidecar_defs()) — 全サイドカー宣言的起動
//! 5. install_panic_hook() — パニック安全網
//! 6. app.manage(registry) — ProcessRegistry を Tauri State に登録

mod bifrost;
mod consts;
mod sidecar;

use process_registry::ProcessRegistry;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ---- Step 1: エディションデータディレクトリを作成する ----
            consts::ensure_edition_data_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;

            // ---- Step 2: エディションホームを初期化し絶対パスをキャッシュする ----
            consts::init_edition_home()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
            let edition_home = consts::edition_home()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;

            // ---- Step 3: Bifrost バイナリを EDITION_HOME/bifrost/ に展開する ----
            // バージョンマーカー方式で初回または更新時のみ展開される
            bifrost::ensure_bifrost_binary(edition_home)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;

            // ---- Step 4: ProcessRegistry で全サイドカーを宣言的に起動する ----
            let registry = ProcessRegistry::new();
            let defs = sidecar::sidecar_defs(edition_home);
            tauri::async_runtime::block_on(registry.start_all(defs))
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

            // ---- Step 5: パニック安全網を設置する ----
            // パニック時に全サイドカーを強制停止し、孤児プロセスを防止する
            process_registry::panic::install_panic_hook(registry.clone());

            // ---- Step 6: ProcessRegistry を Tauri State として登録する ----
            // フロントエンドから状態照会（snapshot）が可能になる
            app.manage(registry);

            Ok(())
        })
        .build(tauri::generate_context!())?;

    // アプリ終了時に全サイドカーを Graceful Shutdown する
    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let registry = (*app_handle.state::<ProcessRegistry>()).clone();
            tauri::async_runtime::spawn(async move {
                registry.shutdown_all().await;
            });
        }
    });

    Ok(())
}
