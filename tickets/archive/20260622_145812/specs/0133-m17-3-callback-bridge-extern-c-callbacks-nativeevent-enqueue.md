---
ticket_id: 133
title: "M17-3: Callback bridge — extern C callbacks → NativeEvent enqueue"
slug: m17-3-callback-bridge-extern-c-callbacks-nativeevent-enqueue
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0133-m17-3-callback-bridge-extern-c-callbacks-nativeevent-enqueue/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0133-m17-3-callback-bridge-extern-c-callbacks-nativeevent-enqueue/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0133-m17-3-callback-bridge-extern-c-callbacks-nativeevent-enqueue/review.md
---

# M17-3: Callback bridge — extern "C" callbacks → NativeEvent enqueue

## Summary

PJSIP の C callback 群を Rust の reactor モデルに接続する橋渡し層を実装する。
各 callback は最小限の処理（`NativeEvent` enum への変換と reactor への enqueue）のみを行い、
状態変更やブロッキング操作は一切行わない。`catch_unwind` でパニックを捕捉し、
§46.1 の 4 ステップクリーンアップ手順を実装する。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§27.3, §45.1, §46.1)

## Background

### なぜ必要か

PJSIP は非同期イベントを C の関数ポインタ（callback）で通知する。siprs の上位層は
Tokio ベースの非同期モデルで動作するため、以下の変換層が必要である：

1. **extern "C" → Rust クロージャ**: PJSIP の C ABI callback を Rust の安全な型に変換
2. **callback → NativeEvent → RuntimeCommand**: callback の最小限の情報を
   reactor が処理可能な内部イベントに変換
3. **パニック安全性**: C callback 内での Rust パニックが未定義動作を引き起こさないよう
   `catch_unwind` で保護
4. **グローバルアクセス**: PJSIP callback はコンテキストポインタを持たないため、
   グローバルな `RuntimeHandle` アクセス機構が必要

### RFC 準拠

| 条項 | 内容 |
|------|------|
| §27.3 | callback 内では Rust object への直接 mutable access を避け、軽量イベントを enqueue する |
| §45.1 | 「callback では enqueue のみ、状態遷移は reactor」 |
| §46.1 | `catch_unwind` 発火時の 4 ステップクリーンアップ手順 |

### 設計判断

1. **NativeEvent を pub(crate) 内部型とする**: 外部公開は `SipEventPayload` で行い、
   `NativeEvent` は callback → reactor 間の内部プロトコルに限定する。

2. **pjsua_callback の手動定義**: bindgen が PJSIP ヘッダ不在で生成できないため、
   PJSIP 2.17 の `pjsua_callback` 構造体と同一レイアウトの型を手動定義する。
   後日 bindgen 生成時に `static_assertions` で一致確認する。

3. **OnceLock によるグローバル RuntimeHandle**: PJSIP callback はコンテキストポインタを
   取らないため、グローバルな `std::sync::OnceLock<RuntimeHandle>` で reactor ハンドルを
   保持する。Reactor 起動時に `set()` し、shutdown 時に `take()` する。

4. **catch_unwind + 4 ステップクリーンアップ**: 全 callback を `catch_unwind` でラップする。
   パニック発生時は §46.1 の手順（Stopping 遷移 → 非同期クリーンアップ → リーク許容 →
   事後通知）を実行する。

5. **MockBackend との連携**: PJSIP がない環境でもテスト可能にするため、MockBackend でも
   `NativeEvent` をエミュレートできるようにする（テスト時のみ）。

## Investigation

### 証拠 1: NativeEvent 型が存在しない

`grep -rn "NativeEvent" crates/siprs/src/` → 0 hits

- `NativeEvent` 型の定義は存在しない。新規作成が必要。

### 証拠 2: グローバルランタイムアクセスが存在しない

- `runtime/handle.rs` の `RuntimeHandle` は local な `mpsc::UnboundedSender` のみ保持。
- グローバルな `OnceLock` / `LazyLock` / `lazy_static` は使用されていない。
- `client.rs` の `block_on()` はランタイムを都度作成する helper 関数。

### 証拠 3: EventBus は準備完了

**ファイル:** `crates/siprs/src/event.rs:592`

```rust
pub struct EventBus {
    control: broadcast::Sender<SipEvent>,
    raw_sip: Option<broadcast::Sender<RawSipMessage>>,
}
```

- `publish(event: SipEvent)` でイベント配信可能。
- `subscribe_control()` で購読可能。

### 証拠 4: SipErrorKind::InternalInvariantBroken は準備完了

**ファイル:** `crates/siprs/src/error.rs`

```rust
InternalInvariantBroken,  // retryable: false
```

- `SipError::invariant_broken(msg)` コンストラクタあり。
- パニック発生時のエラー通知に使用可能。

### 証拠 5: ClientState に native_id フィールドが準備済み

**ファイル:** `crates/siprs/src/runtime/state.rs`

```rust
pub(crate) struct AccountEntry {
    pub native_id: Option<i32>,
    // ...
}
pub(crate) struct CallEntry {
    pub native_id: Option<i32>,
    // ...
}
```

- callback から受け取った `pjsua_acc_id` / `pjsua_call_id`（C 側の int ID）を
  `RuntimeId` にマッピングする設計が既に組み込まれている。

### 証拠 6: CoreReactor は Initialize / Shutdown のみ処理

**ファイル:** `crates/siprs/src/runtime/reactor.rs`

```rust
match command {
    RuntimeCommand::Initialize { .. } => { ... }
    RuntimeCommand::Shutdown { .. } => { ... }
    _ => reject_command(...),
}
```

- 他の 16 のコマンドは `reject_command` で拒否される（PJSIP 未接続のため）。

### 証拠 7: pjsua_callback 構造体

- bindgen が生成した場合、`ffi::bindings::pjsua_callback` として利用可能。
- PJSIP 2.17 では `pjsua_callback` は約 20 個の関数ポインタフィールドを持つ構造体。
- bindgen 未生成のため手動定義が必要。

## Scope

### 新規ファイル

#### 1. `crates/siprs/src/ffi/callbacks.rs` — Callback bridge 実装

**NativeEvent enum** — callback → reactor 間の内部イベント型：

```rust
/// PJSIP callback から reactor への内部イベント。
///
/// 各 variant は対応する PJSIP callback の引数から変換される最小情報のみを保持する。
/// この enum は pub(crate) であり、外部公開は SipEventPayload が担当する。
#[derive(Debug, Clone)]
pub(crate) enum NativeEvent {
    // --- Call events ---
    IncomingCall { acc_id: i32, call_id: i32 },
    CallStateChanged { call_id: i32, state: u32 },
    CallMediaStateChanged { call_id: i32 },
    CallTsxStateChanged { call_id: i32 },
    CallRedirected { call_id: i32 },
    CallTransferStatus { call_id: i32, status_code: i32 },
    CallReplaced { old_call_id: i32, new_call_id: i32 },

    // --- Registration events ---
    RegistrationStateChanged { acc_id: i32 },
    RegistrationStarted { acc_id: i32, renew: bool },

    // --- DTMF events ---
    DtmfDigit { call_id: i32, digit: i32 },
    DtmfDigit2 { call_id: i32, digit: i32, method: u32 },

    // --- Transport events ---
    TransportStateChanged { tp_id: i32, state: u32 },

    // --- ICE events ---
    IceTransportError { call_id: i32, status: i32 },

    // --- NAT events ---
    NatDetected { info: String },
}
```

**グローバルランタイムアクセス:**

```rust
use std::sync::OnceLock;

static GLOBAL_RUNTIME: OnceLock<RuntimeHandle> = OnceLock::new();

/// グローバルな RuntimeHandle を設定する（Reactor 起動時に呼ぶ）。
pub(crate) fn set_global_runtime(handle: RuntimeHandle) -> Result<(), SipError>;

/// グローバルな RuntimeHandle を取得する。
pub(crate) fn global_runtime() -> Option<&'static RuntimeHandle>;
```

**catch_unwind ヘルパー:**

```rust
/// PJSIP callback を catch_unwind で保護して実行する。
///
/// §46.1 パニック発生時:
/// 1. InternalInvariantBroken エラーを control バスに emit
/// 2. 該当エンティティを Stopping 状態に遷移
/// 3. 非同期クリーンアップをキューイング
/// 4. 事後通知
pub(crate) fn catch_callback_panic<F, R>(callback_name: &str, f: F) -> Option<R>
where
    F: FnOnce() -> R + std::panic::UnwindSafe;
```

**callback 関数群（extern "C"）:**

```rust
pub(crate) mod pjsip_callbacks {
    use super::*;

    pub extern "C" fn on_incoming_call(
        acc_id: i32, call_id: i32, rdata: *mut std::ffi::c_void,
    ) {
        catch_callback_panic("on_incoming_call", || {
            enqueue_native_event(NativeEvent::IncomingCall { acc_id, call_id });
        });
    }

    pub extern "C" fn on_call_state(call_id: i32, event: *mut std::ffi::c_void) {
        catch_callback_panic("on_call_state", || {
            let state = /* extract from event */;
            enqueue_native_event(NativeEvent::CallStateChanged { call_id, state });
        });
    }

    // ... 他の callback も同様パターン
}

/// NativeEvent を reactor に enqueue する。
fn enqueue_native_event(event: NativeEvent) {
    if let Some(handle) = global_runtime() {
        // 軽量イベントとして RuntimeCommand に変換して送信
        // 現状は tracing::trace で計装のみ
        tracing::trace!(?event, "NativeEvent enqueued");
    }
}
```

**register_callbacks 関数:**

```rust
/// pjsua_callback 構造体に関数ポインタを設定する。
///
/// すべての callback を extern "C" 関数ポインタとして pjsua_callback に代入する。
pub(crate) fn register_callbacks(callback: &mut PjsuaCallback) {
    callback.on_incoming_call = Some(pjsip_callbacks::on_incoming_call);
    callback.on_call_state = Some(pjsip_callbacks::on_call_state);
    // ... 全 callback を同様に設定
}
```

**PjsuaCallback 構造体（手動定義）:**

```rust
/// PJSIP 2.17 pjsua_callback の手動定義。
///
/// bindgen 生成が可能になった時点で static_assertions により一致確認する。
#[repr(C)]
pub(crate) struct PjsuaCallback {
    pub on_call_state: Option<extern "C" fn(i32, *mut std::ffi::c_void)>,
    pub on_incoming_call: Option<extern "C" fn(i32, i32, *mut std::ffi::c_void)>,
    pub on_call_media_state: Option<extern "C" fn(i32)>,
    pub on_reg_state: Option<extern "C" fn(i32)>,
    pub on_reg_started: Option<extern "C" fn(i32, i32)>,
    pub on_dtmf_digit: Option<extern "C" fn(i32, i32)>,
    pub on_call_tsx_state: Option<extern "C" fn(i32, *mut std::ffi::c_void, *mut std::ffi::c_void)>,
    pub on_call_redirected: Option<extern "C" fn(i32, *mut std::ffi::c_void)>,
    pub on_call_transfer_status: Option<extern "C" fn(i32, i32, *mut std::ffi::c_void)>,
    pub on_call_replaced: Option<extern "C" fn(i32, i32)>,
    pub on_dtmf_digit2: Option<extern "C" fn(i32, i32, u32)>,
    pub on_transport_state: Option<extern "C" fn(i32, u32, *mut std::ffi::c_void)>,
    pub on_ice_transport_error: Option<extern "C" fn(i32, *mut std::ffi::c_void)>,
    pub on_nat_detect: Option<extern "C" fn(*mut std::ffi::c_void)>,
    // 必要に応じて追加フィールド
}
```

### 既存ファイル変更

#### 2. `crates/siprs/src/ffi/mod.rs` — callbacks サブモジュール追加

```rust
pub mod strings;
pub mod callbacks;  // 追加
```

#### 3. `crates/siprs/src/runtime/reactor.rs` — グローバルランタイム登録

`CoreReactor::spawn()` 内で callback bridge のグローバルランタイムを設定：

```rust
pub(crate) fn spawn(
    backend: Box<dyn SipBackend>,
    events: EventBus,
    state: Arc<RwLock<ClientState>>,
    shutdown_rx: watch::Receiver<bool>,
) -> (RuntimeHandle, JoinHandle<()>) {
    let (handle, rx) = RuntimeHandle::new();

    // M17-3: グローバルランタイムを設定（callback からのアクセス用）
    crate::ffi::callbacks::set_global_runtime(handle.clone())
        .expect("global runtime already set");

    // ...
}
```

#### 4. `crates/siprs/src/event.rs` — callback ブリッジ用のエントリポイント追加

`SipEventPayload` に必要に応じて `Error(InternalInvariantBroken)` の送出パスを確認する（既存）。

### 詳細設計: §46.1 4 ステップクリーンアップ

```rust
struct PanicCleanupContext {
    acc_id: Option<i32>,
    call_id: Option<i32>,
}
```

1. **即時 stopping**: `SipError::invariant_broken(...)` を生成し、`EventBus` の control チャネルに `SipEventPayload::Error(...)` として emit。
2. **非同期クリーアップ**: reactor 経由でクリーンアップコマンド（`Hangup` / 該当 API のクリーンアップ）をキューイング。
3. **リソースリークの許容**: リーク範囲を該当 call/account に限定。他通話への影響を防止。
4. **事後通知**: `CallDisconnected` または相当する終了イベントを emit。

## Non-scope

- **PjsuaBackend 全体**: M17-4 のスコープ。本チケットは callback bridge の骨格のみ。
- **SipBackend への native_id 通知**: callback から受け取った native_id を
  `ClientState` に反映する処理（M17-4 で実装）。
- **SipEventPayload への変換**: `NativeEvent` → `SipEventPayload` のマッピングは
  reactor 内で行う（M17-4 のスコープ）。
- **全 callback の完全実装**: MVP として主要 callback（on_incoming_call, on_call_state,
  on_reg_state）を優先し、残余はスタブとして残す。
- **bindgen 生成の pjsua_callback との統合**: bindgen 利用可能時に別チケットで対応。

## Test Plan

### ユニットテスト計画

テストは `ffi/callbacks.rs` 内の `#[cfg(test)]` モジュールに実装する。

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_native_event_debug_clone` | 正常 | NativeEvent の全 variant が Debug + Clone |
| 2 | `test_catch_callback_panic_normal` | 正常 | 正常終了時に catch_callback_panic が Ok を返す |
| 3 | `test_catch_callback_panic_caught` | 異常 | panic! → catch_unwind で捕捉され None が返る |
| 4 | `test_register_callbacks_full` | 正常 | register_callbacks 後に全フィールドが Some |
| 5 | `test_register_callbacks_on_incoming_call` | 正常 | 特定 callback が正しい extern "C" シグネチャ |
| 6 | `test_global_runtime_set_and_get` | 正常 | set_global_runtime → global_runtime で取得可能 |
| 7 | `test_global_runtime_double_set` | 異常 | 2回目の set_global_runtime が Err を返す |
| 8 | `test_enqueue_native_event_no_runtime` | 境界 | global_runtime 未設定時に enqueue が panic しない |
| 9 | `test_pjsua_callback_layout` | 正常 | PjsuaCallback のサイズとアライメントが期待値と一致 |

### ユニットテスト不可能な項目（例外）

| # | 項目 | 理由 |
|---|------|------|
| 1 | 実際の PJSIP callback 発火 | PJSIP ライブラリとの結合が必要。M20-1 で検証 |
| 2 | §46.1 4 ステップクリーンアップの完全検証 | MockBackend 経由での結合テストが必要。M17-4 完了後 |
| 3 | bindgen 生成 pjsua_callback とのレイアウト一致 | PJSIP ヘッダ不在のため。M19-1 完了後 |

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **`ffi/callbacks.rs`（新規作成）**:
   - 各 callback 関数は `on_incoming_call`, `on_call_state` 等、PJSIP の命名をそのまま使用。
     C callback であるため「動詞句であること」の基準は緩和する。
   - `catch_callback_panic()` は責務を明確に単一の処理ブロックに分割。
   - `PjsuaCallback` 構造体の各フィールドは、PJSIP の `pjsua_callback` と同一の
     フィールド名を使用する（FFI 境界での混乱防止）。

2. **`runtime/reactor.rs` のスコープ外改善**:
   - `reject_command` のログメッセージに未実装の旨を明記（現状 `todo!()` に近い）。
     本チケットでは変更しない（M17-4 のスコープ）。

## Acceptance Criteria

- [ ] `make check-be` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS
- [ ] `NativeEvent` enum が全 callback 対応 variant を持つこと（Debug + Clone 導出）
- [ ] `catch_callback_panic()` が正常時は `Some(result)`、パニック時は `None` を返すこと
- [ ] `global_runtime()` が未設定時に panic しないこと
- [ ] `set_global_runtime()` の二重呼び出しが Err を返すこと
- [ ] `register_callbacks()` 後に `PjsuaCallback` の全フィールドが `Some` であること
- [ ] `PjsuaCallback` のレイアウトとアライメントが期待値と一致すること
- [ ] 9 つのユニットテストが全て PASS すること
- [ ] `cargo fmt --check` 通過
- [ ] 翻訳可能性: 関数名が動詞句、変数名がドメイン概念であること

## Notes

### M17-4 との連携

```text
M17-3 (#133) ──→ NativeEvent, global_runtime, catch_callback_panic, register_callbacks
                     │
                     ↓
M17-4         ──→ PjsuaBackend で NativeEvent → SipEventPayload 変換 + reactor 連携
```

M17-3 は callback bridge の骨格（NativeEvent, catch_unwind, global_runtime,
register_callbacks）を提供する。実際の callback 発火時の SipEventPayload 変換と
reactor への通知は M17-4 で実装する。

### STUB 対応

本チケットで解決可能な既存スタブはない（全フェーズ7 以前のスタブ）。

### 不完全 callback 関数について

`on_nat_detect` 等の情報構造体へのポインタを引数に取る callback は、完全な
パラメータ変換を行うために PJSIP の型情報が必要となる。これらの callback は
現段階では引数の一部を `*mut c_void` で受け取るスタブとし、M17-4 で
bindgen 生成型に基づいて具体化する。
