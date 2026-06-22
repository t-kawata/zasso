---
ticket_id: 191
title: NativeEvent → SipEventPayload 変換完全化（P0-P1）
slug: nativeevent-sipeventpayload-p0-p1
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme/shyme/zasso/tickets/context/0191-nativeevent-sipeventpayload-p0-p1/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0191-nativeevent-sipeventpayload-p0-p1/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0191-nativeevent-sipeventpayload-p0-p1/review.md
---

# NativeEvent → SipEventPayload 変換完全化（P0-P1）

## Summary

M17-3 で定義した `NativeEvent` enum を `SipEventPayload` に変換する `process_native_event()`（reactor 内 `RuntimeCommand::NativeEvent` の処理ロジック）を完全実装する。RFC02 §2.2 のマッピングテーブルに従い、P0（Registration・Call・DTMF 系）を最優先で実装し、P1（Transport・ICE 系）を続ける。併せて Info 構造体に必要なフィールドを追加し、`DtmfSent` タイマー管理を `SendDtmf` ハンドラに実装する。

## Background

現在の reactor （`reactor.rs:433-460`）における `RuntimeCommand::NativeEvent` の処理は以下の問題を抱える仮実装（スタブ）であり、M17-3 完了後の次工程として本実装が必要：

1. **RegistrationStateChanged → None**: GetAccountInfo を発行せず常に None を返している。RFC02 §3 フローでは GetAccountInfo 発行後に RegistrationSucceeded/RegistrationFailed を publish する必要がある。
2. **CallStateChanged のマッピング誤り**: state=1（CALLING）を CallDisconnected に変換している（正しくは OutgoingCallStarted）。全 5 状態（NULL/CALLING/CONNECTING/CONFIRMED/DISCONNECTED）の正しいマッピングが必要。
3. **CallMediaStateChanged 未実装**: `_ => None` で丸ごと未実装。ACTIVE/LOCAL_HOLD/REMOTE_HOLD/ERROR の 4 状態に対応する変換が必要。
4. **DtmfDigit の Info 構造体が空**: `DtmfReceivedInfo {}` に digit/method フィールドがなく、コールバックから渡された情報が欠落する。
5. **DtmfSent 未実装**: 戻り値とイベントの二段構え（RFC02 §4.2）が未着手。SendDtmf ハンドラ内でタイマー管理が必要。
6. **Info 構造体が全体的に空**: 全 Info 構造体が `{}` で、必要なフィールドが定義されていない。
7. **Transport/ICE 未実装**: `_ => None` で丸ごと未実装（P1 スコープ）。

## Scope

### P0 — Registration 系

- `RegistrationStateChanged { acc_id }` → `RuntimeCommand::GetAccountInfo` 発行 → 結果に応じて `RegistrationSucceeded` または `RegistrationFailed` を EventBus publish するフローを実装
- `RegistrationStarted { acc_id, renew }` → `RegistrationStarted(RegistrationInfo)` に変換
- `RegistrationInfo` 構造体にフィールド追加: `acc_id: AccountId`, `renew: bool`, `status_code: Option<u16>`, `reason: Option<String>`
- `RegistrationFailure` 構造体にフィールド追加: `acc_id: AccountId`, `status_code: u16`, `reason: String`, `is_expired: bool`

### P0 — Call 系

- `CallStateChanged { call_id, state }` → `convert_call_state()`（RFC02 §2.3）:

  | Native state | 値 | 変換後 SipEventPayload |
  |---|---|---|
  | PJSIP_INV_STATE_NULL | 0 | None（発行なし） |
  | PJSIP_INV_STATE_CALLING | 1 | `OutgoingCallStarted(OutgoingCallInfo)` |
  | PJSIP_INV_STATE_CONNECTING | 2 | 前状態が CALLING → `OutgoingCallTrying(ProvisionalInfo)`, 前状態が INCOMING → `IncomingCall(IncomingCallInfo)` → `OutgoingCallRinging(ProvisionalInfo)` |
  | PJSIP_INV_STATE_CONFIRMED | 3 | `CallConnected(ConnectedCallInfo)` |
  | PJSIP_INV_STATE_DISCONNECTED | 4 | `CallDisconnected(DisconnectInfo)` |

- `CallMediaStateChanged { call_id }` → `convert_call_media_state()`（RFC02 §2.4）:

  | Media state | 変換後 SipEventPayload |
  |---|---|
  | PJSUA_CALL_MEDIA_NONE | None |
  | PJSUA_CALL_MEDIA_ACTIVE | `MediaActive(MediaActiveInfo)` |
  | PJSUA_CALL_MEDIA_LOCAL_HOLD | `CallHeld(())` |
  | PJSUA_CALL_MEDIA_REMOTE_HOLD | `CallHeld(())` |
  | PJSUA_CALL_MEDIA_ERROR | `MediaError(MediaErrorInfo)` |

- Info 構造体フィールド:
  - `OutgoingCallInfo`: `acc_id: AccountId`, `call_id: CallId` (runtime), `remote_uri: Option<String>`, `target_uri: Option<String>`
  - `ProvisionalInfo`: `acc_id: AccountId`, `call_id: CallId`, `status_code: u16`, `reason: Option<String>`
  - `EarlyMediaInfo`: `acc_id: AccountId`, `call_id: CallId`, `media_format: Option<AudioFormat>`
  - `ConnectedCallInfo`: `acc_id: AccountId`, `call_id: CallId`, `media_format: Option<AudioFormat>`
  - `IncomingCallInfo`: `acc_id: AccountId`, `call_id: CallId`, `remote_uri: String`
  - `DisconnectInfo`: `acc_id: AccountId`, `call_id: CallId`, `reason: Option<String>`, `status_code: Option<u16>`, `by_remote: bool`

### P0 — DTMF 系

- `DtmfDigit { call_id, digit }` → `DtmfReceived(DtmfReceivedInfo)` 即時変換
- `DtmfDigit2 { call_id, digit, method }` → `DtmfReceived(DtmfReceivedInfo)` 変換（method 付き）
- `DtmfReceivedInfo` フィールド: `acc_id: AccountId`, `call_id: CallId`, `digit: char`, `method: DtmfMethod`
- **`DtmfSent` 二段構え実装（RFC02 §4.2-4.3）**:
  - `DtmfSentInfo` 構造体: `acc_id: AccountId`, `call_id: CallId`, `method: DtmfMethod`, `digits: String`, `status: Result<(), SentDtmfError>`
  - `SentDtmfError` enum（`event.rs` に追加）: `PjsipError(pj_status_t)`, `Timeout`
  - `SendDtmf` ハンドラ内でタイマー起動（`DtmfConfig::sent_timeout_ms`、未設定時 500ms）
  - タイマー発火時に `DtmfSent(DtmfSentInfo { status: Ok(()), .. })` を publish
  - PJSIP callback 経由の DtmfSent が先に発火した場合はタイマーキャンセル

### P1 — Transport/ICE 系

- `TransportStateChanged { tp_id, state }` → `TransportConnected` / `TransportDisconnected` / `TransportError`
- `IceTransportError` → `IceNegotiationFailed`
- `TransportConnectedInfo` フィールド: `tp_id: i32`, `kind: TransportKind`, `local_addr: Option<SocketAddr>`
- `TransportDisconnectedInfo`: `tp_id: i32`, `kind: TransportKind`
- `TransportErrorInfo`: `tp_id: i32`, `kind: TransportKind`, `error: String`
- `IceFailureInfo`: `call_id: Option<CallId>`, `status_code: Option<i32>`, `error_msg: String`

### CallState の `previous_state` 追跡機構

`CallEntry` に `previous_state: Option<CallState>` フィールドを追加し、`CallStateChanged` ハンドラ内で CONNECTING(2) の分岐判定（前状態が CALLING → Trying、前状態が INCOMING → Ringing）に使用する。

### 変換モジュール分割

`process_native_event()` の巨大化を防ぐため、以下の補助関数を `reactor.rs` 内に分割する:
- `convert_call_state(state, prev_state) -> Option<SipEventPayload>`
- `convert_call_media_state(media_state) -> Option<SipEventPayload>`
- `convert_registration_state(acc_id, info_snapshot) -> SipEventPayload`
- `handle_registration_state_changed(backend, state, acc_id) -> Option<SipEventPayload>`

## Non-scope

- **P2 対象外イベント**: `CallTsxStateChanged`, `CallRedirected`, `CallTransferStatus`, `CallReplaced`, `NatDetected` → いずれも None（RawSIP バス経由での代替取得をコメントで案内）。これらの実装は別チケット（M20-9 参照）で扱う。
- **DtmfSent PJSIP callback からの発火**: 本チケットでは Rust 側のタイマーによる発火のみ実装する。PJSIP callback からの `DtmfSent` 発火は別チケットで対応。
- **Info 構造体の serde 導出**: 現時点では追加しない。必要な場合は別チケットで対応。
- **NativeEvent::DtmfSent バリアントの追加**: PJSIP callback に `on_dtmf_sent` が存在しないため、NativeEvent への追加は行わない。タイマーベースの実装で代替する。

## Investigation

### ソースコード調査結果（2026-06-22）

#### reactor.rs:433-460 の現状（スタブコード）
```rust
RuntimeCommand::NativeEvent { event } => {
    use crate::event::SipEventPayload;
    use crate::ffi::callbacks::NativeEvent;
    let payload = match event {
        NativeEvent::RegistrationStateChanged { .. } => None,                                          // ← 常に None
        NativeEvent::RegistrationStarted { .. } => {
            Some(SipEventPayload::RegistrationStarted(crate::event::RegistrationInfo {}))              // ← 空 Info
        }
        NativeEvent::CallStateChanged { call_id: _, state } => {
            match state {
                1 => Some(SipEventPayload::CallDisconnected(                                           // ← 誤マッピング: state=1 は CALLING
                    crate::event::DisconnectInfo {},
                )),
                3 => Some(SipEventPayload::CallConnected(                                              // ← 空 Info、しかし 3=CONFIRMED は正しい
                    crate::event::ConnectedCallInfo {},
                )),
                _ => None,
            }
        }
        NativeEvent::DtmfDigit { call_id: _, digit: _ } => {
            Some(SipEventPayload::DtmfReceived(crate::event::DtmfReceivedInfo {}))                     // ← 空 Info
        }
        _ => None,                                                                                     // ← CallMediaStateChanged/Transport/ICE 全部 None
    };
```

**問題点:**
1. `RegistrationStateChanged` → GetAccountInfo を発行せず常に None（RFC02 §3 フロー違反）
2. `CallStateChanged` state=1 → CallDisconnected は明らかな誤り（正: OutgoingCallStarted）
3. `CallMediaStateChanged` 未ハンドリング（`_` に吸収）
4. 全 Info 構造体が空フィールド
5. `DtmfDigit` の digit/method 情報が欠落
6. DtmfSent のタイマー機構未実装
7. Transport/ICE イベント未ハンドリング

#### 利用可能なAPI・型
- **ClientState**: `get_account_by_native_id(acc_id: i32) -> Option<&AccountEntry>` で native_id から AccountId 解決可能
- **ClientState**: `get_call_by_native_id(call_id: i32) -> Option<&CallEntry>` で native_id から CallId 解決可能
- **MockBackend**: `get_account_info(native_acc_id: i32) -> Result<AccountInfoSnapshot, SipError>` 実装済み（M20-2）
- **EventBus**: `publish(event: SipEvent)` でイベント発行可能
- **DtmfMethod**: `Inband`, `SipInfo`, `Rfc4733` の 3 バリアント定義済み（config.rs:215-222）

#### 犯罪（[::STUB::]）チェック
- `scan-crimes.sh` 結果: 未解決の犯罪 0 件。仮実装コードは M17-3 のスコープ内スタブであり、本チケットで正規実装に置き換える。

## Test Plan

### ユニットテスト計画

MockBackend を使用した reactor テストとして実装する。既存のテストパターン（`test_reactor_initialize` 等）に倣い、`reactor.rs` の `mod tests` 内に追加する。

| # | テストケース | 正常/異常 | 備考 |
|---|---|---|---|
| 1 | RegistrationStateChanged → acc_id から AccountId 解決 → GetAccountInfo 発行 → RegistrationSucceeded が EventBus publish | 正常 | MockBackend に事前に add_account でアカウント追加、registration_status=200 を返すよう設定 |
| 2 | RegistrationStateChanged → GetAccountInfo で status != 200 (例: 401) → RegistrationFailed が publish | 正常 | MockBackend の registration_status を 401 に設定 |
| 3 | RegistrationStateChanged → GetAccountInfo で AccountNotFound → RegistrationFailed が publish | 異常 | 未登録の native_acc_id でのテスト |
| 4 | RegistrationStarted { renew: true } → RegistrationStarted の renew=true が伝播 | 正常 | |
| 5 | RegistrationStarted { renew: false } → RegistrationStarted の renew=false が伝播 | 正常 | |
| 6 | CallStateChanged state=0 (NULL) → イベント発行なし | 境界 | |
| 7 | CallStateChanged state=1 (CALLING) → OutgoingCallStarted が publish | 正常 | |
| 8 | CallStateChanged state=2, 前状態=CALLING → OutgoingCallTrying が publish | 正常 | previous_state の検証 |
| 9 | CallStateChanged state=2, 前状態=INCOMING → IncomingCall → OutgoingCallRinging が publish | 正常 | previous_state の検証 |
| 10 | CallStateChanged state=3 (CONFIRMED) → CallConnected が publish | 正常 | |
| 11 | CallStateChanged state=4 (DISCONNECTED) → CallDisconnected が publish | 正常 | |
| 12 | CallMediaStateChanged ACTIVE → MediaActive が publish | 正常 | |
| 13 | CallMediaStateChanged LOCAL_HOLD → CallHeld が publish | 正常 | |
| 14 | CallMediaStateChanged REMOTE_HOLD → CallHeld が publish | 正常 | |
| 15 | CallMediaStateChanged ERROR → MediaError が publish | 正常 | |
| 16 | CallMediaStateChanged NONE → イベント発行なし | 境界 | |
| 17 | DtmfDigit { digit: 5 } → DtmfReceived { digit: '5', method: RFC4733 } | 正常 | i32→char 変換の確認 |
| 18 | DtmfDigit2 { digit: 9, method: 0=SIP_INFO } → DtmfReceived { digit: '9', method: SipInfo } | 正常 | method 付き変換 |
| 19 | DtmfSent タイマー発火（500ms 以内に DtmfSent が publish される） | 正常 | タイマーテスト |
| 20 | DtmfSent タイマーキャンセル（SendDtmf 後すぐに DtmfSent 発行しない） | 正常 | キャンセルパス |
| 21 | P2 対象外イベント（CallTsxStateChanged/CallRedirected/CallTransferStatus/CallReplaced/NatDetected）→ すべて None | 正常 | |
| 22 | TransportStateChanged state=接続 → TransportConnected が publish | 正常 (P1) | |
| 23 | TransportStateChanged state=切断 → TransportDisconnected が publish | 正常 (P1) | |
| 24 | TransportStateChanged state=エラー → TransportError が publish | 正常 (P1) | |
| 25 | IceTransportError → IceNegotiationFailed が publish | 正常 (P1) | |
| 26 | 同時に複数の NativeEvent が連続して処理されても正しい SipEventPayload に変換される | 正常 | シーケンシャル検証 |
| 27 | EventBridge 経由で publish されたイベントに meta.account_id / call_id が正しく設定される | 正常 | |

### ユニットテスト不可能な項目（例外）

- **PJSIP callback からの DtmfSent 発火とタイマーキャンセルの実結合検証**: MockBackend では PJSIP の非同期コールバック発火をシミュレートできない。統合テスト（M20-1.6〜1.8）でカバーする。
- **TransportState の PJSIP 内部状態値検証**: Transport state の数値定数（`PJSUA_TP_STATE_CONNECTED` 等）は PJSUA ヘッダ依存のため、MockBackend では検証不可。結合テストでカバー。
- **pj_status_t の実値検証**: PJSIP 内部エラーコードのマッピングは結合テストで検証する。

## Boy Scout Rule — 翻訳可能性計画

1. **`reactor.rs:433-460` の巨大な `match event` の分割**: 現在は一つの match 式で全 NativeEvent を処理している。関数抽出により「NativeEvent の種類ごとに分岐し、適切な SipEventPayload に変換して EventBus に publish する」という散文として読める構造にする。
   - `handle_native_event(event, backend, state, events, ...)` 関数を抽出
   - 各イベント種別の処理をサブ関数（`handle_call_state_changed`, `handle_registration_state_changed`, `handle_dtmf_digit` 等）に分割

2. **マジックナンバーの定数化**: CallStateChanged の state 値（0〜4）を名前付き定数に置き換える。例: `const PJSIP_INV_STATE_CONFIRMED: u32 = 3;`

3. **Info 構造体フィールドの意味論的命名**: フィールド名がドメインの概念を正確に表現することを確認する（`status_code` は `registration_status` と命名する等、曖昧な命名を排除）。

4. **コメントの「なぜ」への集中**: コード自体が「何を」するかは関数名・変数名で表現し、コメントは変換ルールの設計判断根拠（例：「CONNECTING(2) で前状態が CALLING なら Trying、INCOMING なら Ringing とする理由」）の説明に専念させる。

5. **重複する AccountId/CallId 解決のヘルパー化**: `state.get_account_by_native_id(acc_id)` の呼び出しパターンが複数箇所で出現する。これを `resolve_account_id(state, native_acc_id) -> Option<AccountId>` のようなヘルパーに抽出する。

## Acceptance Criteria

- [ ] RegistrationStateChanged → GetAccountInfo 発行 → RegistrationSucceeded/RegistrationFailed が EventBus publish されることを確認
- [ ] 全 CallStateChanged 5 状態（NULL/CALLING/CONNECTING/CONFIRMED/DISCONNECTED）のマッピングが正しいことを確認（特に state=1 が OutgoingCallStarted であること、現状の CallDisconnected 誤りが修正されること）
- [ ] CallMediaStateChanged の全状態（NONE/ACTIVE/LOCAL_HOLD/REMOTE_HOLD/ERROR）が正しく変換されることを確認
- [ ] DtmfDigit の digit/method が DtmfReceivedInfo に正しく伝播することを確認
- [ ] DtmfSent タイマーが設定時間内に発火することを確認
- [ ] P2 対象外イベントがすべて None（発行なし）になることを確認
- [ ] Transport/ICE イベントが正しく変換されることを確認（P1）
- [ ] 全 Info 構造体に必要なフィールドが定義済みであることを確認
- [ ] 既存の全テストが通過していること（`make test`）
- [ ] 翻訳可能性の検証が通っていること（上記 Boy Scout Rule 計画の各項目が実施済みであること）
- [ ] マジックナンバーがすべて名前付き定数に置き換えられていること
- [ ] `#[allow(dead_code)]` を本チケットのスコープ内で除去できる箇所は除去していること
