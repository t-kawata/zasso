# 実装成果: チケット #100 — M11-1 RuntimeCommand enum

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/runtime/command.rs | 新規 | RuntimeCommand (17 vars) + HangupReason (5 vars) + 2 tests |
| crates/siprs/src/runtime/mod.rs | 修正 | pub mod command; |

## 実装内容

### RuntimeCommand (17 variants)
Initialize, AddAccount, RemoveAccount, SetRegistration, MakeCall, Hangup
Hold, Unhold, SendDtmf, Answer, Transfer
AddAudioSource, RemoveAudioSource, SetSourceGain, MuteSource, SubscribeAudio
Shutdown

### HangupReason (5 variants)
Bye, Cancel, Busy, Decline, InternalError

### reply フィールド
全バリアントに `oneshot::Sender<Result<T, SipError>>` を内包
MakeCall → CallId, AddAudioSource → AudioSourceId

## テスト結果
- 298 tests PASS（既存 296 + 新規 2）
- 0 warnings
- Quality checks: 0 issues
