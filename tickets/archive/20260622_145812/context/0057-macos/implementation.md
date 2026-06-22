# M6-1.5: macOS ランタイムライブラリ収集 — 実装成果

## 変更概要

| ファイル | 種別 | 内容 |
|---------|------|------|
| `native/swift/build.sh` | 修正 | `-Xlinker -force_load_swift_libs` 削除（1行） |
| `build.rs` | 修正 | 3箇所 |

## build.rs の修正内容

1. **collect_runtime_libs_macos()**: `libonnxruntime.dylib` 収集追加、必須チェックを `libonnxruntime.dylib` に変更
2. **can_use_real_library()**: libs/macos/ 完全性 + Swift Concurrency 有無の両方を判定
3. **呼び出し順序変更**: collect → link の順に（can_use_real_library が libs/macos/ を参照できるよう）
4. **メッセージ更新**: Swift Concurrency → macOS 15/16 の明確な区別

## 成果

| 項目 | 状態 |
|------|------|
| libonnxruntime.dylib 収集 | ✅ 3ファイル (合計 54MB) |
| -force_load_swift_libs 除去 | ✅ 再ビルド成功 |
| 実ライブラリ自動ビルド | ✅ macOS 16+ で有効化、macOS 15 ではスタブ |
| 全テスト | ✅ 107/107 通過 |
| build.sh からの不要フラグ | ✅ 削除 |

## macOS バージョン別動作

| macOS | libswift_Concurrency.dylib | 動作 |
|-------|---------------------------|------|
| 15.x | dyld cache に不在 | スタブ（実ライブラリは自動ビルド済み） |
| 16+ | dyld cache に存在 | 実ライブラリが自動有効化 |
