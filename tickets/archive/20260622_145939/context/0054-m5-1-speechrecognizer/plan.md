# M5-1: SpeechRecognizer — 実装計画

## 要件
MYCUTE `src/stt/recognizer.rs`（501行）の SpeechRecognizer を voiput `recognizer.rs` に拡張。
既存の apply_replaces()（101行）は維持。LmgwClient 排除、OpenAiConfig で直接構築。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `recognizer.rs` | 拡張 | SpeechRecognizer struct + 全メソッド + インターセプター + テスト |
| `lib.rs` | 変更 | pub use recognizer::SpeechRecognizer; |

## Boy Scout 改善
- update_config の PostCorrection 更新を rebuild_pc_backend() に抽出
- lmgw_client() 参照削除

## テスト計画
- validate_config(2) + interceptor(3) = 5テスト追加
- new()/start()/stop() は FFI 依存のためテスト不可

## 実装手順
1. recognizer.rs に SpeechRecognizer 追記
2. lib.rs に re-export 追加

## レビュー方法
run-quality-checks.js + 翻訳可能性 grep + 全テスト通過確認

## リスク
- OpenAIRecognizer の引数が MYCUTE と異なる
- cfg 条件の正しいガード
