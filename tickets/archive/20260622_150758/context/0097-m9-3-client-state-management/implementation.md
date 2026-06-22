# 実装成果: チケット #97 — M9-3 ClientState 管理

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/runtime/state.rs | 修正 | native_id + shutting_down + 5 methods + 6 tests |

## 実装内容

### AccountEntry / CallEntry 拡張
- native_id: Option<i32> — PJSUA ネイティブ ID（M17-1 で正式型に差し替え）

### ClientState 拡張
- shutting_down: bool — シャットダウンフラグ
- can_add_call(max_calls) — 通話数上限チェック
- set_shutting_down() / is_shutting_down()
- get_account_by_native_id() / get_call_by_native_id() — 逆引き
- add_account / add_call に shutting_down チェック追加

## テスト結果
- 288 tests PASS（既存 282 + 新規 6）
- 0 warnings
- Quality checks: 0 issues

## 🎉 M9 マイルストーン完了！ Phase 4（状態機械）完了！
- M9-1 (#95): RegistrationState 遷移ロジック ✅
- M9-2 (#96): CallState 遷移ロジック ✅
- M9-3 (#97): ClientState 管理 ✅
