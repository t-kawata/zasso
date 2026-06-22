# M6-1: プリビルドライブラリ自動ビルド — レビュー報告書

## 検証結果

| チェック | 結果 | 詳細 |
|---------|------|------|
| Acceptance Criteria | ✅ 全9項目充足 | ファイル存在+自動ビルド+libs収集+panic+rerun+テスト |
| ユニットテスト | ✅ 107/107 通過 | 既存テスト回帰なし |
| 品質チェック | ✅ 68件 (build.rs 特有、問題なし) | unwrap/println はビルドスクリプトの正常パターン |
| 翻訳可能性 | ✅ 全関数動詞句 | collect_runtime_libs, can_use_real_library, find_system_dll |

## Acceptance Criteria 充足状況

- [x] AC#1: native/swift/SpeechHelper.swift + speech_helper.h 存在
- [x] AC#2: native/cs/SpeechHelper/* 全ファイル存在
- [x] AC#3: native/swift/build.sh 存在 (実稼働確認: 208KB ライブラリビルド成功)
- [x] AC#4: native/cs/build.ps1 存在
- [x] AC#5: build.rs 自動ビルドロジック (macOS 実績: build.sh → real lib → スタブフォールバック)
- [x] AC#6: libs/macos/ 収集 (libsherpa-onnx-c-api.dylib + libonnxruntime.1.24.4.dylib)
- [x] AC#7: panic! 3箇所 (スタブ生成失敗/MSVC lib.exe失敗/必須libs欠落)
- [x] AC#8: rerun-if-changed native/ + libs/ 追加
- [x] AC#9: 107/107 テスト通過

## Boy Scout 改善

- .gitignore に prebuilt/ + libs/ 追加 (ビルド生成物の誤コミット防止)
- test-run.rs のスタブ差し替えメッセージを M6-1.5/1.6 に修正
- build.rs のスタブ差し替えメッセージを runtime resolution pending に修正
- build.rs の Swift runtimeLibraryPaths パースを JSON ネスト対応に修正
- build.rs の `ar crs` 前に古いライブラリ削除を追加 (ar の累積問題修正)
