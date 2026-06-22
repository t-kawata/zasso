# 実装サマリ: procreg 非同期起動モードと StartupMonitor

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/procreg/src/child.rs | 修正 | ChildGuard を Arc<Mutex<Option<Child>>> に変更し Clone 可能に |
| crates/procreg/src/graph.rs | 修正 | resolve_start_levels() 追加 + テスト8ケース |
| crates/procreg/src/error.rs | 修正 | SpawnCancelled, StartupTimeout 追加 + テスト4ケース |
| crates/procreg/src/spawn.rs | 修正 | wait_ready に cancel_token 割り込み監視を追加 |
| crates/procreg/src/startup_monitor.rs | 新規 | StartupMonitor 型 + テスト9ケース |
| crates/procreg/src/registry.rs | 修正 | start_all_async() 追加 + Default 実装追加 |
| crates/procreg/src/lib.rs | 修正 | pub mod + pub use 追加 |
| crates/procreg/src/watch.rs | 修正 | clippy 指摘の match を簡略化 |
| src-tauri/src/consts/settings.rs | 修正 | SIDECAR_STARTUP_TIMEOUT_SECS 追加 |
| src-tauri/src/consts/mod.rs | 修正 | 上記定数の再公開 |
| src-tauri/src/lib.rs | 修正 | start_all → start_all_async + 監視タスク |

## 品質メトリクス
- テスト: 106 passed (procreg lib) + 14 passed (zasso lib)
- Clippy: 警告ゼロ (-D warnings)
- Fmt: 通過
- zasso ビルド: 成功

## 既知の制約
- spawn_one 内での cancel_token 監視は wait_ready と select! で実現
- ChildGuard の早期登録はテスト非互換のため PID ベースの方式に変更（Watchdog の1秒安全網で代用）
