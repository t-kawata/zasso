# M18-2: AudioBridge — 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/ffi/media.rs` | 変更 | AudioBridge struct + 6 メソッド + [::STUB::] connect_to_conference + 6 テスト |

## 検証結果
- ✅ `cargo check -p siprs` — 0 error, 0 warning
- ✅ `cargo test` — 390 PASS（384→390、+6 テスト）
- ✅ 品質チェック — 6 issues（全てテスト内 unwrap、許容）
- ✅ `cargo fmt` — 通過

## AudioBridge API
- `new(frame_samples, queue_capacity) -> Self` — 2 ポート生成
- `connect_to_conference() -> Result` — conference 接続（[::STUB::] M19-1）
- `disconnect() -> Result` — 切断（idempotent）
- `push_to_rt(frame)` — OUT 方向（playback_port）
- `pop_from_rt() -> Option<Vec<i16>>` — IN 方向（capture_port）
- `is_connected() -> bool` — 接続状態確認
