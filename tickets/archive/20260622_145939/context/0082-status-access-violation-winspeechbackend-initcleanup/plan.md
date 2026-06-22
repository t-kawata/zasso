# 計画: #82 STATUS_ACCESS_VIOLATION修正

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/voiput/src/native/win_ffi.rs` | 修正 | `SPEECH_HELPER_INITIALIZED` AtomicBool ガード追加 |
| `crates/voiput/src/backends/win.rs` | 修正 | init ガード + health check 初回のみ実行 |
| `crates/voiput/src/hotkey/mod.rs` | 修正 | `stop_hotkey_monitor()` 公開関数追加 |
| `crates/voiput/src/voiput.rs` | 修正 | `Drop` に `stop_hotkey_monitor()` 追加 |
| `crates/voiput/src/binary/test-run.rs` | 修正 | `test_voiput()` 最小構成分離 |

## Boy Scout 改善

- `backends/win.rs`: `ensure_speech_helper_initialized()` 関数抽出
- `voiput.rs`: Drop コメントを責務説明に改善

## 実装手順

1. win_ffi.rs: init 状態ガード追加
2. backends/win.rs: init ガード参照 + health check 初回のみ
3. hotkey/mod.rs: stop_hotkey_monitor() 追加
4. voiput.rs: Drop に stop_hotkey_monitor() 追加
5. test-run.rs: test_voiput 最小構成分離
6. make test 確認

## レビュー方法

```bash
node .claude/scripts/tickets/review/run-quality-checks.js <files>
make check-be
make test
find-all-stubs.js crates/voiput/src
```
