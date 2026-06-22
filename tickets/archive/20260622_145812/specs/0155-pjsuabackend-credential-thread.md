---
ticket_id: 155
title: PjsuaBackend 結合障壁除去（credential + thread）
slug: pjsuabackend-credential-thread
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
dependencies: |
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0155-pjsuabackend-credential-thread/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0155-pjsuabackend-credential-thread/review.md
---

# PjsuaBackend 結合障壁除去（credential + thread）

## Summary

PjsuaBackend の以下の 2 つの障壁を除去し、統合テスト 16 件が実際の SIP サーバ
（Asterisk）に対して実行可能な状態にする。

1. **credential 対応**: `pjsua_acc_config.cred_info` に認証情報を設定し、REGISTER 認証を成功させる
2. **スレッド登録**: `pj_thread_register()` で reactor スレッドを PJSIP に登録し、外部スレッドからの API 呼び出しを安全にする

## Background

M20-1（#150, #152）で実装した統合テスト 16 件は、実際の Asterisk に対して以下の理由で失敗する。

### 障壁 1: credential 未設定

`PjsuaBackend::add_account()` では `acc_cfg.cred_count = 0` に設定されており、
認証情報が一切 PJSIP に渡されていない。コメントには「cred_info は opaque なため設定不可」
とあるが、**実際には opaque ではない**。bindgen が生成する `pjsip_cred_info` 構造体は
以下のフィールドを全て公開している：

```
// pjsip_bindings.rs:6834
pub struct pjsip_cred_info {
    pub realm: pj_str_t,        // 認証レルム（空文字で任意の realm に対応）
    pub scheme: pj_str_t,       // "Digest"
    pub username: pj_str_t,     // SIP ユーザー名
    pub data_type: c_int,       // 0 = PLAIN_PASSWD
    pub data: pj_str_t,         // パスワード
    pub algorithm_type: pjsip_auth_algorithm_type,  // MD5
    // ...
}
```

また `pjsua_acc_config.cred_info` は `*mut pjsip_cred_info` であり、
`cred_count` は `u32` として正しく生成されている。

したがって、`pjsua_acc_config` の初期化後に `cred_info` 配列を割り当て、`cred_count`
を設定すれば認証が機能する。

### 障壁 2: 外部スレッド未登録

`PjsuaBackend` の reactor スレッドは PJSIP にスレッドとして登録されていない。
`SipAccountHandle::registration_state()` 等が reactor 経由で PJSIP API
（`pjsua_acc_get_info()`）を呼び出す際、PJSIP 内部で
`pj_thread_this()` がアサーション失敗（SIGABRT）を起こす。

`pjsua_create()` 後に `pj_thread_register()` を呼び出すことで、
現在のスレッドを PJSIP に認識させ、安全に API を呼び出せるようになる。

## Investigation

### 証拠 1: pjsip_cred_info は opaque ではない

```bash
$ grep -n "pjsip_cred_info" target/debug/build/siprs-*/out/pjsip_bindings.rs
6834:pub struct pjsip_cred_info {
- 全フィールド公開。opaque ではない
```

### 証拠 2: cred_count = 0 で認証失敗（401）

```bash
$ cargo test --features pjsip -- --ignored register::register_succeeds
PJSIP ログ:
  Unable to set auth: can not find credential for asterisk/Digest MD5
  SIP registration error: No suitable credential (PJSIP_ENOCREDENTIAL)
  RX 401 Unauthorized
```

### 証拠 3: 外部スレッドからの PJSUA API 呼び出しで SIGABRT

```bash
$ cargo test --features pjsip -- --ignored --test-threads=1
SIGABRT: Assertion failed: (!"Calling pjlib from unknown/external thread...")
  in account::dual_account_simultaneous_call at registration_state()
```

### 証拠 4: pj_thread_register の API 利用可能

`pj_thread_register` および `pj_thread_desc` 型は bindgen で生成されている。

## Scope

### 1. PjsuaBackend credential 対応

`PjsuaBackend::add_account()` の `unsafe` ブロック内で以下を実装:

1. `pjsip_cred_info` を 1 要素分確保
2. `cred_info[0]` の各フィールドを `AccountConfig` から設定:
   - `realm` → 空文字列（任意の realm にマッチ）
   - `scheme` → `"Digest"`
   - `username` → `config.username`
   - `data_type` → `0`（`PJSIP_CRED_DATA_PLAIN_PASSWD`）
   - `data` → `config.password`（`SecretString` から一時的に露出）
   - `algorithm_type` → `PJSIP_AUTH_ALGORITHM_NOT_SET`（0、チャレンジの realm から自動選択）
3. `acc_cfg.cred_info` に上記 `cred_info` へのポインタを設定
4. `acc_cfg.cred_count` を `1` に設定
5. `SecretString` の露出時間を最小化

### 2. PJSIP 外部スレッド登録

`PjsuaBackend::initialize()` に以下を追加:

1. `PjsuaBackend` 構造体に `thread_desc: Option<Box<pj_thread_desc>>` フィールド追加
2. `pjsua_create()` 成功直後に `pj_thread_register("siprs-reactor", ...)` を呼び出し
3. 戻り値が null でないことを確認
4. 記述子の寿命管理: 構造体フィールドで保持する

## Non-scope

- **複数スレッド対応**: reactor スレッド 1 つのみを登録対象とする
- **M20-1.6（全テスト実行）**: 本チケット完了後に別チケットで実施
- **その他の PjsuaBackend 未実装箇所**: credential とスレッド以外は別チケット

## Test Plan

### 検証計画

| # | 検証内容 | 方法 | 成功基準 |
|---|---------|------|---------|
| 1 | コンパイル確認 | `cargo check -p siprs --features pjsip` | 成功 |
| 2 | 既存テスト回帰 | `cargo test -p siprs --lib` | 392 passed |
| 3 | REGISTER 認証成功 | `cargo test ... register::register_succeeds` | RegistrationSucceeded |
| 4 | REGISTER 認証失敗 | `cargo test ... register::register_fails_with_wrong_password` | RegistrationFailed |
| 5 | スレッド安全 | `cargo test ... account::dual_account_simultaneous_call` | SIGABRT なし |

### ユニットテスト不可能な項目（例外）

- 全統合テストケース: 実 SIP サーバ（Docker Asterisk）+ PJSIP 初期化が必要
- pj_thread_register: PJSIP コンテキストでのみ検証可能

## Boy Scout Rule — 翻訳可能性計画

- credential 設定コードは `// SAFETY:` コメントで不変条件を説明
- SecretString 露出は最小範囲に留め、コピー後に即座にゼロ化
- ハードコード値には定数またはコメントで意味を明示

## Acceptance Criteria

- [ ] `cargo check -p siprs --features pjsip` 成功
- [ ] `cargo test -p siprs --lib` 392 passed
- [ ] pjsip_cred_info の全フィールド設定、REGISTER 認証が通る
- [ ] registration_state() を reactor 外部から呼び出しても SIGABRT 発生しない
- [ ] Docker Asterisk 起動後、以下が PASS:
  - register::register_succeeds
  - register::register_fails_with_wrong_password
  - call::call_timeout
