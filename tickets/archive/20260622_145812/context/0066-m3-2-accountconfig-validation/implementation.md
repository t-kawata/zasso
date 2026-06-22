# M3-2: AccountConfig バリデーション 実装サマリ

## 変更ファイル
- `crates/siprs/Cargo.toml` — `srtp = []` feature 追加
- `crates/siprs/src/config.rs` — バリデーション関数群 8 関数 + 13 テスト追加

## 追加内容

### バリデーション関数群（ClientConfig validation 後、Unit tests 前に挿入）
- `validate_account_config(cfg) -> Result<(), SipError>` — エントリポイント、6 サブチェックを呼び出す
- `validate_username(username)` — 空文字列禁止
- `validate_domain(domain)` — 空文字列禁止
- `validate_password(password)` — 空文字列禁止（`expose_secret()` 使用）
- `derive_registrar_uri(domain, registrar_uri) -> String` — 未指定時 sip:{domain} 自動導出
- `validate_codec_policy(policy)` — 最低 1 コーデック有効必須
- `validate_dtmf_policy(policy)` — send/receive 非空必須
- `validate_preferred_codecs(codecs)` — Pcmu/Opus 以外拒否
- `validate_media_config_no_srtp(media)` — srtp feature 無効時 SRTP 使用禁止（`#[cfg(not(feature = "srtp"))]`）

### テスト（13 tests、全ルールの許可＋拒否両ケース）
1. `test_validate_account_config_ok` — 有効な設定が通過
2. `test_validate_username_empty` — 空 username → InvalidConfig
3. `test_validate_domain_empty` — 空 domain → InvalidConfig
4. `test_validate_password_empty` — 空 password → InvalidConfig
5. `test_derive_registrar_uri_none` — None → "sip:{domain}"
6. `test_derive_registrar_uri_override` — Some → 上書き維持
7. `test_validate_codec_policy_both_disabled` — 全無効 → InvalidConfig
8. `test_validate_codec_policy_opus_only` — Opus のみ有効 → Ok
9. `test_validate_dtmf_policy_send_empty` — send=[] → InvalidConfig
10. `test_validate_dtmf_policy_receive_empty` — receive=[] → InvalidConfig
11. `test_validate_preferred_codecs_ok` — [Pcmu, Opus] → Ok
12. `test_validate_preferred_codecs_empty_ok` — [] → Ok
13. `test_validate_account_config_error_messages` — 全エラーにフィールド名含む

### その他
- `use secrecy::ExposeSecret` を config.rs の import に追加
- `srtp = []` feature を Cargo.toml に追加
- `#[allow(dead_code)]` — 未使用関数の警告抑制（M12-4 で使用予定）

## 検証結果
- `cargo test`: 148 passed, 0 failed, 0 warnings
- `run-quality-checks.js`: 0 issues
