# 実装サマリ

## 変更ファイル

### src-tauri/Cargo.toml
- `cargo add tracing` — v0.1.44
- `cargo add tracing-subscriber --features env-filter,fmt` — v0.3.23

### src-tauri/src/lib.rs
- モジュールドキュメントを更新（Step 0 と Step 5 を追記、番号を 0..7 に変更）
- `setup()` 冒頭（Step 0）に `tracing_subscriber::fmt().try_init()` を追加
  - `with_env_filter("info,wgpu_core=warn,wgpu_hal=warn,naga=warn")` でログレベル設定
  - `try_init()` で二重初期化を防止
- Step 4（start_all）の直後に Step 5 として `pipe_output_to("bifrost", ...)` を追加
  - `tauri::async_runtime::block_on()` で非同期APIを同期的に呼び出し
  - bifrost の全出力行を `tracing::info!("[bifrost] {}")` でログ出力

## 変更なし（独立性確認済み）
- `crates/procreg/Cargo.toml` — tracing/log の依存なし（✅ 独立性維持）
- `crates/procreg/watchdog/src/main.rs` — rustc 直接ビルドのため eprintln! 維持

## 検証結果
- `make check` — ✅ コンパイル成功
- `make test` — ✅ 12 tests passed, 0 failed
- procreg の Cargo.toml に tracing なし — ✅
- 新規コードに unwrap/expect なし — ✅
