---
ticket_id: 30
title: process-registry: 子プロセス永久死検知と親プロセス連鎖停止
slug: process-registry-3
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: context/0030-process-registry-3/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0030-process-registry-3/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0030-process-registry-3/review.md
---
# process-registry: 子プロセス永久死検知と親プロセス連鎖停止

## Summary

`crates/procreg` の `watch_loop` に、リトライ上限到達時に子プロセスが「永久死」したと判断し、親プロセス（アプリケーション）ごと `shutdown_all()` で完全停止する機構を追加する。

これにより**「親が死ねば子も死ぬ、子が永久に死ねば親も死ぬ」**という完全な運命共同体が実現する。

## Background

現在の process-registry は以下の状態：

| 方向 | 完了 | 仕組み |
|------|------|--------|
| **親→子** | ✅ #29 Watchdog | 親が死んだら子も kill。全OS対応 |
| **子→親（今回）** | ❌ 未実装 | 子が死んでも親は Failed 状態で放置するだけ |

`RestartPolicy::OnCrash` は最大リトライ回数（デフォルト3回）に達すると `ProcessState::Failed` に遷移して `watch_loop` が終了するが、**親プロセスのアプリは動き続ける**。リトライ上限到達は「サイドカーがもう二度と復帰しない」ことを意味するが、それを親が無視して動き続けるのは運命共同体の設計思想に反する。

## Scope

1. **`start_watch_task()` に `ProcessRegistry` 引数を追加** — `shutdown_all()` を呼べるようにする
2. **`watch_loop()` に `ProcessRegistry` 引数を追加** — 同上
3. **リトライ上限到達時の分岐（`watch.rs:118-131`）に `registry.shutdown_all().await` を追加**
4. **再起動に失敗した場合の分岐（`watch.rs:186-196`）にも `registry.shutdown_all().await` を追加**
5. **`RestartPolicy::Never` の場合は shutdown_all しない** — 意図的な非再起動動作は尊重する
6. **テスト**: リトライ上限到達時の shutdown_all 呼び出し確認、既存テストの回帰確認

## Non-scope

- 新たな `RestartPolicy` バリアントの追加（`OnCrash` / `Always` の既存バリアントで動作）
- `RegistryError` の変更（新しいエラー型は不要）
- Tauri 側の変更

## Investigation

### 証拠1: リトライ上限到達時に shutdown_all がない

**ファイル**: `crates/procreg/src/watch.rs:118-131行目`

```rust
None => {
    let mut guard = inner.lock().await;
    if let Some(entry) = guard.entries.get_mut(&def.name) {
        entry.state = ProcessState::Failed { ... };
        entry.child = None;
    }
    return;  // ← ここで単に return するだけ。親は動き続ける
}
```

`return` する前に `registry.shutdown_all().await` を呼べば、全サイドカーを停止してから親も終了できる。

### 証拠2: 再起動 spawn 失敗時も同様

**ファイル**: `crates/procreg/src/watch.rs:186-196行目`

```rust
Err(e) => {
    let mut guard = inner.lock().await;
    if let Some(entry) = guard.entries.get_mut(&def.name) {
        entry.state = ProcessState::Failed { ... };
    }
    return;
}
```

こちらも spawn 自体の失敗で子が永久死したケース。同様に `shutdown_all()` が必要。

### 証拠3: `start_all()` は `start_watch_task()` を呼び出す

**ファイル**: `crates/procreg/src/registry.rs:169-174行目`

```rust
crate::watch::start_watch_task(
    Arc::clone(&self.inner),
    def.clone(),
    result.exit_rx,
    cancel_token.clone(),
);
```

ここに `self.clone()`（= ProcessRegistry）を追加で渡すだけでよい。

### 証拠4: ProcessRegistry は Clone（Arc::clone）

`ProcessRegistry::clone()` は `Arc::clone` であるため、`watch_loop` に渡してもコストはほぼゼロ。
`shutdown_all()` の非同期呼び出しも `start_watch_task` が `tokio::spawn` するタスク内で行うため問題ない。

### 証拠5: デッドロックは発生しない

`watch_loop` が `shutdown_all()` を呼ぶとき、すでに Mutex を release した後である（リトライ上限到達の分岐では、`let mut guard` のスコープが `return` で閉じている）。`shutdown_all()` 内の Mutex 取得と競合しない。

## Test Plan

### ユニットテスト計画

`crates/procreg/src/watch.rs` の `mod tests` に以下を追加：

| # | テスト | 内容 | 種別 |
|---|-------|------|------|
| 1 | `exhaust_retries_triggers_shutdown` | OnCrash の retry 上限到達時に `shutdown_all` 相当の処理が走る | 異常系 |
| 2 | `restart_spawn_failure_triggers_shutdown` | 再起動の spawn 失敗時に shutdown が走る | 異常系 |
| 3 | `never_policy_does_not_shutdown` | `RestartPolicy::Never` では shutdown しない | 正常系 |
| 4 | `start_watch_task_signature` | 新しいシグネチャでコンパイルが通る | コンパイル |

カバレッジ目標: `watch_loop` の全 return パスで shutdown の有無が確認されていること

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際のプロセス連鎖停止（子死→親終了） | 実際のプロセス kill が必要。統合テストで確認 |

## Boy Scout Rule — 翻訳可能性計画

- `start_watch_task` → `watch_loop` に `ProcessRegistry` を追加する際、引数名は `registry` とし「レジストリを受け取る」と読めるようにする
- リトライ上限到達時のコードは「再試行上限に達したため、サイドカーは永久に死亡したと判断し、アプリ全体を停止する」と読めるようにコメントを記述する
- `watch_loop` の引数が増えるため、doc コメントの処理説明も更新する

## Acceptance Criteria

- [ ] `start_watch_task()` が `ProcessRegistry` を受け取る新しいシグネチャになっている
- [ ] `watch_loop()` が `ProcessRegistry` を受け取る新しいシグネチャになっている
- [ ] リトライ上限到達時（`policy.next_delay()` が `None`）に `registry.shutdown_all().await` が呼ばれる
- [ ] 再起動 spawn 失敗時にも `registry.shutdown_all().await` が呼ばれる
- [ ] `RestartPolicy::Never` では shutdown_all が呼ばれない
- [ ] process-registry 既存84テストが全パスする

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0030-process-registry-3/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0030-process-registry-3/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0030-process-registry-3/review.md（未作成、/review-ticket 全チェック通過後に作成）
