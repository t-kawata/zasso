# 実装サマリ: M20-1 Layer 3 結合テスト — ローカルSIPサーバ + Docker（Asterisk）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 修正 | dev-dependencies に `ctor` 追加、tokio に `time` feature 追加 |
| src/client.rs | 修正 | `SipClient::new_with_pjsip()` 追加（結合テスト用公開コンストラクタ）。既存 `new()` の cfg gate を `any(test, feature = "pjsip")` に拡張 |
| tests/common/mod.rs | 新規 | TestContext、setup/teardown、アカウント設定ヘルパー、イベント待機ヘルパー |
| tests/docker/docker-compose.yml | 新規 | Asterisk コンテナ定義（SIP 5060/udp, 5060/tcp） |
| tests/docker/asterisk/pjsip.conf | 新規 | PJSIP エンドポイント（test_user_1, test_user_2, fail_user） |
| tests/docker/asterisk/extensions.conf | 新規 | 内線間ダイヤル + Echo（media loopback） |
| tests/docker/asterisk/modules.conf | 新規 | 最小限モジュール設定 |
| tests/integration/register.rs | 新規 | REGISTER 結合テスト（3 tests） |
| tests/integration/call.rs | 新規 | INVITE/BYE 結合テスト（4 tests） |
| tests/integration/provisional.rs | 新規 | Provisional 応答テスト（2 tests） |
| tests/integration/dtmf.rs | 新規 | DTMF 結合テスト（3 tests） |
| tests/integration/account.rs | 新規 | アカウント結合テスト（2 tests） |
| tests/integration/media.rs | 新規 | メディアループバックテスト（2 tests） |
| tests/integration_test.rs | 新規 | 単一エントリポイント（#[path] でサブモジュール集約） |

## 検証結果

| コマンド | 結果 | 備考 |
|---------|------|------|
| `cargo check --features pjsip` | ✅ | 警告なし |
| `cargo test --lib` | ✅ 392 passed | 既存テスト全通過 |
| `cargo check`（default features） | ✅ | 警告なし |

## 既知の問題

- **OpenSSL リンク（macOS）**: 統合テストバイナリのリンクに OpenSSL（`-lssl -lcrypto`）が必要。build.rs の `emit_platform_link_directives()` が macOS で OpenSSL をリンクしていない。`cargo check` および library test は問題なく動作するが、`--features pjsip` での統合テストバイナリのリンクに失敗する。
  - 対応: build.rs で macOS 時も OpenSSL をリンクするよう修正が必要
  - テストコードの構造とコンパイル自体は正常に確認済み

## 統合テスト構成（16 tests, 全 `#[ignore]`）

- register: register_succeeds / register_fails_with_wrong_password / reregister_after_unregister
- call: call_normal_hangup / call_cancel / call_timeout / call_reject(skip)
- provisional: ringing_received / early_media_received
- dtmf: dtmf_rfc4733 / dtmf_sip_info / dtmf_inband
- account: unregister_and_reregister / dual_account_simultaneous_call
- media: media_loopback_tap_active / media_tap_closes_on_hangup
