---
ticket_id: 156
title: 統合テスト完全実行（Docker Asterisk + 全16テスト）
slug: docker-asterisk-16
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
dependencies: |
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0156-docker-asterisk-16/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0156-docker-asterisk-16/review.md
---

# 統合テスト完全実行（Docker Asterisk + 全16テスト）

## Summary

M20-1.5（#155）までの修正で PjsuaBackend の credential 設定とスレッド登録が
完了した。本チケットではテストコードの再調整と Docker Asterisk に対する
全 16 テストの完全実行を行い、全て PASS することを確認する。

## Background

### 現状のテスト実行結果（#155 完了後、Docker Asterisk 接続）

| テスト | 結果 | 備考 |
|-------|------|------|
| `register::register_succeeds` | ✅ | credential 設定成功 |
| `register::register_fails_with_wrong_password` | ✅ | 誤パスワード検出 |
| `account::dual_account_simultaneous_call` | ✅ | スレッド登録有効（SIGABRT なし） |
| 上記以外の 13 テスト | ⬜ | 未実行または未調整 |

### 未実行の 13 テストの障壁

1. **`register_on_start: false`**: M20-1（#150）時の credential 未対応のワークアラウンド。
   #155 で credential 対応が完了したため `true` に戻す必要がある。
2. **`registration_state()` の `blocking_read()` パニック**: `account()` メソッドが
   `tokio::sync::RwLock::blocking_read()` を使用しており、`#[tokio::test]` 内から呼び出すと
   「Cannot block the current thread from within a runtime」でパニックする。
   これにより `dual_account` テストで `registration_state()` の結果を検査できない。
3. **通話テスト未検証**: `call::call_normal_hangup` 等は INVITE を送信するが、
   現状のテストコードは登録完了を待ってから発信する設計になっており、条件が揃っていない。

### 本チケットのアプローチ

1. PjsuaBackend には手を触れない（#155 で完了）
2. `tests/common/mod.rs` の設定値を適切に調整
3. 各テストファイルのロジックを実態に合わせて修正
4. Docker Asterisk に対して全テストを実行し、PASS/FAIL を確認
5. どうしても PASS しないテストは `eprintln!` 付きでスキップし、理由を明記

## Investigation

### 証拠 1: credential + thread は既に解決済み

```bash
$ cargo test --features pjsip -- --ignored register::register_succeeds --test-threads=1
ok  # ← #155 の修正により 200 OK 受信
$ cargo test --features pjsip -- --ignored account::dual_account_simultaneous_call --test-threads=1
ok  # ← #155 の修正により SIGABRT 解消
```

### 証拠 2: `register_on_start: false` のまま

`tests/common/mod.rs` の account_config ヘルパーでは `register_on_start: false` が設定されており、
#155 の credential 対応後も REGISTER が自動的に行われない。

### 証拠 3: `blocking_read()` が tokio ランタイム内でパニック

`SipClient::account()` は `self.inner.state.blocking_read()` を使用しており、
`#[tokio::test]` の async コンテキストから呼び出すとパニックする。
これは tokio の `RwLock` の仕様によるもので、`SipClient` の公開 API の設計課題である。

## Scope

### 1. `tests/common/mod.rs` の設定調整

- `register_on_start` を `true` に戻す（#155 の credential 対応により REGISTER 成功が可能）
- `allow_outbound_without_register` を `false` に設定（登録後に発信するのが本来の SIP クライアントの動作）

### 2. テストコードの再調整

各テストファイルで以下の対応を行う:

| テストファイル | 修正内容 |
|-------------|---------|
| `register.rs` | `register_succeeds`: 登録待機を復元。`register_fails_with_wrong_password`: 誤パスワードで `RegistrationFailed` を待機 |
| `call.rs` | `call_normal_hangup` / `call_cancel`: 登録待機後に発信。タイムアウト調整。`call_timeout`: 存在しない内線への INVITE で CallDisconnected 待機 |
| `provisional.rs` | `ringing_received`: 登録待機後に発信、Ringing 受信確認 |
| `dtmf.rs` | 各テスト: 登録待機 → 通話確立 → DTMF 送信 → 切断 |
| `account.rs` | `dual_account_simultaneous_call`: `blocking_read()` パニックの回避（async API を使うか、事前の state 確認に変更） |
| `media.rs` | 各テスト: 登録待機 → 通話確立 → AudioTap 購読 → 切断 |

### 3. `blocking_read()` 問題への対応

`SipClient::account()` が `tokio::sync::RwLock::blocking_read()` を使用しているため、
`#[tokio::test]` 内から呼び出すことができない。本チケットでは以下の暫定対応とする:

- `account.rs` の `dual_account_simultaneous_call` では `registration_state()` を呼ばない
- 代わりに `is_shutdown()` でクライアント状態のみ確認する
- SipClient の async API（`async fn account()` 等）の追加は別チケット（M20-2 以降）で対応

## Non-scope

- **SipClient の async API 化**: `account()` 等の非同期対応は別チケット
- **PjsuaBackend の追加実装**: credential + thread 以外の未実装は #155 で完了済み
- **FreeSWITCH 結合**: M20-2（Layer 4 相互接続試験）で別途対応
- **CI/CD パイプライン設定**: GitHub Actions の job 定義は本チケットの範囲外

## Test Plan

本チケットの成果物は「全テストが Docker Asterisk に対して PASS すること」である。
以下の順序で進める:

| # | 手順 | 詳細 |
|---|------|------|
| 1 | `tests/common/mod.rs` 調整 | `register_on_start = true`, `allow_outbound_without_register = false` |
| 2 | テストコード修正 | 各ファイルの登録待機・通話フローを再調整 |
| 3 | Docker Asterisk 起動 | `docker compose -f tests/docker/docker-compose.yml up -d` |
| 4 | 全テスト実行 | `cargo test -p siprs --features pjsip -- --ignored --test-threads=1` |
| 5 | 失敗テスト修正 | 原因特定と修正のサイクル |
| 6 | 最終確認 | 全 16 テスト PASS |
| 7 | 後片付け | `docker compose down` |

### 統合テスト検証計画（16 テストの PASS 基準）

| # | テスト | 成功条件 | 備考 |
|---|--------|---------|------|
| 1 | register::register_succeeds | `RegistrationSucceeded` | |
| 2 | register::register_fails_with_wrong_password | `RegistrationFailed` | |
| 3 | register::reregister_after_unregister | 登録→解除→再登録 | |
| 4 | call::call_normal_hangup | INVITE → BYE → `CallDisconnected` | |
| 5 | call::call_cancel | Ringing → CANCEL | |
| 6 | call::call_timeout | 存在しない内線 → `CallDisconnected` | |
| 7 | call::call_reject | スキップ（プレースホルダー） | `eprintln!` で通知 |
| 8 | provisional::ringing_received | 180 Ringing 受信 | |
| 9 | provisional::early_media_received | スキップ（Asterisk 未対応） | `eprintln!` で通知 |
| 10 | dtmf::dtmf_rfc4733 | `DtmfSent` 発火 | |
| 11 | dtmf::dtmf_sip_info | `DtmfSent` 発火 | |
| 12 | dtmf::dtmf_inband | `DtmfSent` 発火 | |
| 13 | account::unregister_and_reregister | 登録解除・再登録 | blocking_read 回避 |
| 14 | account::dual_account_simultaneous_call | SIGABRT なし + shutdown 成功 | blocking_read 回避 |
| 15 | media::media_loopback_tap_active | AudioTap 購読成功 | |
| 16 | media::media_tap_closes_on_hangup | 切断後 Tap クローズ | |

### ユニットテスト不可能な項目（例外）

- 全 16 テスト: Docker 上の実 Asterisk + PJSIP 初期化が必要

## Boy Scout Rule — 翻訳可能性計画

テストコードは既に翻訳可能性要件を満たしている。本チケットでの修正も同基準を維持する。

## Acceptance Criteria

- [ ] Docker Asterisk が正常起動し、`pjsip show endpoints` で 2 エンドポイント確認
- [ ] `register_on_start = true` で REGISTER 成功する
- [ ] `cargo test -p siprs --lib` で 392 passed（統合テストの修正が既存テストに影響しないこと）
- [ ] `cargo test -p siprs --features pjsip -- --ignored --test-threads=1` で全 16 テストが PASS または理由付きスキップ
- [ ] スキップテストがある場合、理由が `eprintln!` で明記されている
