---
ticket_id: 15
title: M5-1: wait_ready の実装（ReadyCondition 待機）
slug: m5-1-wait-ready-readycondition
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0015-m5-1-wait-ready-readycondition/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0015-m5-1-wait-ready-readycondition/review.md
---
# M5-1: wait_ready の実装（ReadyCondition 待機）

## Summary

プロセス起動完了条件 `ReadyCondition` の4バリアント（Immediate, Delay, LogContains, TcpPort）を非同期に待機する `wait_ready` 関数を実装する。全バリアントに `tokio::time::timeout` を適用し、タイムアウト時は `RegistryError::ReadyTimeout` を返す。

## Background

`spawn_one` はプロセスを起動した後、`ReadyCondition` で指定された条件が満たされるまで待機する（例: ログに "ready" と出力される、TCP ポートが開く）。`wait_ready` はこの待機ロジックをカプセル化し、`tokio::time::timeout` で確実にタイムアウト制御する。Phase 2 の基盤となる非同期処理。

**参照設計書:** docs/RFC-001-process-registry.md (§8)

## Scope

- `cargo add tokio --features net`（TcpStream のため）
- `crates/procreg/src/ready.rs` の新規作成:
  - `pub(crate) async fn wait_ready(condition: &ReadyCondition, name: &str, output_tx: broadcast::Sender<String>) -> Result<(), RegistryError>`
  - Immediate: 即座に Ok(())
  - Delay: `tokio::time::sleep` で指定時間待機
  - LogContains: `output_tx.subscribe()` → パターンマッチングループ → timeout
  - TcpPort: `TcpStream::connect` ポーリングループ → timeout
- `crates/procreg/src/lib.rs` の修正:
  - `pub mod ready;` 宣言の追加
- ユニットテスト（`ready.rs` 内 `#[cfg(test)] mod tests`）

## Non-scope

- `ProcessRegistry` メソッドとしての統合（RFC では impl 内だが、本チケットでは独立関数として実装）
- `spawn_one` からの呼び出し（M8-1 のスコープ）
- `tracing` の導入（後続チケットで追加）

## Investigation

### コードベース調査結果

```
Cargo.toml: tokio features = [macros, process, rt, rt-multi-thread, sync, time]
            └── net 未追加。TcpStream に必要。
```

- **発見1**: `ReadyCondition` 列挙型は `lib.rs` に定義済み（M0-1）。4バリアント: Immediate, Delay, LogContains, TcpPort。
- **発見2**: `RegistryError::ReadyTimeout { name, timeout }` は `error.rs` に定義済み（M0-2）。
- **発見3**: `tokio::net::TcpStream` を使用するため、tokio に `net` feature が必要。`cargo add tokio --features net` で追加。
- **発見4**: `broadcast::Sender<String>` は `registry.rs` の `RegistryEntry.output_tx` で使用済み。関数の引数として受け取る。
- **発見5**: LogContains は `broadcast::Receiver::recv().await` で行を取得し、`line.contains(&pattern)` で照合。チャンネル Closed は `anyhow::Error` に変換 → `SpawnFailed` でラップ。RFC のエラーハンドリングを踏襲。
- **発見6**: TcpPort は `TcpStream::connect` が成功するまで `poll_interval` ごとにリトライ。タイムアウトは Outer timeout で判定。
- **発見7**: テストは `#[tokio::test]` で非同期実行。Delay は短時間（10ms）設定。

### RFC §8 の実装

```rust
pub(crate) async fn wait_ready(
    condition: &ReadyCondition,
    name: &str,
    output_tx: broadcast::Sender<String>,
) -> Result<(), RegistryError> {
    match condition {
        ReadyCondition::Immediate => Ok(()),

        ReadyCondition::Delay(d) => {
            tokio::time::sleep(*d).await;
            Ok(())
        }

        ReadyCondition::LogContains { pattern, timeout } => {
            let mut rx = output_tx.subscribe();
            let pat = pattern.clone();
            let result = tokio::time::timeout(*timeout, async move {
                loop {
                    match rx.recv().await {
                        Ok(line) if line.contains(&pat) => return Ok(()),
                        Ok(_) => continue,
                        Err(broadcast::error::RecvError::Closed) => {
                            return Err(anyhow::anyhow!("channel closed"));
                        }
                        Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    }
                }
            }).await;

            match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(RegistryError::SpawnFailed {
                    name: name.to_string(), source: e,
                }),
                Err(_) => Err(RegistryError::ReadyTimeout {
                    name: name.to_string(), timeout: *timeout,
                }),
            }
        }

        ReadyCondition::TcpPort { host, port, timeout, poll_interval } => {
            let addr = format!("{host}:{port}");
            let poll = *poll_interval;
            let result = tokio::time::timeout(*timeout, async move {
                loop {
                    if tokio::net::TcpStream::connect(&addr).await.is_ok() {
                        return Ok(());
                    }
                    tokio::time::sleep(poll).await;
                }
            }).await;

            match result {
                Ok(Ok(())) => Ok(()),
                _ => Err(RegistryError::ReadyTimeout {
                    name: name.to_string(), timeout: *timeout,
                }),
            }
        }
    }
}
```

### 設計上の制約

- `output_tx` は `broadcast::Sender<String>` — subscribe して Receiver 経由で行読み取り
- LogContains の内部エラー（チャンネル Closed）は `anyhow::Error` に変換 → `SpawnFailed` でラップ
- TcpPort のハイパフォーマンスポーリングは避け、`poll_interval` に従う
- 全バリアントのタイムアウトは `tokio::time::timeout` で一貫して処理

## Test Plan

### ユニットテスト計画

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `immediate_returns_ok` | 正常系 | Immediate → 即座に Ok |
| 2 | `delay_waits_for_duration` | 正常系 | Delay(10ms) → 10ms 経過後に Ok |
| 3 | `log_contains_matches` | 正常系 | チャンネルに "ready" を送信 → LogContains("ready") → Ok |
| 4 | `log_contains_timeout` | 異常系 | パターン一致前に timeout → ReadyTimeout |
| 5 | `log_contains_channel_closed` | 異常系 | チャンネル Closed → SpawnFailed |
| 6 | `tcp_port_connect_success` | 正常系 | テスト用ポートを Listen → TcpPort 接続成功 → Ok（統合テスト寄り） |

### ユニットテスト不可能な項目（例外）

- TcpPort の実 TCP サーバーを使用したテスト → テスト用に `TcpListener` をバインドして検証可（実装時に検討）。困難な場合は M13-1 統合テストで実施。
- TcpPort のタイムアウトテスト → 到達不可能なポートへの接続で検証可。

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `wait_ready` — 「起動完了を待機する」
2. **変数名はドメイン概念**: `condition`（完了条件）、`rx`（購読レシーバー）、`pat`（照合パターン）、`addr`（接続アドレス）
3. **match の各アームが文章として読める**: Immediate →「即座に成功」、Delay →「指定時間スリープ」、LogContains →「ログパターンを待機」、TcpPort →「TCP ポートを待機」
4. **`lib.rs` の変更は最小差分**: `pub mod ready;` 1行追加のみ

## Acceptance Criteria

- [ ] `tokio` に `net` feature が追加される
- [ ] Immediate が即座に Ok を返す
- [ ] Delay が指定時間待機後に Ok を返す
- [ ] LogContains がパターン一致を検出する
- [ ] LogContains がタイムアウト時に ReadyTimeout を返す
- [ ] LogContains がチャンネル切断を検出する
- [ ] TcpPort が接続成功時に Ok を返す（テスト用 TcpListener を使用）
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の 55 テストが引き続き通過する

## Notes

### 依存関係

```
M0-1 (ReadyCondition) ──┐
                         ├── M5-1 (wait_ready) ── M8-1 (spawn_one)
M0-2 (RegistryError) ────┘
```

- `tokio::net::TcpStream` のために `net` feature を追加
- `anyhow` は LogContains のチャンネル Closed エラー変換に使用（RFC 踏襲）
- テスト用に `broadcast::channel(16)` と `TcpListener` を使用

### 成果物

- 計画: context/0015-m5-1-wait-ready-readycondition/plan.md（未作成）
- 実装サマリ: context/0015-m5-1-wait-ready-readycondition/implementation.md（未作成）
- レビュー報告書: context/0015-m5-1-wait-ready-readycondition/review.md（未作成）
