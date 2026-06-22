# 実装成果: チケット #93 — M8-2 CallState / MediaRuntime

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/call.rs | 新規 | CallState (13 vars) + is_terminal/is_active_media + 6 tests |
| crates/siprs/src/runtime/state.rs | 修正 | CallStateSkeleton→CallState / MediaRuntimeSkeleton→MediaRuntime |
| crates/siprs/src/lib.rs | 修正 | pub mod call; |

## 実装内容

### CallState (13 variants, #[non_exhaustive])
- is_terminal(): Disconnected|Failed → true
- is_active_media(): Active|Held → true

### MediaRuntime (空構造体, M14 以降で拡張)

### CallEntry 更新
- state: CallStateSkeleton → CallState
- media: Option<MediaRuntimeSkeleton> → Option<MediaRuntime>

## テスト結果
- 253 tests PASS（既存 247 + 新規 6）
- 0 warnings
- Quality checks: 0 issues
