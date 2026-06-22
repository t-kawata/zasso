---
ticket_id: 152
title: Layer 3 結合テスト — Asterisk 結合試験の実証と修正
slug: layer-3-asterisk
status: done
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: |
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0152-layer-3-asterisk/implementation.md
---

# Layer 3 結合テスト — Asterisk 結合試験の実証と修正

## Summary

#150 で実装した統合テストコード（16 tests）を、実際に Docker 上の Asterisk を相手に
実行する。テストの実行結果をもとに、以下の対応を行う：

- テストコードの動作確認とバグ修正
- Asterisk 設定の調整
- EventBus / SipClient / PjsuaBackend の結合時の不具合修正
- テスト結果の記録

## Background

#150 で以下の統合テスト基盤は既に実装・レビュー済みである：

| 成果物 | 状態 |
|--------|------|
| `tests/integration_test.rs` — 単一バイナリエントリポイント | ✅ 実装済み |
| `tests/integration/{register,call,provisional,dtmf,account,media}.rs` — 16 tests | ✅ 実装済み |
| `tests/common/mod.rs` — TestContext / setup / teardown / event 待機 | ✅ 実装済み |
| `tests/docker/docker-compose.yml` — Asterisk コンテナ定義 | ✅ 実装済み |
| `tests/docker/asterisk/{pjsip,extensions,modules}.conf` — Asterisk 設定 | ✅ 実装済み |
| `src/client.rs` — `SipClient::new_with_pjsip()` | ✅ 実装済み |

また #151 により macOS 上で `--features pjsip` のリンクが可能になった。

しかし、これらのテストは**一度も実際に実行されたことがない**。
実際の Asterisk + PJSUA との結合で初めて明らかになる不具合（イベント順序の想定違い、
タイムアウト値の不足、SIP サーバの挙動差異等）を修正するのが本チケットの目的である。

## Scope

### 1. Docker Asterisk の起動確認
- `docker compose -f tests/docker/docker-compose.yml up -d` が成功すること
- Asterisk の PJSIP エンドポイントが正しく設定されていること
- テスト用アカウント（test_user_1, test_user_2）が登録可能であること

### 2. 統合テストの実行と修正
- 全 16 テストを `cargo test -p siprs --features pjsip -- --ignored --test-threads=1` で実行
- 失敗したテストの原因を調査・修正
- 必要に応じてタイムアウト値、アカウント設定、イベントマッチング条件を調整

### 3. バグ修正とテストコード改善
- SIP サーバとの結合で発見されたバグを修正（テストコード側・ライブラリ側の双方）
- 修正内容は最小差分に留め、既存の 392 単体テストに影響を与えないこと
- 翻訳可能性を維持すること

## Non-scope

- **テストの新規追加**: 16 tests でカバーされている範囲を超える新規テストは M20-2 以降で対応
- **CI/CD パイプライン設定**: GitHub Actions の job 定義は本チケットの範囲外
- **FreeSWITCH 結合**: M20-2（Layer 4 相互接続試験）で別途対応

## Investigation

### 証拠 1: 統合テストコードはコンパイル・リンク可能

```bash
$ cargo test --features pjsip -- --ignored --list
account::dual_account_simultaneous_call: test
account::unregister_and_reregister: test
call::call_cancel: test
call::call_normal_hangup: test
call::call_reject: test
call::call_timeout: test
dtmf::dtmf_inband: test
dtmf::dtmf_rfc4733: test
dtmf::dtmf_sip_info: test
media::media_loopback_tap_active: test
media::media_tap_closes_on_hangup: test
provisional::early_media_received: test
provisional::ringing_received: test
register::register_fails_with_wrong_password: test
register::register_succeeds: test
register::reregister_after_unregister: test
```

16 tests が正しく認識されている。

### 証拠 2: 既存の 392 単体テストは全通過

```bash
$ cargo test --lib
392 passed; 0 failed
```

### 証拠 3: Docker Compose / Asterisk 設定は #150 で作成済み

```
tests/docker/docker-compose.yml
tests/docker/asterisk/pjsip.conf     # test_user_1, test_user_2, fail_user
tests/docker/asterisk/extensions.conf # 内線ダイヤル + Echo loopback
tests/docker/asterisk/modules.conf    # 最小限モジュール
```

Asterisk のバージョン: Alpine 3.20 + asterisk, asterisk-pjsip パッケージ

### 証拠 4: テスト実行には Docker Desktop / Docker Engine が必要

macOS 上で Docker Compose を使用する。`docker compose` が利用可能であること。

## Test Plan

本チケットの成果物は「実際に Asterisk に対してテストが通った状態」である。
以下の検証計画で進める：

| # | 検証内容 | 方法 | 成功基準 |
|---|---------|------|---------|
| 1 | Docker Asterisk 起動 | `docker compose -f tests/docker/docker-compose.yml up -d` | コンテナ起動、ヘルスチェック通過 |
| 2 | アカウント登録テスト | `register_succeeds` / `register_fails_with_wrong_password` | RegistrationSucceeded / RegistrationFailed 取得 |
| 3 | 通話テスト | `call_normal_hangup` / `call_cancel` / `call_timeout` | CallConnected → CallDisconnected 等の遷移確認 |
| 4 | Provisional テスト | `ringing_received` / `early_media_received` | 180 Ringing / 183 受信 |
| 5 | DTMF テスト | `dtmf_rfc4733` / `dtmf_sip_info` / `dtmf_inband` | DtmfSent 確認 |
| 6 | アカウントテスト | `unregister_and_reregister` / `dual_account_simultaneous_call` | アカウント状態遷移確認 |
| 7 | メディアテスト | `media_loopback_tap_active` / `media_tap_closes_on_hangup` | AudioChunkPair 受信確認 |
| 8 | 後片付け | `docker compose -f tests/docker/docker-compose.yml down` | コンテナ停止 |

### ユニットテスト不可能な項目（例外）

- 全 16 テスト: Docker 上の実 Asterisk + 実 PJSUA 初期化が必要
- Docker コンテナ管理: OS レベルの操作

## Boy Scout Rule — 翻訳可能性計画

既存のテストコード（#150）は翻訳可能性要件を満たしている。
本チケットで加える修正も同様の基準を維持する。

## Acceptance Criteria

- [ ] Docker Compose で Asterisk が起動し、ヘルスチェックが通過する
- [ ] `cargo test -p siprs --lib` で既存 392 テストが全通過
- [ ] `cargo test -p siprs --features pjsip -- --ignored --test-threads=1` で全 16 テストが PASS する
- [ ] テスト実行後、`docker compose down` でコンテナが正常停止する
- [ ] 修正があった場合、翻訳可能性が維持されている
