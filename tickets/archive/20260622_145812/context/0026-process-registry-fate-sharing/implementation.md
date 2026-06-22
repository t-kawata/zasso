# 実装サマリー: process-registry による宣言的サイドカー管理基盤（Fate Sharing）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src-tauri/Cargo.toml` | 修正 | `process-registry = { path = "../crates/procreg" }` を追加 |
| `src-tauri/src/sidecar.rs` | **新規** | 7件のテスト付き宣言的サイドカー定義モジュール |
| `src-tauri/src/lib.rs` | 修正 | setup() 統合、greet テンプレート削除、ExitRequested ハンドラ |

## 実装内容

### sidecar.rs
- `BIFROST_PORT` 定数 (3912)
- `sidecar_defs(edition_home) -> Vec<ProcessDef>` — 全サイドカーの宣言的定義
  - Bifrost `ProcessDef`: name=bifrost, restart=OnCrash(default), ready=TcpPort(3912)
  - 将来のサイドカー追加は `vec![...]` に1エントリ追加するだけ
- `#[cfg(test)]` に7件のユニットテスト（全パス）

### lib.rs
- `mod sidecar;` 宣言追加
- `setup()` フックを以下の順序に整理:
  1. ensure_edition_data_dir()
  2. init_edition_home() → edition_home()
  3. ensure_bifrost_binary()
  4. **ProcessRegistry::new() + sidecar_defs() + registry.start_all()**
  5. **install_panic_hook()**
  6. **app.manage(registry)**
- `tauri::RunEvent::ExitRequested` ハンドラで `shutdown_all()` を spawn
- Boy Scout: `greet` テンプレート関数と `invoke_handler` を削除

### 運命共同体 (Fate Sharing) 実現
| 経路 | 仕組み | 状態 |
|------|--------|------|
| 通常終了 | ExitRequested → spawn shutdown_all → ChildGuard::shutdown | ✅ |
| パニック | install_panic_hook → 専用スレッド + current_thread RT | ✅ |
| 子プロセス異常終了 | watch_loop → RestartPolicy::OnCrash(backoff) | ✅ (process-registry) |
| 子プロセス残存 (Drop) | ChildGuard::drop → start_kill | ✅ (process-registry) |

## テスト結果
- sidecar テスト: 7 passed
- process-registry 回帰テスト: 76 passed
- cargo build: 成功 (warnings は pre-existing のみ)
- run-quality-checks: 0 issues
