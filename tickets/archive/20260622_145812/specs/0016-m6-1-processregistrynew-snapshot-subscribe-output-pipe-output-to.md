---
ticket_id: 16
title: M6-1: ProcessRegistry::new, snapshot, subscribe_output, pipe_output_to
slug: m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0016-m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0016-m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to/review.md
---
# M6-1: ProcessRegistry::new, snapshot, subscribe_output, pipe_output_to

## Summary

`ProcessRegistry` 構造体に4つの基本APIメソッドを追加する。`new()` で空のレジストリを作成、`snapshot()` で全プロセス状態のスナップショットを取得、`subscribe_output()` / `pipe_output_to()` でプロセス出力の購読を提供する。

## Background

`ProcessRegistry` は M0-3 で構造体として定義されたが、メソッドは未実装である。本チケットではレジストリの基本操作（作成・状態取得・出力購読）を実装し、後続チケット（M7-1 watch_loop, M8-1 spawn_one, M9-1 shutdown_all）の基盤とする。Tauri フロントエンドは `snapshot()` で定期的に状態をポーリングし、`subscribe_output()` でプロセスログを取得する。

**参照設計書:** docs/RFC-001-process-registry.md (§9, §11, §12)

## Scope

- `crates/procreg/src/registry.rs` の `impl ProcessRegistry` に以下を追加:
  - `pub fn new() -> Self` — 空のレジストリを作成
  - `pub async fn snapshot(&self) -> HashMap<String, ProcessState>` — 全状態のスナップショット
  - `pub async fn subscribe_output(&self, name: &str) -> Option<broadcast::Receiver<String>>` — 出力購読
  - `pub async fn pipe_output_to<F>(&self, name: &str, sink: F) -> Option<JoinHandle<()>>` — 出力転送タスク
- ユニットテスト（既存 `registry.rs` の `#[cfg(test)]` 内に追加）

## Non-scope

- `start_all()` / `spawn_one()`（M8-1 のスコープ）
- `shutdown_all()` / `stop()`（M9-1 のスコープ）
- `watch_loop` / `start_watch_task`（M7-1 のスコープ）
- Tauri コマンド統合（M12-1 のスコープ）

## Investigation

### コードベース調査結果

```
registry.rs: ProcessRegistry 構造体 + Clone impl + RegistryEntry + RegistryInner は M0-3 で定義済み
             └── impl ブロックにメソッドなし（M6-1 で追加予定）
```

- **発見1**: `ProcessRegistry` は M0-3 で定義済み（`inner: Arc<Mutex<RegistryInner>>`）。`Clone` impl は済み。
- **発見2**: `RegistryInner` は `entries: HashMap<String, RegistryEntry>` と `start_order: Vec<String>` を持つ。
- **発見3**: `RegistryEntry.output_tx` は `broadcast::Sender<String>` — 既存のフィールド。
- **発見4**: `ProcessState` は `state.rs` で定義済み。serde 付きで Clone + PartialEq。
- **発見5**: `new()` はスタンドアロンなコンストラクタ（既存のテストでは直接 `ProcessRegistry { inner: ... }` で構築）。
- **発見6**: `subscribe_output()` は Mutex ロック後に `entries.get(name)` → `output_tx.subscribe()`。NotFound の場合は `None`。
- **発見7**: `pipe_output_to()` は `subscribe_output()` の結果を `tokio::spawn` でループ。`Closed` で break、`Lagged` で warn。
- **発見8**: `snapshot()` は Mutex ロック後に `entries.iter().map(|(k,v)| (k.clone(), v.state.clone())).collect()`。

### RFC の実装

```rust
impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RegistryInner {
                entries: HashMap::new(),
                start_order: Vec::new(),
            })),
        }
    }

    pub async fn snapshot(&self) -> HashMap<String, ProcessState> {
        let guard = self.inner.lock().await;
        guard.entries.iter()
            .map(|(k, v)| (k.clone(), v.state.clone()))
            .collect()
    }

    pub async fn subscribe_output(&self, name: &str) -> Option<broadcast::Receiver<String>> {
        let guard = self.inner.lock().await;
        guard.entries.get(name).map(|e| e.output_tx.subscribe())
    }

    pub async fn pipe_output_to<F>(
        &self,
        name: &str,
        mut sink: F,
    ) -> Option<tokio::task::JoinHandle<()>>
    where
        F: FnMut(String) + Send + 'static,
    {
        let mut rx = self.subscribe_output(name).await?;
        let handle = tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(line) => sink(line),
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        // Lagged: 行が飛ぶ可能性があるが継続可能
                    }
                }
            }
        });
        Some(handle)
    }
}
```

### 設計上の制約

- `subscribe_output()` と `pipe_output_to()` は存在しないプロセス名に `None` を返す（`NotFound` エラーを返さない＝Optional で表現）
- `snapshot()` はレジストリが空でも空の `HashMap` を返す（エラーにならない）
- `new()` はパラメータ不要。空の entries + 空の start_order で初期化
- 既存の `#[derive(Debug)]` + `#[allow(dead_code)]` で RegistryInner/RegistryEntry の警告は抑制済み

## Test Plan

### ユニットテスト計画

| # | テストケース | 対象 | 種別 | 検証内容 |
|---|-------------|------|------|---------|
| 1 | `new_creates_empty_registry` | new | 正常系 | new() 後、snapshot が空の HashMap を返す |
| 2 | `snapshot_returns_all_states` | snapshot | 正常系 | エントリ追加後、snapshot が正しい state を返す |
| 3 | `subscribe_output_existing_process` | subscribe | 正常系 | 存在するプロセス名 → Some(Receiver) |
| 4 | `subscribe_output_nonexistent_process` | subscribe | 異常系 | 存在しないプロセス名 → None |
| 5 | `subscribe_output_receives_lines` | subscribe | 正常系 | Receiver で出力行を受信できること |
| 6 | `pipe_output_to_calls_sink` | pipe_output | 正常系 | sink に出力行が渡されること |

### ユニットテスト不可能な項目（例外）

なし。全てのメソッドは同期 (`new`) または tokio ランタイム上でテスト可能。

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `new`（作成）、`snapshot`（スナップショット取得）、`subscribe_output`（出力購読）、`pipe_output_to`（出力転送）
2. **一関数一責務**: `new` = 空作成、`snapshot` = 状態取得、`subscribe_output` = 購読チャンネル取得、`pipe_output_to` = sink 転送タスク生成
3. **既存コードへの変更は最小**: `impl ProcessRegistry` ブロックにメソッドを追加するのみ。既存の構造体定義・Clone impl・テストに変更なし。

## Acceptance Criteria

- [ ] `ProcessRegistry::new()` が空のレジストリを作成する
- [ ] `snapshot()` が全プロセス状態を返す
- [ ] `subscribe_output()` が既存プロセスに対して `Some(Receiver)` を返す
- [ ] `subscribe_output()` が存在しないプロセスに対して `None` を返す
- [ ] `pipe_output_to()` が sink に出力行を転送する
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の 61 テストが引き続き通過する

## Notes

### 依存関係

```
M0-3 (ProcessRegistry 構造体) ── M6-1 (基本API)
                                      ├── M7-1 (watch_loop)
                                      ├── M8-1 (spawn_one/start_all)
                                      ├── M9-1 (shutdown_all/stop)
                                      └── M12-1 (Tauri 統合)
```

- すべてのメソッドは `impl ProcessRegistry` 内に追加
- `RegistryInner` の `#[allow(dead_code)]` はメソッド追加により一部解決される（`snapshot()` が entries を読み取るため）
- 依存追加なし（既存の tokio features で全てカバー）

### 成果物

- 計画: context/0016-m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to/plan.md（未作成）
- 実装サマリ: context/0016-m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to/implementation.md（未作成）
- レビュー報告書: context/0016-m6-1-processregistrynew-snapshot-subscribe-output-pipe-output-to/review.md（未作成）
