---
ticket_id: 157
title: PjsuaBackend EventBus 結合と統合テスト安定化
slug: pjsuabackend-eventbus
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
dependencies: |
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0157-pjsuabackend-eventbus/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0157-pjsuabackend-eventbus/review.md
---

# PjsuaBackend EventBus 結合と統合テスト安定化

## Summary

M20-1.6（#156）の実証で明らかになった以下の 2 つの残課題を解決する。

1. **EventBus callback 結合**: PJSIP の registration/call/DTMF callback で生成される
   `NativeEvent` が Reactor に届かず、`SipEventPayload` として EventBus に
   publish されない。すべての callback イベントが Reactor で適切に処理されるようにする。
2. **PJSIP singleton 問題**: 複数の統合テストが同一プロセス内で連続実行されると、
   PJSIP の再初期化で異常が発生する。PjsuaBackend をシングルトン化して解決する。

## Background

### 障壁 1: NativeEvent → Reactor → EventBus の経路が未完成

M17-3（callback bridge）で `ffi/callbacks.rs` の PJSIP callback は `NativeEvent`
への変換と enqueue まで実装されている。しかし、Reactor への送信が **コメントアウト**
されており、EventBus への publish に至っていない。

```rust
// ffi/callbacks.rs:234-238
fn enqueue_native_event(event: NativeEvent) {
    tracing::trace!(?event, "NativeEvent enqueued to reactor");
    // _handle.send(RuntimeCommand::NativeEvent { event, reply });
    // ↑ 送信がコメントアウトされている！
}
```

さらに、`RuntimeCommand` enum に `NativeEvent` バリアントが存在せず、
Reactor のイベントループにも NativeEvent を処理するコードがない。

これにより、以下を含むすべての PJSIP callback イベントが EventBus に
publish されていない：

| Callback | NativeEvent | SipEventPayload |
|----------|------------|-----------------|
| `on_reg_state2` | `RegistrationStateChanged` | `RegistrationSucceeded/Failed` |
| `on_call_state` | `CallStateChanged` | `CallConnected/Disconnected` |
| `on_call_media_state` | `CallMediaStateChanged` | `MediaActive/Stopped` |
| `on_dtmf_digit` | `DtmfDigit` | `DtmfReceived` |
| `on_reg_started` | `RegistrationStarted` | `RegistrationStarted` |

### 障壁 2: PJSIP singleton の複数テスト連続実行

`#[tokio::test(flavor = "multi_thread")]` で各テストが独立した SipClient を
生成するため、2 テスト目以降で PJSIP の再初期化に失敗する。
`pj_thread_register()` の thread_desc もテスト間で失われる。

## Investigation

### 証拠 1: enqueue_native_event の送信がコメントアウト

```rust
// ffi/callbacks.rs:234
fn enqueue_native_event(event: NativeEvent) {
    tracing::trace!(?event, "NativeEvent enqueued to reactor");
    // _handle.send(RuntimeCommand::NativeEvent { event, reply });
    // ^-- この行がコメントアウトされている
}
```

`_handle` も `RuntimeHandle` 型だが、callback からは static なグローバル変数として
アクセスする設計になっている。グローバル変数の設定は `set_runtime_handle()` で
行われているが、send がコメントアウトされている。

### 証拠 2: RuntimeCommand に NativeEvent バリアントが存在しない

```bash
$ grep -n "NativeEvent" src/runtime/command.rs
# 出力なし
```

### 証拠 3: Reactor イベントループに NativeEvent 処理がない

```bash
$ grep -n "NativeEvent\|RegStateChanged" src/runtime/reactor.rs
# NativeEvent 関連の実装なし（コメントのみ）
```

### 証拠 4: PJSIP callback からのイベント送信は traced だけで discard

```bash
$ cargo test --features pjsip -- --ignored register::register_succeeds
# PJSIP が 200 OK を受信しているのに RegistrationSucceeded は EventBus に届かない
```

## Scope

### 1. RuntimeCommand に NativeEvent バリアント追加

- `src/runtime/command.rs` に `NativeEvent { event: crate::ffi::callbacks::NativeEvent }` を追加
- 適切な Reply 型（`oneshot::Sender<Result<(), SipError>>` または単方向）

### 2. enqueue_native_event の送信を有効化

- `ffi/callbacks.rs` の `enqueue_native_event()` でコメントアウトされていた
  `_handle.send()` を復活
- グローバルな `RUNTIME_HANDLE`（`Mutex<Option<RuntimeHandle>>`）の設定が
  `set_runtime_handle()` で正しく行われていることを確認

### 3. Reactor に NativeEvent ハンドラを追加

- Reactor のイベントループ（`reactor.rs`）に `NativeEvent` を処理する
  マッチングアームを追加
- 各 NativeEvent を対応する `SipEventPayload` に変換して EventBus に publish:
  - `RegistrationStateChanged { acc_id }` → PJSIP API で状態を取得し
    `RegistrationSucceeded` / `RegistrationFailed` を publish
  - `RegistrationStarted { acc_id }` → `RegistrationStarted` を publish
  - `CallStateChanged { call_id, state }` → Call state に応じて
    `CallConnected` / `CallDisconnected` / `CallCancelled` 等を publish
  - `DtmfDigit { call_id, digit }` → `DtmfReceived` を publish
  - `CallMediaStateChanged { call_id }` → `MediaActive` / `MediaStopped` を publish

### 4. PjsuaBackend シングルトン化

- `OnceLock<PjsuaBackend>` または `Mutex<Option<PjsuaBackend>>` で
  `PjsuaBackend` をプロセス単位で単一インスタンス化
- `SipClient::new_with_pjsip()` は既存のインスタンスを再利用
- `thread_desc` の `Box::leak` は不要になるので元の `Box<[...]>` に戻す
- 注意: unsafe impl Send/Sync は維持

### 5. 全 16 テスト最終実行確認

- Docker Asterisk 起動後、全テストを連続実行
- `cargo test -p siprs --features pjsip -- --ignored --test-threads=1`
- 各テストのイベント受信を確認

## Non-scope

- **SipClient の async API 化**: account() の blocking_read 問題は別チケット
- **FreeSWITCH 結合**: M20-2（Layer 4 相互接続試験）で別途対応
- **CI/CD パイプライン**: 別チケット

## Test Plan

### 検証計画

| # | 検証 | 方法 | 成功基準 |
|---|------|------|---------|
| 1 | NativeEvent → Reactor 結合 | cargo check --features pjsip | コンパイル成功 |
| 2 | RegistrationSucceeded | register::register_succeeds | 200 OK → RegistrationSucceeded |
| 3 | RegistrationFailed | register::register_fails_with_wrong_password | 誤パスワード → RegistrationFailed |
| 4 | 登録解除 | register::reregister_after_unregister | 再登録成功 |
| 5 | 通話 | call::call_normal_hangup | CallConnected → CallDisconnected |
| 6 | CANCEL | call::call_cancel | CallDisconnected |
| 7 | Ringing | provisional::ringing_received | 180 Ringing 受信 |
| 8-10 | DTMF | dtmf::* 3 tests | DtmfSent 発火 |
| 11 | 2アカウント | account::dual_account_simultaneous_call | SIGABRT なし |
| 12-13 | AudioTap | media::* 2 tests | 購読・切断正常 |
| 14 | 全テスト連続 | --ignored --test-threads=1 | 全 PASS（スキップ許容） |
| 15 | 既存回帰 | cargo test --lib | 392 passed |

### ユニットテスト不可能な項目（例外）
- 全統合テスト: Docker Asterisk + PJSIP 初期化が必要

## Boy Scout Rule — 翻訳可能性計画

- NativeEvent → SipEventPayload 変換は match の各アームにコメントで対応関係を明示
- `// SAFETY:` コメントは unsafe ブロックに必須
- callback bridge の復活する `send()` は tracing ログ付き

## Acceptance Criteria

- [ ] `enqueue_native_event` の send が有効化され、RuntimeCommand::NativeEvent が Reactor に届く
- [ ] Reactor が NativeEvent を SipEventPayload に変換して EventBus に publish する
- [ ] `cargo test --lib` で 392 passed
- [ ] PjsuaBackend がシングルトン化され、複数テスト連続実行で SIGABRT が発生しない
- [ ] Docker Asterisk 起動後、全 16 テストが PASS または理由付きスキップ
