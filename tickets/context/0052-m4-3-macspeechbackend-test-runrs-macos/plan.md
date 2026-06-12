# M4-3: MacSpeechBackend + test-run.rs [MACOS] — 実装計画

## 要件
MYCUTE `src/stt/mac.rs`（818行）の macOS ネイティブ音声認識バックエンドを voiput `backends/mac.rs` に移植。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `backends/mac.rs` | 新規 | グローバルチャネル、コールバック4関数、MacSpeechBackend（new/start/stop/tick/Drop）、ticker task |
| `backends/mod.rs` | 変更 | `#[cfg(target_os = "macos")] pub(crate) mod mac;` |
| `lib.rs` | 変更 | cfg 条件付き re-export |
| `binary/test-run.rs` | 変更 | [MACOS] セクション追加 |

## Boy Scout 改善
- ticker task 内の coalescing/watermark/post-correction を関数抽出
- エラーコード定数化
- MAC_DEBUG_COUNTER 削除

## テスト計画
- 9ユニットテスト: InternalMacEngine, Coalescing(3), Watermark(3), handle_error(2)
- FFI 呼び出し・実際の音声認識はテスト不可能

## 実装手順
1. backends/mac.rs 作成（全移植）
2. backends/mod.rs 変更
3. lib.rs 変更
4. test-run.rs 変更

## レビュー方法
run-quality-checks.js + 翻訳可能性 grep + 全テスト通過確認

## リスク
- cfg ガード必須
- ticker task 361行が最大の移植リスク
- MAC_ プレフィクスで Windows 側と衝突防止
