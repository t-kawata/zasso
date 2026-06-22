# レビュー報告書: 事後補正プロンプト mycute 同一化 (#128)

## 検証結果
| 項目 | 結果 |
|------|------|
| 存在確認 + done 確認 | ✅ done |
| spec と実装の一致 | ✅ 全 Acceptance Criteria 充足 |
| 依存・関連チケット | ✅ #127 reviewed |
| [::STUB::] チェック | ✅ 2件 pre-existing |
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| run-quality-checks.js | ✅ 5件 pre-existing（新規 issues なし） |
| 構造整合性チェック | ✅ 47件 pre-existing |
| 翻訳可能性 | ✅ 問題なし（動詞句、デバッグ出力なし） |

## Acceptance Criteria 充足確認
- [x] 日本語ロケール時、mycute の SYSTEM_PROMPT_JA と同一プロンプト
- [x] 英語ロケール時、mycute の SYSTEM_PROMPT_EN と同一プロンプト
- [x] ユーザーメッセージが mycute と同一フォーマット（<text> タグ）
- [x] strip_result_tags で <result> タグ除去（extract_result 互換）
- [x] make run-openai 既存動作維持
- [x] cargo test --lib 全件通過

## 総評
✅ ALL CHECKS PASSED。
事後補正プロンプトを mycute と完全一致。ロケール切替対応済み。
