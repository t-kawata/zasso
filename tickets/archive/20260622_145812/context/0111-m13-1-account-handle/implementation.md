# M13-1: SipAccountHandle — アカウント単位操作

## 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | impl SipAccountHandle (6 methods), ensure_not_shutdown(), [::STUB::]除去, 7 tests |
| crates/siprs/src/runtime/command.rs | 修正 | RuntimeCommand::UpdateAccountConfig バリアント追加 |
| crates/siprs/src/runtime/reactor.rs | 修正 | reject_command に UpdateAccountConfig 追加 |

## 実装内容

### SipAccountHandle メソッド (client.rs)
| メソッド | 方式 | 内部処理 |
|----------|------|---------|
| id() | ローカル | self.id を返す |
| register() | RTT | SetRegistration { enabled: true } |
| unregister() | RTT | SetRegistration { enabled: false } |
| set_registration_enabled(bool) | RTT | SetRegistration |
| registration_state() | ローカル | state.blocking_read() → AccountEntry.registration |
| update_config(AccountConfigPatch) | RTT | UpdateAccountConfig |

### SipClient 補助メソッド
- ensure_not_shutdown() — pub(crate) helper

### [::STUB::] 解決
- SipAccountHandle::client の #[allow(dead_code)] + [::STUB::] 除去

### RuntimeCommand 追加
- UpdateAccountConfig { account_id, patch, reply }

## テスト (7件)
| テスト | 種別 | 状態 |
|--------|------|------|
| test_account_handle_id | 単体 | ✅ |
| test_account_registration_state | 単体 | ✅ |
| test_account_registration_state_not_found | 単体 | ✅ |
| test_account_registration_state_shutdown | 単体 | ✅ |
| test_account_command_delivery | 結合 (tokio) | ✅ |
| test_account_operation_after_shutdown | 結合 (tokio) | ✅ |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 326 passed, 0 failed (＋1 doc-test)
- run-quality-checks.js: 0 issues
