# 実装計画: PseudoAsrStreamer 事後補正バックエンド注入 (#127)

## 要件
PseudoAsrStreamer::new() に post_correct_backend パラメータを追加し、
Local エンジンでも OpenAI API による事後補正を可能にする。

## 変更ファイル
| ファイル | 内容 |
|---------|------|
| pipeline/streamer.rs | new() に post_correct_backend 追加 |
| backends/openai.rs | new() 呼び出しに None 追加（2箇所） |
| recognizer.rs | 事後補正用バックエンド生成 + 注入 |

## 実装手順
1. pipeline/streamer.rs: new() のシグネチャ変更 + 注入ロジック
2. backends/openai.rs: 2箇所の呼び出しに None 追加
3. recognizer.rs: LocalRecognizerAdapter::new() で事後補正用バックエンド注入
4. コンパイル・テスト確認

## リスク
中（PseudoAsrStreamer 本体変更による回帰）
