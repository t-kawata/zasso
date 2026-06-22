---
ticket_id: 10
title: M0-3: プロセス状態とレジストリ型の定義（ProcessState, RegistryEntry, RegistryInner, ProcessRegistry）
slug: m0-3-processstate-registryentry-registryinner-processregistry
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0010-m0-3-processstate-registryentry-registryinner-processregistry/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0010-m0-3-processstate-registryentry-registryinner-processregistry/review.md
---
# M0-3: プロセス状態とレジストリ型の定義（ProcessState, RegistryEntry, RegistryInner, ProcessRegistry）

## Summary

プロセスのライフサイクルを表現する状態機械 `ProcessState` と、レジストリの内部構造 `RegistryEntry`・`RegistryInner`・`ProcessRegistry` を定義する。`ProcessState` は `serde::Serialize + Deserialize` を実装し Tauri フロントエンドに状態を返せるようにする。`RegistryEntry` は各プロセスの実行時状態を保持し、`ProcessRegistry` は `Arc<Mutex<RegistryInner>>` でスレッド安全な共有を実現する。

## Background

プロセスレジストリは複数のプロセスを同時に管理する。各プロセスは起動前に Pending、起動中は Starting、稼働中は Running、再起動待ちは Restarting、異常終了は Failed、正常停止は Stopped という6状態のライフサイクルを持つ。これらの状態をフロントエンド（Tauri）に JSON シリアライズして返すため、`serde` による derive が必要。

また、レジストリ内部では `ProcessDef`（M0-1）と `ProcessState` を紐付ける `RegistryEntry` と、全エントリを保持する `RegistryInner` を `Arc<Mutex<>>` でスレッド安全に共有する `ProcessRegistry` を定義する。

**参照設計書:** docs/RFC-001-process-registry.md (§5.5, §5.6, §5.7)

## Scope

- `cargo add serde --features derive && cargo add tokio --features sync && cargo add tokio-util --features rt && cargo add --dev serde_json`
- `crates/procreg/src/state.rs` の新規作成:
  - `ProcessState` 列挙型（6バリアント: Pending, Starting, Running { pid }, Restarting { attempt, retry_in_ms }, Failed { exit_code, message }, Stopped）
  - `#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]`
  - `#[serde(tag = "state", rename_all = "snake_case")]`
- `crates/procreg/src/registry.rs` の新規作成:
  - `ChildGuard` 構造体（スタブ: フィールドなし、M3-1 で本実装に置き換え） — `pub(crate)`
  - `RegistryEntry` 構造体（def, state, child: Option<ChildGuard>, output_tx: broadcast::Sender<String>, cancel_token: CancellationToken, restart_count）— `pub(crate)`
  - `RegistryInner` 構造体（entries: HashMap<String, RegistryEntry>, start_order: Vec<String>）
  - `ProcessRegistry` 公開構造体（inner: Arc<Mutex<RegistryInner>>）— `Clone`（Arc::clone）
- `crates/procreg/src/lib.rs` の修正:
  - `pub mod state;` + `pub mod registry;` + `pub use` の追加
  - crate doc の更新
- ユニットテスト（`state.rs` / `registry.rs` 内の `#[cfg(test)] mod tests`）

## Non-scope

- `ChildGuard` のメソッド実装（`shutdown()`、`graceful_shutdown()`、Drop impl）— M3-1 のスコープ
- `ProcessRegistry::new()` や `snapshot()`、`subscribe_output()` 等のメソッド — M6-1 のスコープ
- `spawn_one` / `start_all` / `shutdown_all` 等のライフサイクル管理 — Phase 2 のスコープ
- `restart_count` をインクリメントするロジック — M7-1 のスコープ

## Investigation

### コードベース調査結果

```
crates/procreg/
  ├── Cargo.toml          # thiserror, anyhow 追加済み
  ├── Tickets.md
  └── src/
      ├── lib.rs          # M0-1（4型）+ M0-2（error.rs モジュール宣言）
      ├── error.rs        # RegistryError（5バリアント + 9テスト）
```

- **発見1**: `Cargo.toml` に `serde`、`tokio`、`tokio-util` は未追加。`cargo add` で追加する。
- **発見2**: `tokio` の feature は `sync`（`broadcast::Sender`、`Mutex`）のみで十分。`tokio-util` の feature は `rt`（`CancellationToken`）のみ。
- **発見3**: `ProcessState` の `Restarting` バリアントは `retry_in: Duration` ではなく `retry_in_ms: u64` で保持する（RFC §5.5 注釈: `Duration` は serde 非対応のため）。
- **発見4**: `Failed` の `exit_code` は `Option<i32>`（プロセスがシグナルで kill された場合など終了コードが取得できないケースに対応）。
- **発見5**: `RegistryEntry` は `child: Option<ChildGuard>` を必要とするが、`ChildGuard` の本実装は M3-1。本チケットでは最小限のスタブ（空の構造体）を定義し、`pub(crate)` で参照可能にする。M3-1 で本実装に置き換える。
- **発見6**: `serde_json` は dev-dependencies として追加（テストの JSON ラウンドトリップにのみ使用）。

### RFC §5.5–§5.7 の型定義

ProcessState:
```rust
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ProcessState {
    Pending,                                    // start_all()への登録待ち
    Starting,                                   // ReadyCondition待機中
    Running { pid: u32 },                        // 正常稼働中
    Restarting { attempt: u32, retry_in_ms: u64 }, // 再起動待ちディレイ中
    Failed { exit_code: Option<i32>, message: String }, // リトライ上限到達
    Stopped,                                    // shutdown_all()で正常停止
}
```

RegistryEntry（内部型）:
```rust
pub(crate) struct RegistryEntry {
    pub def: ProcessDef,
    pub state: ProcessState,
    pub child: Option<ChildGuard>,
    pub output_tx: broadcast::Sender<String>,
    pub cancel_token: CancellationToken,
    pub restart_count: u32,
}
```

ProcessRegistry（公開型）:
```rust
pub struct ProcessRegistry {
    inner: Arc<Mutex<RegistryInner>>,
}

struct RegistryInner {
    entries: HashMap<String, RegistryEntry>,
    start_order: Vec<String>,
}

impl Clone for ProcessRegistry {
    fn clone(&self) -> Self {
        Self { inner: Arc::clone(&self.inner) }
    }
}
```

### 設計上の制約

- `ProcessState` は `serde_json` で JSON ラウンドトリップ可能であること
- `Restarting` の `retry_in_ms` は `u64`（ミリ秒）
- `Failed` の `exit_code` は `Option<i32>`（シグナル kill 等でコードが取れない場合がある）
- `ProcessRegistry` + `Clone` は `Arc::clone` により内部状態共有を実現
- `RegistryEntry` は `pub(crate)`（クレート内のみ可視）

## Test Plan

### ユニットテスト計画

| # | テストケース | 対象 | 種別 | 検証内容 |
|---|-------------|------|------|---------|
| 1 | `process_state_pending_serde` | state.rs | 正常系 | Pending → JSON → デコード一致 |
| 2 | `process_state_starting_serde` | state.rs | 正常系 | Starting → JSON → デコード一致 |
| 3 | `process_state_running_serde` | state.rs | 正常系 | Running { pid: 42 } → JSON → デコード一致（pid 保持） |
| 4 | `process_state_restarting_serde` | state.rs | 正常系 | Restarting { attempt: 2, retry_in_ms: 3000 } → JSON → デコード一致 |
| 5 | `process_state_failed_serde` | state.rs | 正常系 | Failed { exit_code: Some(1), message } → JSON → デコード一致 |
| 6 | `process_state_failed_no_exit_code` | state.rs | 境界系 | Failed { exit_code: None, message } → JSON → デコード一致 |
| 7 | `process_state_stopped_serde` | state.rs | 正常系 | Stopped → JSON → デコード一致 |
| 8 | `process_state_tag_name` | state.rs | 特性確認 | JSON 出力の `"state"` タグが snake_case であること（`"running"`, `"restarting"`, `"failed"` 等） |
| 9 | `registry_inner_new` | registry.rs | 正常系 | `RegistryInner` の全フィールド初期化とアクセス |
| 10 | `process_registry_clone_is_arc_clone` | registry.rs | 特性確認 | `ProcessRegistry::clone()` 後、片方の inner を変更すると両方に影響すること（`Arc::clone` の確認） |

**カバレッジ目標:** `ProcessState` 全6バリアントの serde ラウンドトリップ 100%。`ProcessRegistry` の Clone 挙動確認。

### ユニットテスト不可能な項目（例外）

- `RegistryEntry.child` の実動作確認（`ChildGuard` スタブのため M3-1 完了後に実施）
- `broadcast::Sender` の実際の送受信テスト（M6-1 のスコープ）

## Boy Scout Rule — 翻訳可能性計画

1. **バリアント名はライフサイクル段階を名詞/現在分詞で表現**: `Pending`, `Starting`, `Running`, `Restarting`, `Failed`, `Stopped` — コードだけで状態遷移が散文として読める
2. **フィールド名は単位を明示**: `retry_in_ms`（「ミリ秒単位の再試行待ち時間」）、`exit_code`（「プロセスの終了コード」）
3. **`lib.rs` の変更は最小差分**: `pub mod state;` + `pub mod registry;` + `pub use` のみ。既存コード無改変
4. **コメントは「なぜ」を説明**: `retry_in_ms` が `u64` である理由（`Duration` は serde 非対応）を doc コメントで説明
5. **`ChildGuard` スタブには TODO コメント**: 本実装が M3-1 であることを明記し、後続作業者が迷わないようにする

## Acceptance Criteria

- [ ] `serde`（derive）、`tokio`（sync）、`tokio-util`（rt）、`serde_json`（dev）が `cargo add` で追加される
- [ ] `ProcessState` が RFC §5.5 通りの6バリアント + serde derive を持つ
- [ ] `ProcessState` の JSON シリアライズ/デシリアライズが全バリアントでラウンドトリップする
- [ ] `ChildGuard` スタブ（空構造体）が `pub(crate)` で定義されている
- [ ] `RegistryEntry` が RFC §5.6 通りの全フィールドを持つ
- [ ] `RegistryInner` が entries + start_order を持つ
- [ ] `ProcessRegistry` が `Arc<Mutex<RegistryInner>>` で定義され、`Clone` は `Arc::clone`
- [ ] 全10テストケースが通過する
- [ ] `cargo check` が警告なく通過する
- [ ] 既存の M0-1 + M0-2 テスト（22件）が引き続き通過する

## Notes

### 依存関係

```
M0-1 (ProcessDef) ──────┐
                         ├── M0-3 (本チケット)
M0-2 (RegistryError) ────┘       │
                                  ├── M3-1 (ChildGuard 本実装) ── child フィールドの実体化
                                  ├── M6-1 (ProcessRegistry メソッド) ── new/snapshot/subscribe 等
                                  └── M8-1 (spawn_one/start_all) ── RegistryEntry 生成
```

- `ChildGuard` スタブは M3-1 で本実装に置き換わることを前提とする
- `broadcast::Sender` と `CancellationToken` はこの段階では構築のみで、実際の送信/キャンセルは後続チケット

### 成果物

- 計画: context/0010-m0-3-processstate-registryentry-registryinner-processregistry/plan.md（未作成）
- 実装サマリ: context/0010-m0-3-processstate-registryentry-registryinner-processregistry/implementation.md（未作成）
- レビュー報告書: context/0010-m0-3-processstate-registryentry-registryinner-processregistry/review.md（未作成）
