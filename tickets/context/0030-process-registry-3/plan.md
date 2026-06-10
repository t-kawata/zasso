# 計画: 子プロセス永久死検知と親プロセス連鎖停止（チケット #30）

## 要件

`watch_loop` 内で、リトライ上限到達時および再起動 spawn 失敗時に `ProcessRegistry::shutdown_all()` を呼び出し、子プロセスの永久死を検知して親ごと停止する。

これで「親が死ねば子も死ぬ、子が永久に死ねば親も死ぬ」が完成する。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/watch.rs` | 修正 | `start_watch_task()` / `watch_loop()` に `ProcessRegistry` 引数追加。リトライ上限到達時と spawn 失敗時に `shutdown_all()` 呼び出し追加 |
| `crates/procreg/src/registry.rs` | 修正 | `start_all()` 内の `start_watch_task()` 呼び出しに `self.clone()` 追加 |

変更行数: 約5行

## Boy Scout 改善（スコープ外の翻訳可能性修正）

- `watch.rs` の古いコメント（「M8-1 完了後」「スタブ」等のチケット番号参照コメント）を現状に合わせて更新
- `start_watch_task` の `#[allow(dead_code)]` は `registry.rs` から参照されているため削除可能

## テスト計画

### ユニットテスト計画

| # | テスト | 内容 | 種別 |
|---|-------|------|------|
| 1 | `exhaust_retries_shuts_down_registry` | `watch_loop` にレジストリを渡し、リトライ上限到達後にレジストリの状態が Stopped になる | 異常系 |
| 2 | `never_policy_does_not_shutdown` | `RestartPolicy::Never` では shutdown_all が呼ばれず、Failed 状態で停止する | 正常系 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際のプロセス連鎖停止 | `std::process::exit` 相当の動作が必要。統合テストで確認 |

## 実装手順

### Step 1: watch.rs — `start_watch_task()` / `watch_loop()` に引数追加

```rust
pub(crate) fn start_watch_task(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
    registry: ProcessRegistry,  // ← 追加
) {
    tokio::spawn(async move {
        watch_loop(inner, def, exit_rx, cancel_token, registry).await;
    });
}

async fn watch_loop(
    inner: Arc<Mutex<RegistryInner>>,
    def: ProcessDef,
    mut exit_rx: tokio::sync::oneshot::Receiver<Option<i32>>,
    cancel_token: tokio_util::sync::CancellationToken,
    registry: ProcessRegistry,  // ← 追加
) {
```

### Step 2: watch.rs — リトライ上限到達時に shutdown_all を追加

```rust
// 現在: watch.rs:118-131
None => {
    let mut guard = inner.lock().await;
    if let Some(entry) = guard.entries.get_mut(&def.name) {
        entry.state = ProcessState::Failed { ... };
        entry.child = None;
    }
    // リトライ上限に達した = 子は永久に復帰しない → アプリ全体を停止する
    registry.shutdown_all().await;  // ← 追加
    return;
}
```

### Step 3: watch.rs — spawn 失敗時にも shutdown_all を追加

```rust
// 現在: watch.rs:186-196
Err(e) => {
    let mut guard = inner.lock().await;
    if let Some(entry) = guard.entries.get_mut(&def.name) {
        entry.state = ProcessState::Failed { ... };
    }
    // 再起動の spawn に失敗した → 子は永久に復帰しない → アプリ全体を停止する
    registry.shutdown_all().await;  // ← 追加
    return;
}
```

### Step 4: registry.rs — `start_watch_task()` 呼び出しに registry を追加

```rust
// 現在: registry.rs:169-174
crate::watch::start_watch_task(
    Arc::clone(&self.inner),
    def.clone(),
    result.exit_rx,
    cancel_token.clone(),
    self.clone(),  // ← 追加
);
```

### Step 5: テスト

```bash
cd crates/procreg && cargo test --lib
```

## 物理的レビュー方法

1. `cargo test --lib` で全テストパス確認（84→86件）
2. `run-quality-checks.js` で静的品質チェック
3. 翻訳可能性 grep: 関数名・コメント確認

## リスク

| リスク | 確率 | 対策 |
|-------|------|------|
| デッドロック（Mutex × shutdown_all） | なし | shutdown_all 前に Mutex のスコープが閉じているため発生しない |
| `RestartPolicy::Never` で誤って shutdown | 低 | Never の分岐は `!should_restart` で早期 return するため shutdown_all に到達しない |
