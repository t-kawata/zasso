# 実装成果: チケット #96 — M9-2 CallState 遷移ロジック

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/call.rs | 追記 | CallEvent (15 events) + 3 methods + 12 tests |

## 実装内容

### CallEvent enum (15 events)
- 発信系: Dialed, Provisional(u16), EarlyMedia, Connected(u16)
- 着信系: Incoming, Answered(u16)
- 制御系: Hold, Unhold, ReferSent, ReferSuccess, ReferFailed
- 切断系: Bye, Cancel, Failure(u16,String), LocalHangup

### CallState methods
- can_transition_to(next) — 遷移表ベースの合法性判定
- apply_call_event(event) — イベント適用 + 状態更新
- direction() → Option<EventDirection>

### 遷移パス
- 発信: New→Calling→Trying→Ringing→Connecting→Active
- 着信: New→Incoming→Connecting→Active
- 制御: Active↔Held, Active↔Transferring
- 切断: Active/Held/Transferring→Disconnecting→Disconnected
- 失敗: Ringing/EarlyMedia/Connecting→Failed

## テスト結果
- 282 tests PASS（既存 270 + 新規 12）
- 0 warnings
- Quality checks: 0 issues
