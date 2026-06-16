# 実装成果: チケット #92 — M8-1 状態型定義

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/account.rs | 新規 | RegistrationState (7 vars) + Display impl + 1 test |
| crates/siprs/src/runtime/mod.rs | 新規 | pub mod state; |
| crates/siprs/src/runtime/state.rs | 新規 | ClientState + AccountEntry + CallEntry + 8 methods + 8 tests |
| crates/siprs/src/lib.rs | 修正 | pub mod account; + pub mod runtime; |

## 実装内容

### RegistrationState (account.rs)
- 7 variants: Disabled, Idle, Registering, Registered, Unregistering, Failed, Expired
- Display impl （小文字スネークケース文字列）

### ClientState / AccountEntry / CallEntry (runtime/state.rs)
- pub(crate) structs with #[allow(dead_code)] (M9/M12 で使用)
- 8 操作 + new: add/get/remove account/call, get_mut x2, call_count
- エラーヘルパー: account_not_found(), call_not_found()
- CallStateSkeleton / MediaRuntimeSkeleton スケルトン型

## テスト結果
- 247 tests PASS（既存 238 + 新規 9）
- 0 warnings
- Quality checks: 0 issues（unwrap 4件修正済み）
