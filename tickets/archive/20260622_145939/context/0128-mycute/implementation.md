# 実装サマリ: 事後補正プロンプト mycute 同一化 (#128)

## 変更内容
### backends/openai.rs
- call_post_correct() にロケール切替を実装（LocaleCode::Ja → SYSTEM_PROMPT_JA, En → SYSTEM_PROMPT_EN）
- システムプロンプトを mycute の prompts.rs と完全一致（日本語9項目、英語9項目）
- ユーザーメッセージを mycute 互換の <text> タグ形式に変更
- strip_result_tags() 追加 — LLM 応答から <result> タグを除去（mycute の extract_result 互換）

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| make check-be | ✅ |
