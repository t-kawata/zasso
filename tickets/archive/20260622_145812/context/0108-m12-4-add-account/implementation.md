# 実装成果: チケット #108 — M12-4 add_account

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/client.rs | 追記 | SipAccountHandle + 4 methods + 4 tests |

## 実装内容

### SipAccountHandle (struct)
- id: AccountId / client: SipClient
- Clone + Debug

### SipClient methods
- add_account(config) — validate + send_to_reactor + return handle
- remove_account(account_id) — send_to_reactor
- account(account_id) — read from state
- accounts() — list from state

### Boy Scout
- block_on から #[cfg(test)] 削除（public API で使用するため）
- 関連 import の #[cfg(test)] 整理

## テスト結果
- 318 tests PASS（既存 314 + 新規 4）
- 0 warnings
- Quality checks: 0 issues
