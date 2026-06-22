# M4-4: WinSpeechBackend + test-run.rs [WINDOWS] — 実装計画

## 要件
MYCUTE `src/stt/win.rs`（944行）の Windows ネイティブ音声認識バックエンドを voiput `backends/win.rs` に移植。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `backends/win.rs` | 新規 | グローバルチャネル、FFIコールバック4関数、IME制御、native capture、WinSpeechBackend、ticker task、テスト |
| `backends/mod.rs` | 変更 | cfg 条件付き mod win; |
| `lib.rs` | 変更 | cfg 条件付き re-export |
| `binary/test-run.rs` | 変更 | [WINDOWS] セクション追加 |
| `build.rs` | 変更 | link_windows() に C スタブ生成追加 |

## Boy Scout 改善
- coalescing/watermark/タイムアウト句読点を純粋関数として抽出
- WIN_DEBUG_COUNTER 削除

## テスト計画
- 9ユニットテスト: Coalescing(4), Watermark(3), has_unconfirmed(2)

## 実装手順
1. backends/win.rs 作成
2. backends/mod.rs 変更
3. lib.rs 変更
4. test-run.rs 変更
5. build.rs link_windows() 修正

## レビュー方法
run-quality-checks.js + 翻訳可能性 grep + 全テスト通過確認

## リスク
- cfg ガード必須
- Windows スタブの build.rs 処理
