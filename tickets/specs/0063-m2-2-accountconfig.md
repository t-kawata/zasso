---
ticket_id: 63
title: "M2-2: AccountConfig / AccountCodecPolicy / OpusConfig / AccountMediaConfig / DtmfPolicy 定義"
slug: m2-2-accountconfig
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0063-m2-2-accountconfig/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0063-m2-2-accountconfig/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0063-m2-2-accountconfig/plan.md
---
# M2-2: AccountConfig / AccountCodecPolicy / OpusConfig / AccountMediaConfig / DtmfPolicy 定義

## Summary

アカウント単位の設定型を定義する。パスワードは `SecretString` で保持し、デバッグ出力からの漏洩を防止する。DTMF 方式とコーデック設定を型安全に表現する（RFC §11, §11.1, §20, §30）。

既存の `src/config.rs` に追記する形で実装し、`cargo build` / `cargo test` が通る状態にする。

## Background

### RFC 準拠

RFC §11（AccountConfig 完全仕様）に完全準拠する。§11.1 の validation rules は M3-2 で実装。§20（DTMF）から DtmfMethod/Method を先行定義。§30（SRTP）から SrtpPolicy を定義。

### 既存チケットからの依存関係

- `SecretString`（M1-4: secrecy crate）→ `AccountConfig::password` で使用
- `TransportKind`（M1-3）→ `AccountTransportPolicy` で使用
- `ClientConfig` / `config.rs`（M2-1）→ 同一ファイルに追記

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M2-3 | OutgoingCallRequest / CallMediaPreferences |
| M3-2 | AccountConfig バリデーション |
| M12-4 | add_account() / remove_account() |
| M13-1 | SipAccountHandle — account 設定の動的変更 |

## Scope

### `crates/siprs/src/config.rs`（修正 — ファイル末尾に追記）

以下の型を config.rs に追記する：

1. **DtmfMethod** enum — Inband / SipInfo / Rfc4733（RFC §20、Clone + Copy + Eq）
2. **Codec** enum — Pcmu / Opus
3. **SrtpPolicy** enum — Disabled / Optional / Mandatory（RFC §30、Clone + Copy + Eq）
4. **AccountTransportPolicy** enum — Default / Prefer(TransportKind) / Only(TransportKind)
5. **AccountCodecPolicy** struct — enable_pcmu / enable_opus / opus: OpusConfig + `default_voice()`（Opus+PCMU 有効）
6. **OpusConfig** struct — bitrate / complexity / cbr / inband_fec / dtx / ptime_ms
7. **DtmfPolicy** struct — send_methods / receive_methods / default_send_method + `all_methods()`
8. **AccountMediaConfig** struct — srtp / ice / vad / ec_tail_ms / input_gain_db / output_gain_db + `Default`（SRTP disabled）
9. **AccountConfig** struct — display_name / username / auth_username / password / domain / registrar_uri / outbound_proxy / contact_params / transport / register_on_start / allow_outbound_without_register / registration_expires / codecs / dtmf / media / headers（RFC §11 全 16 フィールド）
10. **AuthOverride** struct（後続チケット M13-1 の update_config で使用。現時点では最小定義）
11. **AccountConfigPatch** struct — 全フィールド `Option<T>`（update_config 用） + `Default`（全 None）

**設計判断**:
- `AccountTransportPolicy` は `TransportKind` を参照するが、config.rs は既に `pub use crate::transport::TransportKind` を再公開している（M2-1 で `pub use crate::transport::*` で取り込んでいない場合は明示的に追加）
- `AccountConfigPatch` の Default は全フィールド None。利用者は `AccountConfigPatch { username: Some("new".into()), ..Default::default() }` で部分更新
- `AccountMediaConfig` に `Default` 実装（SRTP disabled が §48 既定）。`SrtpPolicy::Disabled`、`ice: true`（PJSIP 標準有効）、`vad: true` 等
- `AuthOverride` は最小定義（空のstructまたは placeholder）。詳細は M13-1 で拡張
- `Codec` enum は現時点では PCMU / Opus のみ。拡張は後続チケットで対応

## Non-scope

- validation rules（空文字列チェック等）— M3-2
- `update_config()` の実際のロジック — M13-1
- コーデックネゴシエーションロジック — M20-1（結合テスト）
- `OpusConfig` の各値の妥当性検証（bitrate 範囲等）— M3-2
- `serde` の Serialize / Deserialize — 後続検討事項

## Test Plan

### ユニットテスト計画（config.rs に追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_dtmf_method_clone_copy_eq` | DtmfMethod が Clone + Copy + PartialEq + Eq |
| 2 | `test_codec_clone_copy_eq` | Codec が Clone + Copy + PartialEq + Eq |
| 3 | `test_srtp_policy_clone_copy_eq` | SrtpPolicy が Clone + Copy + PartialEq + Eq |
| 4 | `test_account_transport_policy_clone` | AccountTransportPolicy が Clone + Debug |
| 5 | `test_account_codec_policy_default_voice` | default_voice() の enable_opus=true, enable_pcmu=true |
| 6 | `test_opus_config_fields` | OpusConfig の各フィールドが正しく設定・取得できる |
| 7 | `test_dtmf_policy_all_methods` | all_methods() が 3 方式すべてを含む |
| 8 | `test_account_media_config_default` | Default で srtp=Disabled, ice=true, vad=true |
| 9 | `test_account_config_fields` | AccountConfig の全フィールドが正しくラウンドトリップ |
| 10 | `test_account_config_password_redacted` | password の Debug 出力が "REDACTED" にマスクされる |
| 11 | `test_account_config_patch_default_all_none` | AccountConfigPatch::default() の全フィールドが None |
| 12 | `test_account_config_patch_partial_update` | 一部フィールドのみ設定した patch が正しく動作 |
| 13 | `test_auth_override_placeholder` | AuthOverride が Clone + Debug |

### ユニットテスト不可能な項目（例外）

- バリデーションルール（空文字列チェック等）— M3-2（設定バリデーション）の結合テストで実施

## Boy Scout Rule — 翻訳可能性計画

- `AccountConfig::password` の doc comment で `SecretString` による Debug マスクを明示
- `AccountCodecPolicy::default_voice()` — 「音声通話向け既定コーデック設定」の意図が関数名から自明
- `DtmfPolicy::all_methods()` — 「全 DTMF 方式を有効にする」が関数名から自明
- `AccountConfigPatch` の Default の意図（「何も変更しない」＝全 None）を doc comment で説明

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存テスト含む）
- [ ] RFC §11 の AccountConfig が全 16 フィールドで定義済み
- [ ] AccountCodecPolicy（+ default_voice()）定義済み
- [ ] OpusConfig 定義済み（6 フィールド）
- [ ] DtmfPolicy（+ all_methods()）定義済み
- [ ] AccountMediaConfig（+ Default）定義済み
- [ ] DtmfMethod（Inband/SipInfo/Rfc4733）定義済み
- [ ] Codec（Pcmu/Opus）定義済み
- [ ] SrtpPolicy（Disabled/Optional/Mandatory）定義済み
- [ ] AccountTransportPolicy（Default/Prefer/Only）定義済み
- [ ] AuthOverride / AccountConfigPatch 定義済み
- [ ] AccountConfig.password の Debug 出力がマスクされること
- [ ] AccountConfigPatch::default() の全フィールドが None であること

## Notes

### ファイル配置

M2-1 で作成した `config.rs` に追記する。新たなモジュール分割は行わず、account 設定型は config.rs 内の後半ブロックとして定義する。将来的にファイルが大きくなった場合のみ `src/config/account.rs` への分割を検討する。

### AuthOverride の取扱い

RFC §8.5 で言及される AuthOverride は、現時点では空の構造体として最小定義する。実際のフィールドは M13-1（`update_config` 実装）で拡張する。これは「定義のみ先行」の意図的設計判断。
