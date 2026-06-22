# M18-2: AudioBridge — 実装計画

## 要件
AudioWorkerTask と RustMediaPort の間のデータフローを管理する AudioBridge。
2 つの RustMediaPort（capture/playback）を内包し conference 接続状態を管理。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/ffi/media.rs | 変更 | AudioBridge + 6メソッド + 6テスト + allow縮小 |

## 実装手順
1. AudioBridge struct + 6 メソッド追加
2. cargo check -p siprs
3. cargo test（384→390）
4. cargo fmt

## レビュー方法
1. run-quality-checks.js
2. cargo fmt --check
3. 翻訳可能性 grep
## リスク
- allow 削除後の警告 → cargo check で確認
