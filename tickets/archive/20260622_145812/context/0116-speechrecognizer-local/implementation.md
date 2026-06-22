# 実装サマリ: SpeechRecognizer Local ディスパッチ (M6-1 / #116)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/recognizer.rs` | EDIT | SpeechRecognizer 構造体 + 5メソッド + アダプター |

## 変更内容
1. SpeechRecognizer に `local_recognizer: Option<LocalRecognizerAdapter>` 追加
2. `new()` で SttEngine::Local 時にアダプター生成
3. `start()`: Local 分岐を本実装に（log::errorスタブ→local_recognizer.start()）
4. `stop()`: Local 分岐を本実装に（no-opスタブ→local_recognizer.stop()）
5. `set_locale()`: Local 分岐追加（全バックエンドに伝播）
6. `tick()`: no-op維持（RFC §7 規定）
7. `validate_config()`: Ok(())維持（全プラットフォーム利用可能）
8. `LocalRecognizerAdapter`: #[allow(dead_code)] 除去

## 解決したスタブ（5件）
- validate_config(): スタブ除去 ✅
- start(): スタブ除去 ✅
- stop(): スタブ除去 ✅
- tick(): スタブ除去 ✅
- LocalRecognizerAdapter: #[allow(dead_code)] 除去 ✅

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed |
| 残存M6-1スタブ | ✅ 0件（全解決） |
