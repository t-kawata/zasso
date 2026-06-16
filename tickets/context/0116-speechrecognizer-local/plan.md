# 実装計画: SpeechRecognizer Local ディスパッチ (M6-1 / #116)

## 変更ファイル一覧
- `crates/voiput/src/recognizer.rs`: EDIT — 複数箇所

## 実装手順
1. SpeechRecognizer に local_recognizer フィールド追加
2. new() で Local 時にアダプター生成
3. 4 match アーム + set_locale/update_config に Local 分岐追加
4. LocalRecognizerAdapter #[allow(dead_code)] 除去
5. cargo check 0/0 + cargo test 全通過
