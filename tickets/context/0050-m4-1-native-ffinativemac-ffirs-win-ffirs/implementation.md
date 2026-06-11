# 実装サマリー: M4-1 Native FFI

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/native/mod.rs` | 新規 | cfg 条件付きモジュール公開（mac_ffi / win_ffi） |
| `src/native/mac_ffi.rs` | 新規 | macOS Swift SpeechHelper FFI（15 extern "C" 宣言） |
| `src/native/win_ffi.rs` | 新規 | Windows C# SpeechHelper FFI（14 extern "C" + ヘルスチェック状態管理 + 3テスト） |
| `src/lib.rs` | 変更 | `// mod native;` → `mod native;` |

## 検証結果

- cargo check: ✅ エラーなし
- cargo test: ✅ 74/74 PASS（macOS では Windows テスト 3件は cfg でスキップ）
- cargo fmt: ✅ 整形済み
