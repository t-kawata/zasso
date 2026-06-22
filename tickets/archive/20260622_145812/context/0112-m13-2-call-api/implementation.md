# M13-2: 発着信API — make_call / answer / hangup / hold / unhold / transfer / send_dtmf / call_state

## 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/siprs/src/client.rs | 修正 | SipClient call API (8 methods) + 5 tests |
| crates/siprs/src/runtime/command.rs | 修正 | HangupReason pub に昇格 |

## 実装内容

### SipClient メソッド
| メソッド | 方式 | 特記事項 |
|----------|------|---------|
| make_call(account_id, request) | RTT | Box<OutgoingCallRequest> |
| answer(call_id, code) | RTT | コード制限: 180/183/200/486/603 のみ |
| hangup(call_id, reason) | RTT | HangupReason 指定 |
| hold(call_id) | RTT | |
| unhold(call_id) | RTT | |
| transfer(call_id, target) | RTT | blind transfer |
| send_dtmf(call_id, digits, method) | RTT | DtmfMethod 指定 |
| call_state(call_id) | ローカル | state.blocking_read() snapshot |

### Answer コード制限
- 許可: 180 (Ringing), 183 (Session Progress), 200 (OK), 486 (Busy Here), 603 (Decline)
- それ以外: `InvalidConfig` + エラーメッセージ

### Visibility 変更
- HangupReason: pub(crate) → pub（公開API に含めるため）

## テスト (5件)
| テスト | 内容 |
|--------|------|
| test_call_api_interface_compile_check | インターフェースコンパイル検証 |
| test_answer_invalid_code | 不正コード 999 → InvalidConfig |
| test_answer_invalid_code_100 | 境界値 100 → InvalidConfig |
| test_call_state | state snapshot 読み取り |
| test_calls_rejected_after_shutdown | shutdown 後 → ShutdownInProgress |

## 検証結果
- cargo check: 0 errors, 0 warnings
- cargo test: 331 passed, 0 failed (+1 doc-test)
- run-quality-checks.js: 0 issues
