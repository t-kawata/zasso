//! # zasso — Tauri アプリケーションエントリポイント
//!
//! `setup()` フックで以下の初期化を順に実行し、アプリケーションと全サイドカーが
//! 運命共同体（Fate Sharing）として動作することを保証する：
//!
//! 0. `tracing_subscriber::fmt().with_timer(MycuteTime).init()` — 構造化ログ基盤の初期化
//! 1. `ensure_edition_data_dir()` — エディションデータディレクトリ作成
//! 2. `init_edition_home()` → `edition_home()` — エディションホーム初期化
//! 3. `ensure_bifrost_binary()` — Bifrost バイナリ展開
//! 4. `registry.start_all_async(sidecar_defs())` — 全サイドカー非同期起動（即座に戻る）
//! 5. `monitor.wait_for_all()` をバックグラウンドで監視 — タイムアウト時は全子プロセス停止
//! 6. registry.pipe_output_to("bifrost", ...) — サイドカー出力のログ統合
//! 7. install_panic_hook() — パニック安全網
//! 8. app.manage(registry) — ProcessRegistry を Tauri State に登録

mod bifrost;
mod consts;
mod sidecar;

use chrono::Local;
use process_registry::ProcessRegistry;
use tauri::Manager;
use tracing_subscriber::fmt::format::Writer;
use tracing_subscriber::fmt::time::FormatTime;

/// tracing-subscriber のタイムスタンプフォーマッター
///
/// mycute の fern 設定に合わせ、`%y-%m-%d_%H:%M:%S` 形式（例: `25-06-11_10:52:39`）を
/// 出力する。ISO8601（T付き・ナノ秒）より短く、人間の目で読みやすい。
struct MycuteTime;

impl FormatTime for MycuteTime {
    fn format_time(&self, w: &mut Writer<'_>) -> std::fmt::Result {
        write!(w, "{}", Local::now().format("%y-%m-%d_%H:%M:%S"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// MycuteTime が `%y-%m-%d_%H:%M:%S` 形式（17文字）で時刻を出力することを確認する。
    /// 例: `25-06-11_10:52:39`
    #[test]
    fn mycute_time_format_is_17_chars() {
        let timer = MycuteTime;
        let mut buf = String::new();
        let mut writer = Writer::new(&mut buf);
        let result = timer.format_time(&mut writer);
        assert!(result.is_ok(), "format_time should succeed");
        assert_eq!(
            buf.len(),
            17,
            "expected format %y-%m-%d_%H:%M:%S to produce 17 chars"
        );
    }

    /// MycuteTime の出力にアンダースコアが含まれることを確認する
    /// （日付と時刻の区切り文字）
    #[test]
    fn mycute_time_contains_underscore() {
        let timer = MycuteTime;
        let mut buf = String::new();
        let mut writer = Writer::new(&mut buf);
        let _ = timer.format_time(&mut writer);
        assert!(
            buf.contains('_'),
            "format should contain '_' between date and time"
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // ---- Step 0: 構造化ログ基盤を初期化する ----
            // try_init() で二重初期化を防止する。2回目以降は何も起きない。
            // env-filter 機能により RUST_LOG 環境変数でログレベルを動的に制御できる。
            // wgpu_core / wgpu_hal / naga は Tauri 内部で大量のトレース出力を行うため、
            // 明示的に WARN 以上に絞る。
            // MycuteTime により `%y-%m-%d_%H:%M:%S` 形式（例: 25-06-11_10:52:39）で
            // タイムスタンプを整形する。
            let _ = tracing_subscriber::fmt()
                .with_timer(MycuteTime)
                .with_target(true)
                .with_level(true)
                .with_env_filter("info,wgpu_core=warn,wgpu_hal=warn,naga=warn")
                .try_init();

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

            // ---- Step 4: ProcessRegistry で全サイドカーを非同期的に起動する ----
            // 従来の同期 start_all と異なり、この呼び出しは即座に戻る。
            // 実際のプロセス起動はバックグラウンドで進行し、全プロセスの起動が
            // 完了しないまま Tauri ウィンドウが表示される可能性がある。
            // その代わり、起動完了を StartupMonitor で監視し、タイムアウト時は
            // 全子プロセスを shutdown_all してアプリを終了する。
            let registry = ProcessRegistry::new();
            let defs = sidecar::sidecar_defs(edition_home);
            let monitor = tauri::async_runtime::block_on(registry.start_all_async(
                defs,
                std::time::Duration::from_secs(consts::SIDECAR_STARTUP_TIMEOUT_SECS),
            ));
            // 起動監視タスク: 全プロセスの起動完了またはタイムアウトを待機する
            let reg_for_monitor = registry.clone();
            tauri::async_runtime::spawn(async move {
                match monitor.wait_for_all().await {
                    Ok(_snapshot) => {
                        tracing::info!("[sidecar] All sidecars started successfully");
                    }
                    Err(e) => {
                        tracing::error!("[sidecar] Startup failed or timed out: {e}");
                        reg_for_monitor.shutdown_all().await;
                        std::process::exit(1);
                    }
                }
            });

            // ---- Step 5: サイドカーの標準出力・エラー出力をログに統合する ----
            // pipe_output_to は出力行を sink クロージャに転送する。
            // プロセス名が存在しない場合は何もせず None が返る。
            let _ = tauri::async_runtime::block_on(registry.pipe_output_to("bifrost", |line| {
                tracing::info!("[bifrost] {}", line);
            }));
            // handle の JoinHandle は registry と運命を共にする（registry 破棄時にタスク終了）

            // ---- Step 6: パニック安全網を設置する ----
            // パニック時に全サイドカーを強制停止し、孤児プロセスを防止する
            process_registry::panic::install_panic_hook(registry.clone());

            // ---- Step 7: ProcessRegistry を Tauri State として登録する ----
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
