# 実装計画: procreg 非同期起動モードと StartupMonitor

## 要件
process-registry crate に非同期起動モード start_all_async + StartupMonitor を追加。既存 start_all は維持。zasso 側は lib.rs のみ変更。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/procreg/src/lib.rs | 修正 | pub mod + pub use 追加 |
| crates/procreg/src/graph.rs | 修正 | resolve_start_levels() 追加 |
| crates/procreg/src/error.rs | 修正 | SpawnCancelled, StartupTimeout 追加 |
| crates/procreg/src/spawn.rs | 修正 | cancel_token 監視 + ChildGuard early registration |
| crates/procreg/src/registry.rs | 修正 | start_all_async() 追加 |
| crates/procreg/src/startup_monitor.rs | 新規 | StartupMonitor 型 |
| crates/procreg/tests/integration.rs | 修正 | async 起動の統合テスト |
| src-tauri/src/lib.rs | 修正 | start_all → start_all_async |
| src-tauri/src/consts/settings.rs | 修正 | SIDECAR_STARTUP_TIMEOUT_SECS |

## 実装手順（9ステップ）
1. graph.rs: resolve_start_levels() + テスト8ケース
2. error.rs: SpawnCancelled + StartupTimeout + テスト4ケース
3. spawn.rs: cancel_token 監視 + ChildGuard early registration + テスト3ケース
4. startup_monitor.rs: 新規作成 + テスト8ケース
5. registry.rs: start_all_async() + テスト5ケース
6. lib.rs: pub mod + pub use 追加
7. settings.rs: タイムアウト定数追加
8. src-tauri/src/lib.rs: 非同期起動に切り替え
9. 品質検証: cargo test / cargo clippy / cargo fmt

## リスク
- ChildGuard の Arc<Mutex<>> ラップによる所有権モデル変更
- レベル間バリアでのプロセス間待機は設計上の正常動作
- watch_loop 初回起動と StartupMonitor の競合は once モードで排他
