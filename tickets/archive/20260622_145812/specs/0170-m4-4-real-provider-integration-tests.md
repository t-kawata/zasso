---
ticket_id: 170
title: M4-4: Real provider integration tests
slug: m4-4-real-provider-integration-tests
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0170-m4-4-real-provider-integration-tests/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0170-m4-4-real-provider-integration-tests/review.md
---
# M4-4: Real provider integration tests

> **参照設計書:** crates/anthropx/RFC.md (§12 テスト戦略)
> **生成元:** Tickets.md L538-558

## Summary

実際の upstream provider（OpenAI 互換 API）に対して anthropx を通してリクエストし、エンドツーエンドの動作を検証する。API key は環境変数 `OPENAI_API_KEY` から注入、未設定時はスキップ。

## Scope
- `tests/real_provider.rs` — 環境変数で制御される実プロバイダーテスト

## Acceptance Criteria
- [ ] `OPENAI_API_KEY` 設定時は実際の API にリクエスト
- [ ] 未設定時は `cargo test` が pass
- [ ] 標準出力でテスト結果が詳細に確認可能
