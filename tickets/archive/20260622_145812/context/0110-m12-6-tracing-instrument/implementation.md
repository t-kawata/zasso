# M12-6: 全公開API・PJSIP callback への #[tracing::instrument] 計装

## 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | 全 pub fn (10件) に #[tracing::instrument] 付与 |

## 計装内容

| メソッド | 属性 | 理由 |
|----------|------|------|
| new() | `skip_all` | テスト専用, config は秘匿情報含む |
| subscribe() | `skip(self)` | 戻り値のみ |
| subscribe_raw_sip() | `skip(self)` | 戻り値のみ |
| subscribe_account() | `skip(self), fields(account_id = %account_id)` | アカウント識別 |
| add_account() | `skip(self, config)` | config に AccountConfig (secret 含む) |
| remove_account() | `skip(self), fields(account_id = %account_id)` | アカウント識別 |
| account() | `skip(self), fields(account_id = %account_id)` | アカウント識別 |
| accounts() | `skip(self)` | 引数なし, 戻り値のみ |
| shutdown() | `skip(self)` | idempotent 確認用 |
| is_shutdown() | `skip(self)` | 状態確認 |

## 検証結果
- cargo check --all-targets: 0 errors, 0 warnings
- cargo test: 320 passed, 0 failed
- run-quality-checks.js: 0 issues
