# 実装サマリー: Watchdogラッパーによる全OS統一の親死検知機構（チケット #29）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/watchdog/src/main.rs` | **新規** | 監視ラッパーバイナリ（std::process::Command のみ、外部依存ゼロ） |
| `crates/procreg/build.rs` | **新規** | rustc で watchdog をコンパイル + OUT_DIR 公開 |
| `crates/procreg/src/watchdog.rs` | **新規** | include_bytes! 埋め込み + extract_watchdog() |
| `crates/procreg/src/spawn.rs` | **修正** | Watchdog ラッパー起動に改写。pre_exec/prctl/PROCREG_PARENT_PID 削除 |
| `crates/procreg/src/parent.rs` | **削除** | install_parent_monitor() 削除（Watchdog が代替） |
| `crates/procreg/src/lib.rs` | **修正** | parent 削除、watchdog モジュール追加 |

## アーキテクチャ

```
Before（3系統）:
  spawn → [prctl(pre_exec)] → [bifrost-http]  # Linux専用
  spawn → [bifrost-http] + 親スレッド監視       # macOS専用
  spawn → [bifrost-http]                        # Windows（監視なし）

After（全OS統一）:
  extract watchdog → spawn → [procreg-watchdog] 
                               ├── sleep 1 → kill -0 親PID
                               │   親が死んだら → 子をkill → exit(0)
                               ├── 子の生存確認
                               │   子が先に死んだら → exit(子の終了コード)
                               └── [bifrost-http] ← stdio透過継承
```

## テスト結果
- 全テスト: 84 passed（既存83 + 新規1）
- run-quality-checks: 0 issues
- 旧コード完全削除確認: ✅ parent.rs / prctl / install_parent_monitor なし
- src-tauri 側: 変更不要（Watchdog が spawn_one 内部で透過的に処理）

## 新規テスト
| テスト | 結果 | 内容 |
|--------|------|------|
| `watchdog_parent_env_var_is_set` | ✅ | printenv で PROCREG_WATCHDOG_PARENT_PID を実検証 |
