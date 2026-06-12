---
ticket_id: 66
title: "M3-2: AccountConfig バリデーション"
slug: m3-2-accountconfig-validation
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0066-m3-2-accountconfig-validation/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0066-m3-2-accountconfig-validation/review.md
---

# M3-2: AccountConfig バリデーション

## Summary

アカウント追加時の設定検証関数群を実装する。不正なアカウント設定は `add_account()` 呼び出し時に `SipError::InvalidConfig` で拒否される。また、`registrar_uri` 未指定時の自動導出ロジックも含む。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§11.1)

## Background

### RFC 準拠

RFC §11.1（AccountConfig validation rules）に準拠する。以下のルールを強制する：

- `username`, `domain`, `password` は空文字列禁止
- `register_on_start == false` でも `allow_outbound_without_register == true` なら有効（ただしバリデーションの対象外 — この組み合わせは設計上有意）
- `registrar_uri` 未指定時は `sip:{domain}` を自動導出
- codec policy は `enable_pcmu || enable_opus` が必須（少なくとも1つのコーデックが有効であること）
- DTMF policy は送信・受信ともに 1 つ以上 required
- `CallMediaPreferences.preferred_codecs` は PCMU/Opus 以外を拒否
- SRTP mandatory かつ feature off 禁止

### 既存チケットからの依存関係

- `AccountConfig` / `AccountCodecPolicy` / `OpusConfig` / `AccountMediaConfig` / `DtmfPolicy` / `AuthOverride` / `AccountConfigPatch`（M2-2: #63）— バリデーション対象
- `CallMediaPreferences` / `Codec`（M2-3: #64）— `validate_preferred_codecs` で参照
- `SipError`（M0-1: #52）— `SipError::invalid_config()` でエラーを返す
- `validate_client_config`（M3-1: #65）— 同一ファイルに追記、同一パターン

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M12-4 | `add_account()` — アカウント追加時のバリデーション呼び出し |

### 設計判断

- **`derive_registrar_uri` はバリデーションと同時実装**: RFC §11.1 で「registrar_uri 未指定時は sip:{domain} を自動導出」と規定されている。これは厳密にはバリデーションではなくデフォルト値解決だが、アカウント設定の前処理として同一チケットで実装する
- **`SecretString` の空チェック**: `SecretString` は `expose_secret()` で内部文字列にアクセスし、`is_empty()` で空判定する
- **SRTP feature flag**: `srtp` feature が Cargo.toml に未定義のため、本チケットで追加する

## Scope

### `crates/siprs/Cargo.toml`（修正）

- `srtp = []` feature flag を追加（条件付きチェック用）

### `crates/siprs/src/config.rs`（修正 — バリデーション関数群を追記）

既存の `validate_client_config` の直後に以下の関数を追加：

1. **`pub(crate) fn validate_account_config(cfg: &AccountConfig) -> Result<(), SipError>`**
   - 全アカウント設定バリデーションのエントリポイント
   - 内部で以下のサブチェックを呼び出す
   ```rust
   pub(crate) fn validate_account_config(cfg: &AccountConfig) -> Result<(), SipError> {
       validate_username(&cfg.username)?;
       validate_domain(&cfg.domain)?;
       validate_password(&cfg.password)?;
       validate_codec_policy(&cfg.codecs)?;
       validate_dtmf_policy(&cfg.dtmf)?;
       #[cfg(not(feature = "srtp"))]
       validate_media_config_no_srtp(&cfg.media)?;
       Ok(())
   }
   ```

2. **`fn validate_username(username: &str) -> Result<(), SipError>`**
   - 空文字列禁止

3. **`fn validate_domain(domain: &str) -> Result<(), SipError>`**
   - 空文字列禁止

4. **`fn validate_password(password: &SecretString) -> Result<(), SipError>`**
   - 空文字列禁止（`password.expose_secret().is_empty()`）

5. **`pub(crate) fn derive_registrar_uri(domain: &str, registrar_uri: &Option<String>) -> String`**
   - `registrar_uri` が `Some` ならそのまま返す
   - `None` なら `format!("sip:{domain}")` を返す

6. **`fn validate_codec_policy(policy: &AccountCodecPolicy) -> Result<(), SipError>`**
   - `enable_pcmu || enable_opus` が true でなければ `InvalidConfig`

7. **`fn validate_dtmf_policy(policy: &DtmfPolicy) -> Result<(), SipError>`**
   - `send_methods.is_empty()` → `InvalidConfig`
   - `receive_methods.is_empty()` → `InvalidConfig`

8. **`fn validate_preferred_codecs(codecs: &[Codec]) -> Result<(), SipError>`**
   - `Codec::Pcmu` と `Codec::Opus` 以外の variant がある場合 → `InvalidConfig`
   - ※ 現時点では Codec enum は Pcmu/Opus のみ。将来拡張時にこのチェックが効く

9. **`#[cfg(not(feature = "srtp"))] fn validate_media_config_no_srtp(media: &AccountMediaConfig) -> Result<(), SipError>`**
   - `srtp` feature 無効時に `SrtpPolicy::Mandatory` または `SrtpPolicy::Optional` が設定されていないことを検証

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_validate_account_config_ok` | 有効な AccountConfig → Ok |
| 2 | `test_validate_username_empty` | `username = ""` → InvalidConfig |
| 3 | `test_validate_domain_empty` | `domain = ""` → InvalidConfig |
| 4 | `test_validate_password_empty` | `password = ""` → InvalidConfig |
| 5 | `test_derive_registrar_uri_none` | `registrar_uri = None`, `domain = "pbx.example.com"` → `"sip:pbx.example.com"` |
| 6 | `test_derive_registrar_uri_override` | `registrar_uri = Some("sips:pbx.example.com")` → 上書きを返す |
| 7 | `test_validate_codec_policy_both_disabled` | `enable_pcmu = false, enable_opus = false` → InvalidConfig |
| 8 | `test_validate_codec_policy_opus_only` | `enable_pcmu = false, enable_opus = true` → Ok |
| 9 | `test_validate_dtmf_policy_send_empty` | `send_methods = vec![]` → InvalidConfig |
| 10 | `test_validate_dtmf_policy_receive_empty` | `receive_methods = vec![]` → InvalidConfig |
| 11 | `test_validate_preferred_codecs_ok` | `vec![Codec::Pcmu, Codec::Opus]` → Ok |
| 12 | `test_validate_preferred_codecs_empty_ok` | `vec![]` → Ok（空は許容する） |
| 13 | `test_validate_account_config_error_messages` | 全エラーメッセージに違反フィールド名が含まれる |

### ユニットテスト不可能な項目（例外）

- `srtp` feature 無効時の `SrtpPolicy::Mandatory` チェック — `cargo test --no-default-features` でのビルド確認で代替（feature gate 依存のため通常のテストランナーでは条件分岐不可）。本チケットでは関数定義のみ行い、コンパイル通貨を確認する
- `#[cfg(feature = "srtp")]` 時の動作 — srtp feature 有効時はバリデーションをスキップする（すべての SrtpPolicy が許可される）

## Non-scope

- `SipClient::add_account()` でのバリデーション呼び出し — M12-4
- エラー型の拡張 — 既存の `SipError::InvalidConfig` で十分
- `validate_client_config` は M3-1 で完了済み

## Test Plan

### 基本方針

全バリデーションルールの網羅率 100%。各ルールの「許可」と「拒否」の両ケースをテスト。エラーメッセージに違反フィールド名が含まれることを確認。

### テスト不可能な項目（理由付き）

- `srtp` feature gate の実際の動作 — feature flag の有効/無効をテストランナーで切り替えられないため。`cargo check` で型レベルのコンパイル保証を確認

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存の 135 テスト + 新規テスト）
- [ ] `validate_account_config()` が `pub(crate)` で定義されている
- [ ] `derive_registrar_uri` が実装されている
- [ ] `username = ""` → `InvalidConfig`
- [ ] `domain = ""` → `InvalidConfig`
- [ ] `password = ""` → `InvalidConfig`
- [ ] `registrar_uri = None, domain = "pbx.example.com"` → `"sip:pbx.example.com"`
- [ ] `registrar_uri = Some("sips:pbx.example.com")` → `"sips:pbx.example.com"`（上書き維持）
- [ ] `enable_pcmu = false, enable_opus = false` → `InvalidConfig`
- [ ] `send_methods = vec![]` → `InvalidConfig`
- [ ] `receive_methods = vec![]` → `InvalidConfig`
- [ ] 全エラーメッセージに違反フィールド名が含まれること
- [ ] `srtp` feature が Cargo.toml に追加されていること
- [ ] `#[cfg(not(feature = "srtp"))]` のガードが正しく機能すること

## Notes

### `derive_registrar_uri` の位置づけ

RFC §11.1 の規定により、`registrar_uri` 未指定時は `sip:{domain}` を自動導出する。この関数は「バリデーションではないが、アカウント設定の前処理として必須」なため、M3-2 に含める。

### `validate_preferred_codecs` の位置づけ

`CallMediaPreferences::preferred_codecs` のバリデーション。`CallMediaPreferences` は M2-3 で定義済み。現時点では `Codec` enum が Pcmu/Opus のみのため、空リストは許可しつつも不正な variant があれば拒否する準備として実装する。

### M3 マイルストーン完了

本チケット #66 で M3（設定バリデーション）の全 2 チケットが完了する。次のマイルストーンは M4（IDマッピング・ユーティリティ）。
