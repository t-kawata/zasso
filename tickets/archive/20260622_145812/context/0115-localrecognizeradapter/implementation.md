# 実装サマリ: LocalRecognizerAdapter (M5-2 / #115)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/recognizer.rs` | EDIT | LocalRecognizerAdapter + import更新 |
| `crates/trate/src/local.rs` | EDIT | LocalAsrBackend に Sync 要件追加 |

## 追加したアダプター
```
LocalRecognizerAdapter
├── struct { recognizer: LocalRecognizer, tx, locale }
├── new(tx, config) → Result
├── start() / stop()
├── tick() (no-op)
├── set_locale(locale)
└── update_config(config) → Result (stop → 再生成 → start)
```
[::STUB::] M6-1: SpeechRecognizer dispatch で完全な PseudoAsrStreamer 統合に置き換える

## トレイト修正
`trate::LocalAsrBackend: AsrBackend + Sync` に変更（PseudoAsrStreamer の型制約を満たすため）

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed |
