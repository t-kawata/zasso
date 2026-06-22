---
ticket_id: 165
title: M3-4: Transparent provider mode
slug: m3-4-transparent-provider-mode
status: done
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0165-m3-4-transparent-provider-mode/implementation.md
---
# M3-4: Transparent provider mode

> **参照設計書:** crates/anthropx/RFC.md (§5.1 Transparent mode, §8 Streaming SSE proxy)
> **生成元:** Tickets.md L360-401

## Summary

最もシンプルな provider mode。upstream が Anthropic 互換 API の場合の透過中継を実装する。handle_messages の `[::STUB::]` のうち Transparent 分岐を解決し、non-stream/stream 両方のリクエスト処理・failover・SSE proxy を実装する。

## Background

M3-3 までで handle_messages の routing 解決（provider 解決・model 解決）は完成したが、具体的な provider 処理は `[::STUB::]` として保留されている。Transparent mode は `provider_config.transparent=true` の provider に対して、リクエスト body の model 名を upstream 名に書き換え、hop-by-hop header を除去し、upstream に中継する処理。non-stream では 5xx 時に別 API key で failover（最大3回）、stream では failover 禁止。

## Scope

### 実装対象

1. **`provider/transparent.rs`** (新規)
   - `handle_transparent(state, provider, resolved, api_key, body, is_stream)` → upstream 透過中継
   - `execute_with_failover(client, scheduler, request)` → non-stream failover（最大3回、5xxのみ）
   - `execute_stream(client, scheduler, request)` → stream（failover 禁止）
   - `proxy_sse_stream(upstream_stream, cancel)` → SSE ストリーム中継
   - `stream_response(upstream_resp)` / `json_response(upstream_resp)` → 応答構築

2. **`provider/mod.rs`** (修正)
   - `pub mod transparent;` 追加

3. **`http/routes.rs`** (修正)
   - `handle_messages` の `[::STUB::]` を `handle_transparent` 呼び出し分岐に置き換え

### 非対象（別チケット）

- Translate provider mode（M3-5）
- メトリクスカウンタの本格実装

## Investigation

### 既存コードの状態

```
crates/anthropx/src/
├── provider/mod.rs         ✅ pub mod limiter; のみ — transparent 未宣言
├── provider/limiter.rs     ✅ ConcurrencyLimiter
├── http/routes.rs          ✅ handle_messages — 🔴 [::STUB::] provider 処理
├── routing/scheduler.rs    ✅ KeyScheduler（select_key）
├── util/mod.rs             ✅ build_upstream_headers, HOP_BY_HOP_HEADERS
└── config/mod.rs           ✅ ProviderConfig.transparent: bool
```

### RFC 設計（§5.1 Transparent mode）

透過中継の流れ:
1. URL: `{base_url}/v1/messages`
2. model 名を `resolved.upstream` に書き換え
3. non-stream: `execute_with_failover` → `json_response`
4. stream: `execute_stream` → `proxy_sse_stream`

Failover ポリシー:
- non-stream: 5xx のみ failover（最大3回、別 key 再試行）
- stream: failover 禁止。最初のエラーで即時終端
- Client disconnect: `tokio::select!` で検出 → upstream Future drop

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M3-3 (ticket 164) | 先行実装必須: handle_messages routing 解決 | ✅ reviewed |
| M3-5 (ticket 166) | 後続: Translate は Transparent と同じ I/F 共有 | ⏳ 未着手 |

## Test Plan

### ユニットテスト計画

#### 1. handle_transparent
- non-stream 正常応答中継、stream SSE 中継、model 名書き換え、4xx/5xx upstream エラー伝播

#### 2. execute_with_failover
- 1回目成功、5xx→別 key 成功、全 key 失敗、4xx は failover しない

#### 3. execute_stream
- 成功、503→即時エラー（failover なし）

#### 4. proxy_sse_stream
- 正常ストリーム中継、upstream 切断、client disconnect（チャネル close）

### ユニットテスト不可能な項目

実 upstream API との結合テストは M4-4 で実施。

## Acceptance Criteria

- [ ] transparent non-stream が透過中継される
- [ ] transparent stream が SSE 中継される
- [ ] model 名が upstream 名に書き換えられる
- [ ] non-stream 5xx で failover（最大3回）が動作
- [ ] stream の failover が禁止されている
- [ ] 4xx は failover せず即時返却
- [ ] hop-by-hop header が除去される
- [ ] handle_messages から handle_transparent が呼び出される
- [ ] `[::STUB::]` が解決されている
- [ ] `make check-be` 通過
- [ ] 全テスト通過
- [ ] clippy 警告ゼロ

## Notes

### スタブの点検

`routes.rs` に 2 件の `[::STUB::]` — 本チケットで transparent 分岐を解決。
Translate 分岐の `[::STUB::]` は M3-5 で解決。

### 成果物

- 計画: context/0165-m3-4-transparent-provider-mode/plan.md（未作成）
- 実装サマリ: context/0165-m3-4-transparent-provider-mode/implementation.md（未作成）
- レビュー報告書: context/0165-m3-4-transparent-provider-mode/review.md（未作成）
