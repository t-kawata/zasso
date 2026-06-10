// consts モジュールは将来のコードから参照されるまで未使用警告を抑止する
#[allow(dead_code)]
mod consts;

#[allow(dead_code)]
mod bifrost;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|_app| {
            consts::ensure_edition_data_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
            consts::init_edition_home()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
            let edition_home = consts::edition_home()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
            bifrost::ensure_bifrost_binary(edition_home)
                .map_err(|e| Box::<dyn std::error::Error>::from(e.as_str()))?;
            Ok(())
        })
        .run(tauri::generate_context!())?;
    Ok(())
}
