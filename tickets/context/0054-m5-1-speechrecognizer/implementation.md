# M5-1: SpeechRecognizer

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/recognizer.rs` | 拡張 (101→約300行) | SpeechRecognizer struct + 全メソッド（new/start/stop/set_locale/set_engine/update_config/cleanup/tick/Drop）+ インターセプタータスク + rebuild_pc_backend ヘルパー + 5テスト |
| `src/lib.rs` | 変更 | `pub use recognizer::SpeechRecognizer;` 追加 |

## 実装サマリ

- **LmgwClient 完全排除**: PostCorrection バックエンドの構築に `OpenAiConfig` → `OpenAIBackend` → `BackendWrapper` を使用
- **インターセプタータスク**: std::thread + blocking_recv で全イベントを中継。FinalResult/PartialResult のテキストに `apply_replaces()` を適用
- **全バックエンド常時初期化**: 即時エンジン切り替え対応
- **`rebuild_pc_backend()` ヘルパー**: macOS/Windows の update_config で共有
- **5ユニットテスト**: validate_config(2), interceptor(3)
