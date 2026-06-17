# 実装計画: 事後補正プロンプト mycute 同一化 (#128)

## 要件
call_post_correct のプロンプトを mycute と同一にし、LocaleCode 切替に対応

## 変更ファイル
| ファイル | 内容 |
|---------|------|
| backends/openai.rs | プロンプト定数追加 + ロケール切替実装 |

## 実装手順
1. プロンプト定数 SYSTEM_PROMPT_JA / SYSTEM_PROMPT_EN を追加
2. call_post_correct() にロケール切替 + ユーザーメッセージ分岐を実装

## リスク
低（1ファイルのみ、API呼び出し自体は不変）
