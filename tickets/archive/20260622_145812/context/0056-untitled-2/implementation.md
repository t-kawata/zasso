# M6-1: プリビルドライブラリ自動ビルド — 実装成果

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `native/swift/SpeechHelper.swift` | 新規 | MYCUTE からコピー (512行, Swift FFI) |
| `native/swift/speech_helper.h` | 新規 | MYCUTE からコピー (50行, C ヘッダー) |
| `native/swift/build.sh` | 新規 | swiftc 静的ライブラリビルドスクリプト |
| `native/cs/SpeechHelper/SpeechHelper.cs` | 新規 | MYCUTE からコピー (952行, C# FFI) |
| `native/cs/SpeechHelper/Check.cs` | 新規 | MYCUTE からコピー (13行) |
| `native/cs/SpeechHelper/SpeechHelper.csproj` | 新規 | MYCUTE からコピー (28行) |
| `native/cs/build.ps1` | 新規 | dotnet publish ビルドスクリプト |
| `build.rs` | 修正 (+100行) | 自動ビルド + runtime libs 収集 + Swift Concurrency チェック |
| `.gitignore` | 修正 (+6行) | `prebuilt/` + `libs/` 追加 |

## build.rs の新規機能

1. **自動ビルド**: prebuilt/library 不在時に native/<platform>/build.sh(.ps1) を実行
2. **Swift Concurrency チェック**: libswift_Concurrency.dylib の有無で実ライブラリ/スタブを切替
3. **runtime libs 収集**: target/ から sherpa-onnx の .dylib/.dll を libs/<platform>/ にコピー
4. **完全性検証**: 必須ファイル欠落時 panic!
5. **rerun-if-changed**: native/ + libs/ の変更検出

## テスト結果

- 107/107 テスト通過 (既存と同一、回帰なし)
- build.sh で実ライブラリ自動ビルド成功 (208KB libSpeechHelper.a)
- runtime libs: libsherpa-onnx-c-api.dylib + libonnxruntime.1.24.4.dylib 収集完了
- Swift Concurrency 未対応環境ではスタブにフォールバック (M6-1.5 で解決)

## 品質チェック

- run-quality-checks.js: 0 issues
