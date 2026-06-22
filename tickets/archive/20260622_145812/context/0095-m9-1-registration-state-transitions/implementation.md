# 実装成果: チケット #95 — M9-1 RegistrationState 遷移ロジック

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/account.rs | 追記 | RegistrationEvent (6 events) + 5 methods + 12 tests |

## 実装内容

### RegistrationEvent enum (6 events)
- Register, Unregister, SetEnabled(bool), Success, Failure(SipError), Expired

### RegistrationState methods
- can_transition_to(next) — 遷移表ベースの合法性判定（全17パス）
- apply_event(event) — イベント適用 + 状態更新（48通り処理）
- is_registered() — Registered のみ true
- is_in_progress() — Registering | Unregistering で true
- is_terminal_error() — Failed のみ true

### 遷移表 (48通り)
- 7状態 × 7イベント = 49組み合わせ（1 no-op含む）
- 不正遷移は SipError::InvalidState
- テーブルテストで全網羅

## テスト結果
- 270 tests PASS（既存 258 + 新規 12）
- 0 warnings
- Quality checks: 0 issues（unwrap 14件修正済み）
