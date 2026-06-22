# 実装成果

## 変更ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---|---|---|
| `src/event.rs` | 修正 | 全 Info 構造体にフィールド追加（RegistrationInfo/RegistrationFailure/OutgoingCallInfo/ProvisionalInfo/EarlyMediaInfo/ConnectedCallInfo/IncomingCallInfo/DisconnectInfo/MediaActiveInfo/MediaErrorInfo/DtmfReceivedInfo/DtmfSentInfo/TransportConnectedInfo/TransportDisconnectedInfo/TransportErrorInfo/IceFailureInfo） |
| `src/event.rs` | 追加 | `SentDtmfError` enum（`PjsipError`, `Timeout`） |
| `src/event.rs` | 修正 | `AudioFormat` インポート追加 |
| `src/event.rs` | 修正 | テスト全件を新しいフィールドに対応 |
| `src/runtime/state.rs` | 修正 | `CallEntry` に `previous_state: Option<CallState>` フィールド追加 |
| `src/runtime/state.rs` | 追加 | `get_call_by_native_id_mut()` メソッド追加 |
| `src/runtime/state.rs` | 修正 | テスト全件に `previous_state: None` 追加 |
| `src/runtime/reactor.rs` | 追加 | PJSIP_INV_STATE_* / PJSUA_CALL_MEDIA_* 定数（マジックナンバー撲滅） |
| `src/runtime/reactor.rs` | 追加 | `handle_native_event()` / `handle_registration_state_changed()` / `handle_call_state_changed()` / `handle_call_media_state_changed()` / `convert_transport_state()` / `resolve_runtime_account_id()` 補助関数 |
| `src/runtime/reactor.rs` | 修正 | `RuntimeCommand::NativeEvent` 完全実装（Registration/Call/Media/DTMF/Transport/ICE 対応 + P2 イベント除外） |
| `src/runtime/reactor.rs` | 修正 | `RuntimeCommand::SendDtmf` に DtmfSent タイマー追加（500ms タイムアウト） |
| `src/runtime/reactor.rs` | 追加 | テスト 22 ケース（NativeEvent 変換全般） |
| `src/ffi/callbacks.rs` | 修正 | `NativeEvent::CallMediaStateChanged` に `media_status: u32` フィールド追加 |
| `src/runtime/backend.rs` | 追加 | `MockBackend::registration_status_override` + `set_registration_status()`（テスト用） |
| `src/client.rs` | 修正 | `ConnectedCallInfo {}` / `CallEntry` の field diff 修正 |

## 実装サマリ

- **P0 Registration 系**: RegistrationStateChanged → GetAccountInfo → RegistrationSucceeded/RegistrationFailed、RegistrationStarted → 即時変換
- **P0 Call 系**: CallStateChanged 全5状態（NULL/CALLING/CONNECTING/CONFIRMED/DISCONNECTED）の正しいマッピング、previous_state トラッキング
- **P0 CallMedia 系**: CallMediaStateChanged 全5状態（NONE/ACTIVE/LOCAL_HOLD/REMOTE_HOLD/ERROR）の変換
- **P0 DTMF 系**: DtmfDigit/DtmfDigit2 → DtmfReceived 変換、SendDtmf 成功後の DtmfSent タイマー（500ms）
- **P1 Transport/ICE 系**: TransportStateChanged/IceTransportError → 対応する SipEventPayload 変換
- **Info 構造体**: 全構造体に必要なフィールドを定義
- **テスト**: 22 ケース、全パス（432/432）

## 未実装項目
- CallStateChanged state=2 で前状態が INCOMING の分岐 → テストでカバー（combined with IncomingCall event handling in M20-9）
- PJSIP callback からの DtmfSent 発火 → PJSIP に on_dtmf_sent callback がないためタイマーベースで代替
