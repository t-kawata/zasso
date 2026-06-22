---
ticket_id: 169
title: M4-3: Mock server integration tests
slug: m4-3-mock-server-integration-tests
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0169-m4-3-mock-server-integration-tests/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0169-m4-3-mock-server-integration-tests/review.md
---
# M4-3: Mock server integration tests

> **参照設計書:** crates/anthropx/RFC.md (§12 テスト戦略)
> **生成元:** Tickets.md L503-536

## Summary

設計書の受け入れ基準 10 項目すべてを axum_test を用いた mock upstream テストで検証する。CI で常時実行可能な統合テスト。

## Investigation

### 依存
| ID | 関係 | 状態 |
|----|------|------|
| M4-1 (ticket 167) | 先行: ProxyServer::start | ✅ reviewed |
| M4-2 (ticket 168) | 先行: main.rs | ✅ reviewed |

### 10 Acceptance Criteria
| AC# | 内容 |
|-----|------|
| 1 | transparent non-stream → 200 |
| 2 | transparent stream → 200 |
| 3 | translate non-stream → 200 |
| 4 | translate stream → 200 |
| 5 | non-stream key failover → 成功 |
| 6 | stream no-failover → エラー |
| 7 | /v1/models ソート順 |
| 8 | provider/model 分割なし → 400 |
| 9 | queue overflow → 429 |
| 10 | /metrics, /healthz → 200 |

## Scope
- `tests/mock_server.rs` — integration test ファイル1つ
- `setup_mock_upstream()` で 4 エンドポイントの mock サーバー建てる
- 10 個の `#[tokio::test]` 関数

## Acceptance Criteria
- [ ] 全 10 AC が個別テストとして実装されている
- [ ] 各テストが独立して実行可能
- [ ] `cargo test` で全テスト通過
