# RFC02: siprs M20 Augmentation — 実装設計書

> **位置づけ**: RFC01（`docs/rust-sip-client-rfc.md`）に対する M20 追補の実装設計書。
> RFC01 と RFC02 を併せて読むことで、siprs crate の完全な設計が把握できる。
> 本ドキュメント単体でも実装着手に十分な情報を提供する。

**作成日**: 2026-06-22
**Grill セッション**: 14質問 / 3パス / 18設計判断確定
**DesignTree**: 18ノード全 resolved
**CheckList**: 約70項目カバー

---

## 目次

- [1. 実装優先度マップ](#1-実装優先度マップ)
- [2. NativeEvent → SipEventPayload 変換マッピング](#2-nativeevent--sipeventpayload-変換マッピング)
- [3. RegistrationStateChanged: RuntimeCommand パターン](#3-registrationstatechanged-runtimecommand-パターン)
- [4. DTMF イベント設計: DtmfSent と二段構え](#4-dtmf-イベント設計-dtmfsent-と二段構え)
- [5. SubscribeAudio Reactor ハンドラ実装](#5-subscribeaudio-reactor-ハンドラ実装)
- [6. PjsuaBackend メソッド完全化](#6-pjsuabackend-メソッド完全化)
- [7. 状態同期とロック戦略](#7-状態同期とロック戦略)
- [8. Dual Client アーキテクチャ](#8-dual-client-アーキテクチャ)
- [9. Shutdown ポリシー拡張](#9-shutdown-ポリシー拡張)
- [10. テスト戦略補強](#10-テスト戦略補強)
- [11. CI/CD 環境整備](#11-cicd-環境整備)

---

## 1. 実装優先度マップ

| 優先度 | 実装項目 | 設計判断 | 既存コード影響範囲 |
|--------|---------|---------|------------------|
| **P0** | NativeEvent → SipEventPayload 変換（Registration/Call/DTMF系） | Q1:A | `runtime/reactor.rs` — `process_native_event()` |
| **P0** | RegistrationStateChanged の RuntimeCommand::GetAccountInfo | Q8:B | `runtime/reactor.rs` + RuntimeCommand enum |
| **P0** | DtmfSentInfo 構造体定義と DtmfSent 発火実装 | Q2:A, Q14:A | `event.rs` + `runtime/reactor.rs` |
| **P0** | `account()` / `registration_state()` の `blocking_read` → `read().await` 修正 | Q3:A | `client.rs` + `account.rs` |
| **P1** | SubscribeAudio Reactor ハンドラ実装（conf_connect 経路） | Q2:A, Q5:B, Q10:B | `runtime/reactor.rs` + `backend/pjsua.rs` |
| **P1** | RuntimeCommand::ConfConnect / ConfDisconnect 新設 | Q3:A, Q5:B, Q11:B | RuntimeCommand enum + `runtime/reactor.rs` |
| **P1** | configure_codecs auto モード（Opus=255, PCMU=254） | Q7 | `backend/pjsua.rs` — `configure_codecs()` |
| **P1** | CallStateChanged 全 pjsip_inv_state 対応 | Q1:A | `runtime/reactor.rs` — CallState 変換 |
| **P1** | CallMediaStateChanged → MediaActive/Held/Error 変換 | Q1:A | `runtime/reactor.rs` — media_status 判定 |
| **P2** | Shutdown 中 command 振り分け（GetAccountInfo 許可） | Q12:C | `runtime/reactor.rs` — `dispatch_command()` |
| **P2** | EventBus 分割 + account_id ベース routing（Dual Client 基盤） | Q9:A | `runtime/reactor.rs` + `event.rs` |
| **P2** | Transport/ICE 系 NativeEvent 変換（重要度P1） | Q1:A | `runtime/reactor.rs` |
| **P2** | Dual Client TestContext utility | Q6:A | `tests/` |
| **P3** | Docker Integration Test Job (GitHub Actions) | Q4:A | `.github/workflows/` |
| **P3** | Prebuilt Refresh Pipeline | Q4:A | `.github/workflows/` + `vendor/prebuilt/` |

---

## 2. NativeEvent → SipEventPayload 変換マッピング

**該当セクション**: RFC01 §15（Event model）
**設計判断**: Q1:A（全イベント完全実装）

### 2.1 重要度定義

| 重要度 | 対象イベント | 理由 |
|--------|------------|------|
| **P0** | RegistrationStateChanged, RegistrationStarted, CallStateChanged, CallMediaStateChanged, DtmfDigit | 統合テスト成立に必須 |
| **P1** | TransportStateChanged, IceTransportError | 運用観測・障害検知 |
| **P2** | CallTsxStateChanged, CallRedirected, CallTransferStatus, CallReplaced, NatDetected | 補完的情報（対象外、理由あり） |

### 2.2 マッピングテーブル（擬似実装）

```rust
fn convert_native_event_to_payload(event: NativeEvent, backend: &dyn SipBackend) -> Option<SipEventPayload> {
    match event {
        // === P0: Registration系 ===
        NativeEvent::RegistrationStateChanged { acc_id } => {
            // RuntimeCommand::GetAccountInfo を発行し、PjsuaBackend 経由で
            // pjsua_acc_get_info() の結果を取得する（詳細は §3）
            None // 実際の変換は GetAccountInfo 完了後に行う
        }
        NativeEvent::RegistrationStarted { acc_id, renew } => {
            Some(SipEventPayload::RegistrationStarted(
                RegistrationInfo { account_id: AccountId::from(acc_id), renew, .. }
            ))
        }

        // === P0: Call系 ===
        NativeEvent::CallStateChanged { call_id, state } => {
            convert_call_state(call_id, state)
        }
        NativeEvent::CallMediaStateChanged { call_id } => {
            convert_call_media_state(call_id)
        }

        // === P0: DTMF系 ===
        NativeEvent::DtmfDigit { call_id, digit } => {
            Some(SipEventPayload::DtmfReceived(
                DtmfReceivedInfo { digit, method: DtmfMethod::Rfc4733, duration_ms: None, volume_dbm0: None }
            ))
        }

        // === P1: Transport/ICE系 ===
        NativeEvent::TransportStateChanged { transport_id, state } => {
            // P0完了後に実装: transport state → TransportConnected/Disconnected/Error
            None
        }
        NativeEvent::IceTransportError { .. } => {
            // P0完了後に実装: ICE failure → IceNegotiationFailed
            None
        }

        // === P2: 対象外イベント ===
        NativeEvent::CallTsxStateChanged { .. }
        | NativeEvent::CallRedirected { .. }
        | NativeEvent::CallTransferStatus { .. }
        | NativeEvent::CallReplaced { .. }
        | NativeEvent::NatDetected { .. } => {
            // 対象外: PJSIP 内部トランザクション詳細であり、
            // siprs 公開 API の粒度より詳細すぎる。
            // 必要な場合は RawSIP バス（subscribe_raw_sip()）経由で取得可能。
            None
        }
    }
}
```

### 2.3 CallStateChanged: pjsip_inv_state マッピング

| pjsip_inv_state | 値 | 変換先 CallState | 備考 |
|----------------|-----|-----------------|------|
| `PJSIP_INV_STATE_NULL` | 0 | None（イベント発行なし） | 初期状態 |
| `PJSIP_INV_STATE_CALLING` | 1 | `Calling` | 発信側のみ |
| `PJSIP_INV_STATE_CONNECTING` | 2 | `Trying` / `Ringing` | 遷移元 CALLING→Trying, INCOMING→Ringing |
| `PJSIP_INV_STATE_CONFIRMED` | 3 | `Active` | CallConnected |
| `PJSIP_INV_STATE_DISCONNECTED` | 4 | `Disconnecting` → `Disconnected` | 切断 |

```rust
fn convert_call_state(call_id: CallId, state: pjsip_inv_state) -> Option<SipEventPayload> {
    match state {
        PJSIP_INV_STATE_NULL => None,
        PJSIP_INV_STATE_CALLING => Some(SipEventPayload::OutgoingCallStarted(/* ... */)),
        PJSIP_INV_STATE_CONNECTING => {
            // 実際の判定は Reactor の通話状態機械が保持する previous_state を用いる
            None
        }
        PJSIP_INV_STATE_CONFIRMED => Some(SipEventPayload::CallConnected(/* ... */)),
        PJSIP_INV_STATE_DISCONNECTED => Some(SipEventPayload::CallDisconnected(/* ... */)),
    }
}
```

### 2.4 CallMediaStateChanged: media_status 判定

| pjsua_call_media_status | 変換先 | 
|------------------------|--------|
| `PJSUA_CALL_MEDIA_NONE` | （発行なし） |
| `PJSUA_CALL_MEDIA_ACTIVE` | `MediaActive(MediaActiveInfo)` |
| `PJSUA_CALL_MEDIA_LOCAL_HOLD` | `CallHeld` |
| `PJSUA_CALL_MEDIA_REMOTE_HOLD` | `CallHeld` |
| `PJSUA_CALL_MEDIA_ERROR` | `MediaError(MediaErrorInfo)` |

```rust
fn convert_call_media_state(call_id: CallId) -> Option<SipEventPayload> {
    let info = pjsua_call_get_info(call_id);
    match info.media_status {
        PJSUA_CALL_MEDIA_ACTIVE => Some(SipEventPayload::MediaActive(MediaActiveInfo { call_id })),
        PJSUA_CALL_MEDIA_LOCAL_HOLD | PJSUA_CALL_MEDIA_REMOTE_HOLD => {
            Some(SipEventPayload::CallHeld)
        }
        PJSUA_CALL_MEDIA_ERROR => Some(SipEventPayload::MediaError(MediaErrorInfo { call_id })),
        _ => None,
    }
}
```

---

## 3. RegistrationStateChanged: RuntimeCommand パターン

**該当セクション**: RFC01 §15（Event model — RegistrationStateChanged 変換）
**設計判断**: Q8:B（RuntimeCommand 経由）

### 3.1 処理フロー

```
PJSIP callback: on_reg_state2()
  → NativeEvent::RegistrationStateChanged { acc_id }
  → Reactor::process_native_event()
  → RuntimeCommand::GetAccountInfo { native_acc_id, reply_tx }
  → Reactor が GetAccountInfo を command queue にエンキュー
  → Reactor::process_command_queue() が GetAccountInfo を処理
  → PjsuaBackend::get_account_info(native_acc_id) を呼び出し
  → pjsua_acc_get_info() で registration status を取得
  → 結果を reply_tx で Reactor に返却
  → Reactor が RegistrationSucceeded / RegistrationFailed を EventBus に publish
```

### 3.2 RuntimeCommand 定義

```rust
// RuntimeCommand enum に追加
RuntimeCommand::GetAccountInfo {
    native_acc_id: pjsua_acc_id,
    reply_tx: oneshot::Sender<Result<AccountInfoSnapshot, SipError>>,
}
```

### 3.3 AccountInfoSnapshot 構造体

```rust
/// pjsua_acc_get_info() の結果を格納する snapshot 構造体。
#[derive(Debug, Clone)]
pub struct AccountInfoSnapshot {
    pub acc_id: AccountId,
    pub registration_status: pjsip_status_code,
    pub registration_expires: Option<u32>,  // 秒。0=期限切れ
    pub online_status: bool,
    pub uri: String,
}
```

### 3.4 設計理由

- PJSIP API（`pjsua_acc_get_info`）は PJSIP worker thread コンテキストから安全に呼び出せる
- callback bridge → Reactor の経路は PJSIP thread 上で動作するため直接呼び出しは可能だが、責務分離の観点から RuntimeCommand 経由を選ぶ
- RuntimeCommand 経由にすることで MockBackend によるテストが可能になる

---

## 4. DTMF イベント設計: DtmfSent と二段構え

**該当セクション**: RFC01 §20（DTMF spec）
**設計判断**: Q2:A（二段構え）, Q14:A（タイムアウトフォールバック）

### 4.1 DtmfSentInfo 構造体

```rust
/// DTMF 送出試行の結果を表す。DtmfReceivedInfo（相手受信時）とは異なり、
/// 送出側の試行結果（成功/失敗とエラー詳細）を伝える。
#[derive(Debug, Clone)]
pub struct DtmfSentInfo {
    pub method: DtmfMethod,
    pub digit: char,
    /// 送出試行の成否
    pub status: Result<(), SentDtmfError>,
    /// PJSIP 内部エラーコード（status=Err の場合のみ有効）
    pub pjsip_status: Option<pj_status_t>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SentDtmfError {
    /// PJSIP 内部エラー（pj_status_t 変換後）
    PjsipError(pj_status_t),
    /// タイムアウト（PJSIP callback 応答なし）
    Timeout,
}
```

### 4.2 戻り値とイベントの分離

| シグナル | 意味 | 保証 |
|---------|------|------|
| `send_dtmf()` の戻り値 `Ok(())` | RuntimeCommand::SendDtmf が Reactor の command queue に受理された。PJSIP の `pjsua_call_dial_dtmf()` が呼び出された | 同期的に確認可能 |
| `DtmfSent` イベント | PJSIP が DTMF データを実際に送出した（callback 経由）、またはタイムアウトにより送出試行完了とみなした | 非同期で通知 |

```rust
// SipBackend::send_dtmf — 戻り値は「PJSIP コマンド受理」を意味する
fn send_dtmf(&mut self, native_call_id: pjsua_call_id, method: &DtmfMethod, digits: &str) -> Result<(), SipError> {
    let pj_status = unsafe { ffi::pjsua_call_dial_dtmf(native_call_id, c_str) };
    if pj_status != ffi::PJ_SUCCESS {
        return Err(/* pj_status → SipError 変換 */);
    }
    // ここで DtmfSent を発火するわけではない。
    // 実際の DTMF 送出完了は PJSIP callback またはタイマーで検出する
    Ok(())
}
```

### 4.3 DtmfSent 発火条件（優先順位）

1. **PJSIP callback 経由（最優先）**: `on_dtmf_digit` callback が送信完了時にも呼ばれるかを確認。呼ばれる場合はその callback から DtmfSent を発火する。
2. **タイムアウトベース（fallback）**: PJSIP callback 不在時、RuntimeCommand::SendDtmf 実行から **500ms** 経過後に DtmfSent を自動発行。タイムアウト値は `DtmfConfig::sent_timeout_ms` として ClientConfig から設定可能。

```rust
// Reactor の SendDtmf ハンドラ内でタイマーを設定する
fn handle_send_dtmf(&mut self, cmd: RuntimeCommand::SendDtmf) {
    let native_call_id = self.resolve_native_call_id(cmd.call_id);

    // PJSIP API 呼び出し
    let result = self.backend.send_dtmf(native_call_id, &cmd.method, &cmd.digits);

    // 戻り値で即時応答（コマンド受理）
    let _ = cmd.reply_tx.send(result.map_err(|e| e.into()));

    // 非同期 DtmfSent 発火のためのタイマー設定
    let timeout = self.config.dtmf.sent_timeout_ms.unwrap_or(500);
    let event_bus = self.events.clone();
    let call_id = cmd.call_id;
    self.spawn_timer(timeout, move || {
        event_bus.publish(SipEvent {
            meta: EventMeta { call_id: Some(call_id), .. },
            payload: SipEventPayload::DtmfSent(DtmfSentInfo {
                method: cmd.method,
                digit: cmd.digits.chars().next().unwrap_or('\0'),
                status: Ok(()),
                pjsip_status: None,
            }),
        });
    });
}
```

---

## 5. SubscribeAudio Reactor ハンドラ実装

**該当セクション**: RFC01 §22（音声購読API）
**設計判断**: Q2:A（conf_connect 経路）, Q5:B（CallId + MediaDirection 抽象化）

### 5.1 MediaDirection enum（新規定義）

```rust
/// メディアストリームの方向。ConfConnect で接続するポートを指定する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaDirection {
    /// 着信音声（相手→自分）の conf_port に接続
    Inbound,
    /// 発信音声（自分→相手）の conf_port に接続
    Outbound,
    /// 双方向（IN/OUT 両方）に接続。AudioTap の標準的な設定
    Both,
}
```

### 5.2 処理フロー

```
SipClient::subscribe_audio(call_id, format, capacity, mode)
  → RuntimeCommand::SubscribeAudio { call_id, format, capacity, mode, reply_tx }
  → Reactor::process_command_queue()
  → Reactor が CallId → native_call_id を解決
  → RuntimeCommand::ConfConnect { call_id, media_direction: Both, reply_tx }
  → PjsuaBackend::conf_connect(source, sink) で conference port 接続
  → AudioChunkPair の stream を作成
  → AudioTapHandle { rx: mpsc::Receiver<AudioChunkPair> } を生成
  → reply_tx で AudioTapHandle を SipClient に返却
```

### 5.3 ハンドラ擬似実装

```rust
fn handle_subscribe_audio(&mut self, cmd: RuntimeCommand::SubscribeAudio) {
    // 1. CallId → native_call_id の解決
    let native_call_id = match self.state.calls.get(&cmd.call_id) {
        Some(entry) => entry.native_id,
        None => {
            let _ = cmd.reply_tx.send(Err(SipError::not_found("call not found")));
            return;
        }
    };

    // 2. conf_port の解決と接続（PjsuaBackend が conf_port_id を解決）
    let conf_result = self.backend.conf_connect_media(native_call_id, MediaDirection::Both);

    // 3. AudioChunkPair stream と AudioTapHandle の生成
    let (tx, rx) = tokio::sync::mpsc::channel::<AudioChunkPair>(cmd.capacity);
    let handle = AudioTapHandle { rx };

    // 4. conf_port → AudioChunkPair 変換ループ起動（通話切断時に自動停止）
    self.spawn_audio_tap_task(native_call_id, tx, cmd.format, cmd.mode);

    // 5. 呼び出し元に AudioTapHandle を返却
    let _ = cmd.reply_tx.send(Ok(handle));
}
```

### 5.4 AudioTapMode と conf_connect の連携

| AudioTapMode | conf_connect 動作 | AudioTapHandle のチャネル挙動 |
|-------------|-------------------|------------------------------|
| `Realtime`（既定） | 通常の conf_connect。AudioWorkerTask の process_frame とは独立 | oldest-drop。満杯時は最新ペア優先 + `MediaError(AudioTapOverflow)` |
| `Lossless` | conf_connect + AudioWorkerTask 送信キューでバックプレッシャー | 満杯時は送信側ブロック。capacity を十分大きく設定すること |

---

## 6. PjsuaBackend メソッド完全化

**該当セクション**: RFC01 §27a（SipBackend trait）, §29（codec policy）
**設計判断**: Q3:A（RuntimeCommand 新設）, Q5:B（CallId 抽象化）, Q7（codec 2層）, Q10:B（conf_port 内部管理）, Q11:B（既存 error variant 兼用）

### 6.1 RuntimeCommand::ConfConnect / ConfDisconnect

```rust
RuntimeCommand::ConfConnect {
    call_id: CallId,
    media_direction: MediaDirection,
    reply_tx: oneshot::Sender<Result<(), SipError>>,
}

RuntimeCommand::ConfDisconnect {
    call_id: CallId,
    media_direction: MediaDirection,
    reply_tx: oneshot::Sender<Result<(), SipError>>,
}
```

### 6.2 conf_port_id 解決（PjsuaBackend 内部）

```rust
impl PjsuaBackend {
    fn resolve_conf_port(&self, native_call_id: pjsua_call_id) -> Result<pjsua_conf_port_id, SipError> {
        let mut info = unsafe { std::mem::zeroed::<ffi::pjsua_call_info>() };
        let status = unsafe { ffi::pjsua_call_get_info(native_call_id, &mut info) };
        if status != ffi::PJ_SUCCESS {
            return Err(SipError::invalid_state(
                format!("failed to get call info for native_call_id={}", native_call_id)
            ));
        }
        Ok(info.conf_slot)
    }
}
```

### 6.3 エラー設計（既存バリアント兼用）

| RuntimeCommand | 失敗条件 | SipErrorKind |
|---------------|---------|-------------|
| `ConfConnect` | conf_port 未解決 | `InvalidState` |
| `ConfConnect` | PJSIP conf_connect API エラー | `InternalError` |
| `ConfDisconnect` | conf_port 未解決 | `InvalidState` |
| `ConfDisconnect` | PJSIP conf_disconnect API エラー | `InternalError` |
| `GetAccountInfo` | 指定 AccountId が存在しない | `NotFound` |
| `GetAccountInfo` | PJSIP API エラー | `InternalError` |

```rust
fn convert_conf_connect_error(pj_status: pj_status_t, call_id: CallId) -> SipError {
    if pj_status == PJ_SUCCESS {
        return Ok(());
    }
    if pj_status == PJ_EINVALIDOP {
        return Err(SipError::invalid_state(
            format!("ConfConnect: conf_port not resolved for call {call_id}")
        ));
    }
    Err(SipError::internal_error(
        format!("ConfConnect failed: pjsua_conf_connect returned {pj_status}")
    ))
}
```

### 6.4 configure_codecs auto モード

```rust
fn configure_codecs(&mut self) -> Result<(), SipError> {
    let codec_info = self.enumerate_codecs()?;
    for info in &codec_info {
        let priority: u8 = match info.codec_id.as_str() {
            "PCMU/8000/1" => 254,   // Opus 非対応環境用フォールバック
            id if id.starts_with("opus/") => 255,  // 最優先
            _ => 0,  // 無効化
        };
        let pj_status = unsafe {
            ffi::pjsua_codec_set_priority(info.as_raw_ptr(), priority as ffi::pj_uint8_t)
        };
        if pj_status != ffi::PJ_SUCCESS {
            return Err(SipError::internal_error(
                format!("failed to set codec priority for {}", info.codec_id)
            ));
        }
    }
    Ok(())
}
```

### 6.5 2層コーデックポリシー

```text
利用者の明示指定（CallMediaPreferences::preferred_codecs に1件以上指定）
  → preferred_codecs の先頭から順に SDP offer/answer で試行
  → 全滅時は MediaNegotiationFailed

auto モード（preferred_codecs が空または未指定）
  → 設定値: Opus=255, PCMU=254, その他=0（無効）
  → Opus を最優先、Opus 非対応相手には PCMU にフォールバック
```

```rust
pub struct CallMediaPreferences {
    /// 空の場合は auto モード（Opus→PCMU の既定フォールバック）
    /// 1件以上指定された場合は明示指定モード
    pub preferred_codecs: Vec<Codec>,
    // ...
}
```

---

## 7. 状態同期とロック戦略

**該当セクション**: RFC01 §33（Runtime internal state）
**設計判断**: Q3:A（tokio RwLock 維持）, Q10:B（conf_port 内部管理）

### 7.1 Client 側: `read().await` 絶対義務

コードベースから `blocking_read()` の使用を完全に排除する。全 query API は `tokio::sync::RwLock::read().await`（非ブロッキング）を使用する。

```rust
// ✅ 正しい: read().await（非ブロッキング）
impl SipClient {
    pub async fn account(&self, account_id: AccountId) -> Result<SipAccountHandle, SipError> {
        let state = self.inner.state.read().await;  // read().await, NOT blocking_read()
        // ...
    }
}
```

**影響を受ける既存コード**:
- `SipClient::account()` — `ClientState` 読み取り
- `SipAccountHandle::registration_state()` — `RegistrationState` 読み取り
- その他全 `blocking_read()` / `blocking_write()` 使用箇所

### 7.2 Reactor 側: `write().await`

Reactor は ClientState の更新を `write().await` で行う。Reactor の command processing は単一タスクで逐次実行されるため、書き込み競合は発生しない。

### 7.3 conf_port_id: PjsuaBackend 内部管理の責務分離

```
Runtime の責務: CallId → native_call_id の解決（既存の BTreeMap）
PjsuaBackend の責務: native_call_id → conf_port_id の解決（pjsua_call_get_info）
```

- CallEntry に conf_port_id フィールドを追加しない
- conf_port_id のライフサイクルは PjsuaBackend 内部で完結
- SipBackend 差し替え時に conf_port_id の概念を隠蔽できる

---

## 8. Dual Client アーキテクチャ

**該当セクション**: RFC01 §27（PJSIP FFI — callback bridge routing）
**設計判断**: Q6:A（Singleton 共有）, Q9:A（単一 Reactor + EventBus 分割）

### 8.1 アーキテクチャ

```text
PJSIP callback (on_incoming_call, etc.)
  → runtime::global_runtime() で単一 Reactor を取得（既存設計維持）
  → Reactor::enqueue_native_event(NativeEvent)（既存設計維持）
  → Reactor::process_native_event() → SipEventPayload 変換
  → EventBus::publish() 前に account_id ベースの EventBus 振り分け
```

### 8.2 EventBus 振り分けロジック

```rust
fn dispatch_event(&self, event: SipEvent) {
    let account_id = event.meta.account_id;
    match account_id {
        Some(aid) => {
            if let Some(client_bus) = self.client_event_buses.get(&aid) {
                client_bus.publish(event);
            } else {
                self.default_event_bus.publish(event);
            }
        }
        None => {
            self.default_event_bus.publish(event);
            for bus in self.client_event_buses.values() {
                bus.publish(event.clone());
            }
        }
    }
}
```

### 8.3 設計原則

- `global_runtime()` は変更せず単一 Reactor を維持する
- EventBus は SipClient ごとに個別インスタンスを持つ
- Reactor が `account_id` ベースで振り分ける
- デフォルト EventBus は最初に生成された SipClient のものを使用する

### 8.4 Dual Client 初期化パターン

```rust
let client_a = SipClient::new(config_a).await?;
// → Reactor + デフォルト EventBus 生成 + PjsuaBackend singleton 格納

let client_b = SipClient::new(config_b).await?;
// → 既存 PjsuaBackend singleton 共有 + Reactor に client_b 用 EventBus 追加登録

let handle_a = client_a.add_account(account_a).await?;
let handle_b = client_b.add_account(account_b).await?;
```

---

## 9. Shutdown ポリシー拡張

**該当セクション**: RFC01 §32（Shutdown）
**設計判断**: Q12:C（GetAccountInfo 許可、conf_connect/disconnect 拒否）

| RuntimeCommand | Shutdown 中の挙動 | 理由 |
|---------------|------------------|------|
| `GetAccountInfo` | **許可** | 状態確認（読み取り専用）。応答に shutdown 進行中フラグを含める |
| `ConfConnect` | **拒否**（`Err(InvalidState)`） | メディアリソース変更。shutdown 中に新規接続は無意味 |
| `ConfDisconnect` | **拒否**（`Err(InvalidState)`） | 切断処理は既存 media drain に委ねる |

```rust
fn dispatch_command(&mut self, cmd: RuntimeCommand) {
    if self.is_shutting_down {
        match &cmd {
            RuntimeCommand::GetAccountInfo { .. } => {
                self.execute_get_account_info(cmd);  // 許可
            }
            RuntimeCommand::ConfConnect { .. } | RuntimeCommand::ConfDisconnect { .. } => {
                Self::reject_command(cmd, SipError::invalid_state("shutting down"));
            }
            _ => {
                Self::reject_command(cmd, SipError::invalid_state("shutting down"));
            }
        }
        return;
    }
    // 通常の command dispatching
}
```

---

## 10. テスト戦略補強

**該当セクション**: RFC01 §43（Test strategy）
**設計判断**: Q13:B（既存 §43 に追記）

### 10.1 新機能テスト層マッピング

| M20 新機能 | テスト層 | 検証内容 |
|-----------|---------|---------|
| NativeEvent → SipEventPayload 変換 | Layer 2 (MockBackend) | 各 NativeEvent の正しい変換 |
| RegistrationStateChanged | Layer 2 (+ Layer 3) | GetAccountInfo → RegistrationSucceeded/Failed |
| CallStateChanged 全 state | Layer 2 (MockBackend) | pjsip_inv_state 0-4 全対応 |
| CallMediaStateChanged | Layer 2 (MockBackend) | media_status → MediaActive/Held/Error |
| DtmfSent 二段構え | Layer 2 (+ Layer 3) | 戻り値 vs イベント分離 |
| SubscribeAudio conf_connect | Layer 3 (SIP Integration) | Docker Asterisk 必須 |
| conf_connect/disconnect | Layer 3 (SIP Integration) | media loopback |
| configure_codecs auto | Layer 2 (MockBackend) | priority 設定確認 |
| Dual Client | Layer 3 (SIP Integration) | 発着信双方向 |
| low-priority NativeEvent | Layer 2 (MockBackend) | None 返却確認 |

### 10.2 プレースホルダーテスト解決条件

| テスト | 現状 | 解決条件 | 前提 |
|-------|------|---------|------|
| `call::call_reject` | eprintln! スキップ | Dual Client utility で着信応答検証 | Q6:A, Q9:A |
| `provisional::early_media_received` | eprintln! スキップ | SIPp スクリプトで 183 Session Progress 送信 | SIPp 用意 |
| `register::reregister_after_unregister` | 一部未検証 | `blocking_read` → `read().await` 修正後 | Q3:A |

### 10.3 Dual Client テスト utility

```rust
/// 双方向テスト用の TestContext（2 Client 版）
struct DualClientContext {
    client_a: SipClient,
    client_b: SipClient,
    account_a: SipAccountHandle,
    account_b: SipAccountHandle,
}

impl DualClientContext {
    async fn new(config_a: ClientConfig, config_b: ClientConfig) -> Result<Self, SipError> {
        let client_a = SipClient::new(config_a).await?;
        let client_b = SipClient::new(config_b).await?;
        let account_a = client_a.add_account(account_config_a).await?;
        let account_b = client_b.add_account(account_config_b).await?;
        Ok(Self { client_a, client_b, account_a, account_b })
    }

    async fn call_a_to_b(&self) -> CallId {
        self.account_a.make_call(OutgoingCallRequest {
            target_uri: self.account_b.config().sip_uri(),
            // ...
        }).await.unwrap()
    }
}
```

---

## 11. CI/CD 環境整備

**該当セクション**: RFC01 §44（CI/CD）
**設計判断**: Q4:A（Docker/CI/prebuilt 追記）

### 11.1 Docker Integration Test Job（GitHub Actions）

```yaml
integration-test:
  runs-on: ubuntu-22.04
  services:
    asterisk:
      image: asterisk:20.6.0
      ports:
        - 5060:5060/udp
        - 5061:5061/tcp
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
    - name: Build with pjsip
      run: cargo build --features pjsip
    - name: Run integration tests
      run: cargo test --features pjsip --test integration_test
      env:
        SIP_SERVER: localhost
        SIP_PORT: 5060
```

### 11.2 Prebuilt Refresh Pipeline（macOS）

```yaml
prebuilt-refresh:
  runs-on: macos-14
  steps:
    - uses: actions/checkout@v4
    - name: Build PJSIP prebuilt
      run: |
        cd vendor/pjsip
        mkdir -p build && cd build
        cmake .. \
          -DCMAKE_BUILD_TYPE=Release \
          -DSRTP_WITH_OPENSSL=OFF \
          -DPJ_BUILD_SHARED_LIBS=OFF
        make -j$(sysctl -n hw.ncpu)
        make install
    - name: Upload prebuilt artifacts
      uses: actions/upload-artifact@v4
      with:
        name: pjsip-prebuilt-macos
        path: vendor/prebuilt/macos/
```

**source build fallback**: prebuilt が利用できない環境では `build.rs` が自動的に source build へフォールバックする（既存設計維持）。prebuilt 提供は CI pipeline として自動化し、手動ビルド手順（`vendor/prebuilt/BUILD.md`）は補助的ドキュメントとする。

---

## 付録A: 設計判断一覧（Grill 18決定）

| ID | 決定内容 |
|----|---------|
| Q1:A | 全 NativeEvent → SipEventPayload を完全実装（P0/P1/P2 優先度付き） |
| Q2:A | DTMF 二段構え（戻り値=コマンド受理、DtmfSent=送出完了） |
| Q2:A | SubscribeAudio は conf_connect 標準経路で実装 |
| Q3:A | tokio RwLock 維持 + `read().await` 徹底 + blocking_read 禁止 |
| Q3:A | RuntimeCommand::ConfConnect / ConfDisconnect 新設 |
| Q3:A | configure_codecs 実装詳細を RFC に追記 |
| Q4:A | テストプレースホルダー解決条件を RFC に明記 |
| Q4:A | Docker/CI/prebuilt 自動化の設計を RFC に追記 |
| Q5:B | conf_connect RuntimeCommand 引数は CallId + MediaDirection で抽象化 |
| Q6:A | Dual Client: 同一 PjsuaBackend singleton を複数 Client で共有 |
| Q7 | codec: 明示指定が基本。auto 時のみ Opus=255, PCMU=254 |
| Q8:B | RegistrationStateChanged は RuntimeCommand::GetAccountInfo 経由 |
| Q9:A | Dual Client routing: 単一 Reactor + EventBus 分割（global_runtime 維持） |
| Q10:B | conf_port_id 管理: PjsuaBackend 内部で解決（Runtime は CallId のみ意識） |
| Q11:B | 新 RuntimeCommand のエラーは既存バリアント（InvalidState/NotFound/InternalError）で兼用 |
| Q12:C | Shutdown 中: GetAccountInfo 許可、conf_connect/disconnect 拒否 |
| Q13:B | 新機能テスト層マッピングは既存 §43 に追記 |
| Q14:A | DtmfSent: PJSIP callback 不在時は 500ms タイムアウトベースで発火 |

## 付録B: 既存RFC修正箇所

RFC01 の以下の記述は M20 追補により変更された:

| 箇所 | 変更内容 |
|------|---------|
| §29 `configure_codecs()` コードブロック | PCMU=255, Opus=254 → **PCMU=254, Opus=255** |
| §29 フォールバックルール | 変更なし（既に Opus 最優先と記述されていた） |
