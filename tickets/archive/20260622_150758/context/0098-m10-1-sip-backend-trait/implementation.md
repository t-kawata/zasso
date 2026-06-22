# 実装成果: チケット #98 — M10-1 SipBackend trait

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/runtime/backend.rs | 新規 | SipBackend trait (14 methods) + 3 type aliases + 3 tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod backend; |

## 実装内容

### 型エイリアス
- NativeAccId = i32, NativeCallId = i32, NativeConfPortId = i32
- M17-1 で ffi::pjsua_acc_id 等に差し替え

### SipBackend trait: Send
- 14 methods: initialize, shutdown, create_transport, add_account, remove_account, set_registration, make_call, answer_call, hangup, conf_connect, conf_disconnect, configure_codecs, send_dtmf, transfer_call
- pub(crate) 可視性
- object-safe (Box<dyn SipBackend> 可)

## テスト結果
- 291 tests PASS（既存 288 + 新規 3）
- 0 warnings
- Quality checks: 0 issues
