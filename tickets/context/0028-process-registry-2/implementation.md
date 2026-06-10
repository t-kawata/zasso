# 実装サマリー: process-registry 親プロセス生死監視（チケット #28）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/spawn.rs` | 修正 | `PROCREG_PARENT_PID` 環境変数設定 + Linux `pre_exec` pdeathsig + テスト |
| `crates/procreg/src/parent.rs` | **新規** | `install_parent_monitor()` — 監視スレッド + 型チェックテスト |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod parent;` + `pub use install_parent_monitor;` |

## 仕組み

| レイヤー | OS | 方式 | 信頼性 |
|---------|-----|------|--------|
| プロセス起動時 | 全OS | `PROCREG_PARENT_PID` env var | 子が自力監視する場合の情報源 |
| プロセス起動時 | Linux | `prctl(PR_SET_PDEATHSIG, SIGTERM)` via pre_exec | 🟢 完全（SIGKILLでも動作） |
| ランタイム稼働中 | 全OS(macOS含む) | `install_parent_monitor()` std::thread | 🟡 ベストエフォート |

## テスト結果
- 全テスト: 85 passed（既存83 + 新規2）
- run-quality-checks: 0 issues
- 翻訳可能性チェック: 合格（SAFETY コメント付き unsafe ✅）

## 新規テスト詳細
| テスト | 結果 |
|--------|------|
| `spawn::parent_env_var_is_set` | ✅ printenv 出力から env var を実検証 |
| `parent::install_parent_monitor_type_check` | ✅ 型安全＋スレッドセーフ確認 |
