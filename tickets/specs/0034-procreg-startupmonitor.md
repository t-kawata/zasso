---
ticket_id: 34
title: procreg: 非同期起動モードと StartupMonitor イベント機構の追加
slug: procreg-startupmonitor
status: done
created_at: 2026-06-11
updated_at: 2026-06-11
plan_path: /Users/kawata/shyme/zasso/tickets/context/0034-procreg-startupmonitor/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0034-procreg-startupmonitor/implementation.md
---
# procreg: 非同期起動モードと StartupMonitor イベント機構の追加

## Summary

`process-registry` crate に、ブロックしない非同期起動モード `start_all_async` と、その起動完了/失敗を親プロセスが通知として受け取れる `StartupMonitor` を追加する。従来の `start_all` による同期起動モードは完全に維持され、選択できるようにする。

**zasso 側の変更**: `lib.rs` の `registry.start_all(defs)` を `start_all_async` に置き換え、タイムアウト監視タスクを追加する最小限の変更に留める。

## Background

### 問題

現在、`ProcessRegistry::start_all()` は直列同期的に動作する：

```
setup():
  Step 4: block_on(registry.start_all(defs))
            ├── spawn_one("bifrost")
            │   ├── watchdog 起動
            │   ├── wait_ready(TcpPort 3912, timeout=10s)  ← ここでブロック
            │   └── ChildGuard 登録 + watch_loop 開始
            └── setup 完了 → ウィンドウ表示
```

全てのサイドカーが `ReadyCondition` を満たすまで `setup()` が戻らず、Tauri ウィンドウ表示が遅延する。現在はサイドカーが bifrost 1つだが、将来増設されることが明らかであり（`sidecar.rs` に tensorzero のコメント定義あり）、直列起動は wall-clock がサイドカーの数×起動時間に線形に増加する。

### 要求

- アプリケーション本体（Tauri ウィンドウ）とサイドカーの起動を非同期化する
- 起動後、全子プロセスが正常に `ReadyCondition` を満たしたら親に通知される
- 一定時間内に全子プロセスの起動が完了しない場合、親は shutdown_all してアプリ全体を停止できる（運命共同体の維持）
- 従来の同期モードは完全に維持する（zasso 以外の利用者の互換性確保）

### 運命共同体の完全性担保

「親が死ねば子も死ぬ、子が永久に死ねば親も死ぬ」を非同期モードでも維持する。特に、**spawn_one 実行中に shutdown_all が呼ばれた場合に孤児 Watchdog プロセスが残留しないこと**を保証する必要がある。

## Scope

### procreg crate（責務の大部分）

1. **`resolve_start_levels()` の追加** (`graph.rs`)
   - 現状の `resolve_start_order()` は `Vec<String>`（フラットな順序リスト）を返す
   - 新関数 `resolve_start_levels()` は `Vec<Vec<String>>`（依存関係の深さでグループ化されたリスト）を返す：
     - Level 0: 依存なし（bifrost 等）
     - Level 1: Level 0 のプロセスに依存
     - Level 2: Level 1 のプロセスに依存（以下同）
   - 同一レベル内のプロセスは並列起動可能
   - ただし、Level N の起動は Level N-1 の全プロセスが Running になるまで開始しない（レベル間バリア）

2. **`RegistryError` に `Cancelled` バリアント追加** (`error.rs`)
   - `SpawnCancelled { name: String }` — spawn_one が shutdown_all により中断された
   - `StartupTimeout { ready: HashMap<String, ProcessState>, pending: Vec<String>, timeout: Duration }` — start_all_async のタイムアウト

3. **`spawn_one()` に cancel_token 監視を追加** (`spawn.rs`)
   - `wait_ready` と並行して `cancel_token.cancelled()` を `tokio::select!` で待機
   - キャンセルされた場合は即座に `Err(SpawnCancelled)` を返す
   - **ChildGuard の早期登録**: `cmd.spawn()` 成功直後に `entry.child = Some(child_guard)` を設定し、`shutdown_all` との競合を防止する

4. **`StartupMonitor` 型の追加** (`startup_monitor.rs` — 新規ファイル)
   - `ProcessRegistry::start_all_async(defs, timeout)` が返す monitor オブジェクト
   - `async fn wait_for_all(&self) -> Result<HashMap<String, ProcessState>, StartupTimeout>` — 全プロセスの初回起動完了を待機
   - `async fn snapshot(&self) -> HashMap<String, ProcessState>` — 途中経過を取得
   - `fn is_complete(&self) -> bool` — 完了済みか確認

5. ****`ProcessRegistry::start_all_async()` の追加** (`registry.rs`)**
   - `start_all` の内部ロジックを非同期ラッパーとして再実装
   - レベルごとにバリア同期：同一レベルのプロセスは `tokio::spawn` で並列起動
   - 各プロセスの初回 ReadyCondition 完了を oneshot で StartupMonitor に集約
   - レベル内のいずれかのプロセスが起動失敗した場合：
     - SpawnCancelled でキャンセルされていない = 真の起動失敗
     - → 未起動の全プロセスにキャンセルを伝播
     - → 全子プロセスを shutdown_all
     - → StartupMonitor にエラーを通知

6. **`watch_loop` に `once: bool` モードを追加** (`watch.rs`)
   - 初回起動時のみ「再起動しても Running 扱い」とする
   - StartupMonitor は初回 ReadyCondition 完了を通知後は watch_loop に完全に委譲する

### zasso side（最小限の変更）

1. **`lib.rs` setup フック内の変更のみ**
   - `block_on(registry.start_all(defs))` → `block_on(registry.start_all_async(defs, TIMEOUT))`
   - `tokio::spawn` で monitor のタイムアウト監視タスクを起動
   - 監視タスク内で `match monitor.wait_for_all().await`：
     - `Ok(())` → 通常起動。何もしない（すでにバックグラウンドで動作中）
     - `Err(StartupTimeout)` → `registry.shutdown_all().await; std::process::exit(1)`
   - その他（出力パイプ、パニックフック、Tauri State 登録）は変更なし

### テスト計画の新規追加 (procreg)

1. **`StartupMonitor` の単体テスト**
   - empty defs で即時 complete
   - single process で complete 通知
   - wait_for_all で起動完了確認
   - タイムアウト時のエラー通知

2. **`start_all_async` の統合テスト**
   - 単一プロセス、依存あり複数プロセス（ダイヤモンド含む）
   - 起動失敗時のキャンセル伝播 + shutdown_all 動作確認
   - shutdown_all と spawn_one の競合テスト（孤児プロセスの有無確認）

3. **`resolve_start_levels` の単体テスト**
   - linear, diamond, circular, unknown, single, empty
   - レベル分割の正当性確認

4. **`RegistryError::SpawnCancelled` / `StartupTimeout` のテスト**
   - Display、Error トレイトの確認
   - SpawnCancelled がシャットダウン時のみに発行されることの確認

## Non-scope

- フロントエンド（Quasar/Vue）の変更。フロントエンドは従来通り `snapshot()` で状態を取得する。起動完了を UI で表現するかは別チケット
- Tauri プラグインの追加
- Windows/macOS 固有のトリガー起動（ログイン時起動等）
- Watchdog binary の変更（非同期モードでも watchdog 層は変更不要）
- 既存の `start_all` / `shutdown_all` / `stop` / `snapshot` 等の公開API変更

## Investigation

### 調査1: 現状の起動フロー（registry.rs:111-180）

`start_all` は厳密な直列ループ：

```rust
// registry.rs:129
for name in &order {
    // (a) RegistryEntry を Pending で事前登録（registry.rs:134-148）
    // (b) spawn_one を await（ReadyCondition 完了までブロック）（registry.rs:150-158）
    // (c) Running 状態に更新 + child_guard 登録（registry.rs:160-167）
    // (d) start_watch_task で watch_loop 起動（registry.rs:169-176）
}
```

**エラー時の挙動**: 一つでも spawn_one が失敗すると即座に `?` で return。すでに起動済みのプロセスは**ロールバックされない**（孤児として残留しうる）。

### 調査2: 依存関係解決はレベル未対応（graph.rs:32-64）

`resolve_start_order` は `Result<Vec<String>>` を返す — フラットな順序リストのみ。レベル/グループに分割する機能は存在しない。

```
A → B → C の線形依存:     [A, B, C]
A → (B, C) → D のdiamond: [A, B, C, D] または [A, C, B, D]
```

依存のないプロセス（bifrost と tensorzero 等）も、必ず直列に起動される。

### 調査3: ChildGuard 未登録のレースウィンドウ（spawn.rs:105-166 / registry.rs:160-167）

**critical gap**: `cmd.spawn()`（spawn.rs:105）から `entry.child = Some(result.child_guard)`（registry.rs:166）までの間に、Watchdog プロセスは稼働しているが registry の `entry.child` は `None` の状態が続く。

```rust
// spawn.rs:105 — watchdog 稼働開始、まだ child 未登録
let mut child = cmd.spawn().map_err(...)?;

// ... stdout/stderr reader 起動 ...
// ... wait_ready ...（ここで最大10秒ブロックしうる）

// spawn.rs:189-190 — ChildGuard 作成（まだ registry に未登録）
let child_guard = ChildGuard::new(child, timeout_cfg);

// spawn.rs:192-206 — PID probe タスク起動

// SpawnResult を返して start_all のループ本体で登録（registry.rs:160-167）
// ここで初めて entry.child = Some(child_guard) になる
```

この gap 中に `shutdown_all()` が呼ばれた場合：

1. `entry.child` は `None` → `child.take()` は何も取得しない（registry.rs:199-203）
2. `cancel_token.cancel()` は発火するが、**`spawn_one` は cancel_token をチェックしていない** → wait_ready の完了まで継続
3. `state = Stopped` に設定される
4. `spawn_one` 完了後に `entry.child = Some(child_guard)` が無意味に書き込まれる
5. **Watchdog プロセス + 子プロセスが孤児として残留する**

### 調査4: spawn_one は cancel_token を監視していない（spawn.rs:53-212）

`spawn_one` 内で `cancel_token` が使われている箇所は stdout/stderr 読み取りタスクのみ（spawn.rs:128, 159）。**wait_ready は cancel_token を無視する**。

```rust
// spawn.rs:186 — キャンセル非対応
ready::wait_ready(&def.ready, &def.name, output_tx.clone()).await?;
```

`wait_ready` の中身は `select!` で待機するが（port.rs / ready.rs）、cancel_token を引数に取らない設計。

### 調査5: ProcessState の現状と拡張余地（state.rs:11-48）

6状態の enum。新状態の追加は不要（StartupMonitor が Registry とは独立して管理するため）。

```
Pending → Starting → Running ↔ Restarting → Failed | Stopped
```

`ProcessState` に影響する変更は、`SpawnCancelled` エラーで状態を `Failed { message: "cancelled" }` に遷移させることのみ。

### 調査6: RegistryError の現状（error.rs:14-65）

6バリアント。`Cancelled` や汎用 `Timeout` は未定義。新規追加が必要：

| 追加するバリアント | 役割 |
|---|---|
| `SpawnCancelled { name: String }` | spawn_one が明示的にキャンセルされた |
| `StartupTimeout { ready: ..., pending: ..., timeout: ... }` | start_all_async の全体タイムアウト |

### 調査7: 既存テストカバレッジ（tests/integration.rs）

3 テスト（1つは ignored）。カバー範囲：

| テスト | カバー | 不足 |
|--------|--------|------|
| test_start_and_stop | 単一プロセスの full lifecycle | エラーパス、競合状態 |
| test_depends_on_ordering | 3プロセス依存起動 | 部分失敗、並列起動 |
| test_fate_sharing | TCP エコーの full lifecycle | クラッシュ・再起動、レース条件 |

### 調査8: `sidecar.rs` の定義（zasso）

`ProcessDef` は1つ（bifrost）。`depends_on: vec![]`（最初のサイドカー）。`restart: RestartPolicy::on_crash_default()`。zasso 側の変更は `start_all()` → `start_all_async()` の置き換えとタイムアウトタスクの追加のみで済む。

### 調査9: `lib.rs` の setup フック

`block_on(registry.start_all(defs))` でブロック。setup 完了後に Tauri ウィンドウが描画される。

## Test Plan

### ユニットテスト計画

#### graph.rs への追加テスト（`resolve_start_levels`）

| テスト名 | 種別 | 入力 | 期待結果 |
|---------|------|------|---------|
| `levels_linear_dependency` | 正常系 | A→B→C（A依存なし、BはAに依存、CはBに依存） | `[["A"], ["B"], ["C"]]` |
| `levels_diamond_dependency` | 正常系 | A→(B,C)→D | `[["A"], ["B", "C"], ["D"]]`（B,Cの順序不定） |
| `levels_independent_processes` | 正常系 | A,B,C（すべて依存なし） | `[["A", "B", "C"]]`（順序不定） |
| `levels_mixed_deps` | 正常系 | A, B→C, D→C（A,B,D 依存なし、CはB,Dに依存） | `[["A", "B", "D"], ["C"]]` |
| `levels_single_process` | 境界値 | A（依存なし） | `[["A"]]` |
| `levels_empty` | 境界値 | 空リスト | `[]` |
| `levels_circular` | 異常系 | A→B→A | `Err(CircularDependency)` |
| `levels_unknown_dep` | 異常系 | A→B（B未定義） | `Err(UnknownDependency)` |

#### error.rs への追加テスト

| テスト名 | 種別 | 検証内容 |
|---------|------|---------|
| `spawn_cancelled_display` | 正常系 | Display 出力にプロセス名が含まれる |
| `spawn_cancelled_error_trait` | 正常系 | `std::error::Error` トレイト実装の確認 |
| `startup_timeout_display` | 正常系 | Display 出力にタイムアウト・pending一覧が含まれる |
| `startup_timeout_fields` | 正常系 | ready/pending/timeout フィールドの読み出し |

#### startup_monitor.rs のテスト（新規）

| テスト名 | 種別 | 検証内容 |
|---------|------|---------|
| `empty_defs_completes_immediately` | 正常系 | 空リストで `wait_for_all` が即座に `Ok` |
| `single_process_startup` | 正常系 | 1プロセス → wait_for_all で完了通知 |
| `multiple_processes_all_ready` | 正常系 | 3プロセス（依存なし）→ 全完了を通知 |
| `multiple_processes_with_timeout` | 異常系 | 決して Ready にならないプロセス → タイムアウトエラー |
| `snapshot_during_startup` | 正常系 | 途中経過が正しいこと（一部 Starting, 一部 Pending） |
| `is_complete_behavior` | 正常系 | 完了前後での `is_complete()` の真偽 |
| `cancel_propagates_to_pending` | 異常系 | 1プロセス失敗 → 未起動プロセスがキャンセルされる |
| `cancel_does_not_affect_running` | 異常系 | 既に Running のプロセスはキャンセル影響を受けない |

#### registry.rs への追加テスト（`start_all_async`）

| テスト名 | 種別 | 検証内容 |
|---------|------|---------|
| `start_all_async_single_process` | 正常系 | 単一プロセス起動後、monitor で完了確認 |
| `start_all_async_independent_processes` | 正常系 | 依存なし複数プロセスが並列起動されること |
| `start_all_async_dependency_levels` | 正常系 | A→B→C の依存でレベル順に起動されること |
| `start_all_async_partial_failure` | 異常系 | 一部プロセス起動失敗 → shutdown_all + エラー通知 |
| `start_all_async_duplicate_name` | 異常系 | 同一名のプロセスが2つある場合のエラー |

#### spawn.rs への追加テスト（cancel_token 監視）

| テスト名 | 種別 | 検証内容 |
|---------|------|---------|
| `spawn_one_cancelled_during_wait_ready` | 異常系 | wait_ready 中にキャンセル → `Err(SpawnCancelled)` |
| `child_guard_early_registration` | 正常系 | cmd.spawn 直後に child が RegistryEntry に登録される |
| `child_guard_early_registration_on_cancel` | 異常系 | キャンセル時も child_guard が適切に処理される |

#### integration.rs への追加（統合テスト）

| テスト名 | 種別 | 検証内容 |
|---------|------|---------|
| `test_start_all_async_full_lifecycle` | 統合 | start_all_async → monitor.wait_for_all → shutdown_all の full lifecycle |
| `test_start_all_async_startup_timeout` | 統合 | 故意にタイムアウトさせて shutdown_all されることの確認 |
| `test_start_all_async_race_shutdown` | 統合 | spawn_one 中に shutdown_all → 孤児プロセスゼロの確認 |
| `test_sequential_sync_still_works` | 統合 | 従来の start_all が変更後も動作することの互換性確認 |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| Watchdog バイナリの動作変更が不要であることの確認 | Watchdog 層は非同期起動に影響されない（理論的証明で十分）。追加テスト不要 |
| 実プロセスを使った「本当に孤児プロセスがゼロか」の確認 | 孤児プロセスの検出には OS レベルのプロセスリスト走査が必要。統合テストでカバーするが、PID 再利用等のエッジケースは除外 |
| Tauri 統合時の実動作 | `lib.rs` の変更は最小限であり、`block_on` の有無のみ。Tauri 環境なしでテスト可能 |

## Boy Scout Rule — 翻訳可能性計画

本チケットで触れる全ファイルに以下の改善を適用する：

### `graph.rs`
- `resolve_start_levels` 関数名は「起動レベルを解決する」として翻訳可能
- `toposort` → `level_map` → `level_order` の変換チェーンに中間変数で段落を区切る
- 既存の `resolve_start_order` は変更しない（互換性維持）

### `spawn.rs`
- `cancel_token` 監視の追加により、関数内の責務が「起動」から「起動＋キャンセル対応」に広がる
- 関数の序盤で `guard` の早期解放を明示的に段落として整理する
- `child_guard` の早期登録ブロックにコメント理由を追加（「なぜ early registration が必要か = shutdown_all との競合防止」）

### `registry.rs`
- `start_all_async` は「全てのプロセスを非同期で起動する」として翻訳可能
- レベルごとのバリア同期を select! で書く場合、コメントで「なぜバリアが必要か」を日本語で説明
- 内部にフラグメント化しそうなロジック（レベルグループ化、並列spawn、結果集約）は補助関数に抽出する
- 既存の `start_all` は変更しない — 自分は触らないコードを美しくする必要はない

### 新規 `startup_monitor.rs`
- `StartupMonitor` — 「起動監視器」として翻訳可能な名詞
- `wait_for_all` — 「全てを待つ」として翻訳可能な動詞句
- `is_complete` — 「完了しているか」として翻訳可能
- 型フィールドは全てドメイン名詞（`ready: HashMap<String, ProcessState>`, `pending: Vec<String>`, `deadline: Instant`）
- エラーハンドリング: `Option` の無音 `unwrap` 禁止、明示的な match または `?` 伝播

### 既存コードの翻訳可能性改善スコープ

本チケットでは以下を改善する（触ったところだけ）：

- `spawn.rs`: `spawn_one` 内で `guard` 変数がロックを保持している期間が曖昧 → ブロックごとに `drop(guard)` を明示
- `error.rs`: 新バリアントのフィールドは「なぜそのフィールドが必要か」をフィールドドキュメントで説明

## Acceptance Criteria

### 機能要件
- [ ] `ProcessRegistry::start_all_async(defs, timeout)` が追加され、`StartupMonitor` を返す
- [ ] `StartupMonitor::wait_for_all()` で全子プロセスの初回起動完了を await できる
- [ ] タイムアウト時は `Err(StartupTimeout)` が返る
- [ ] 起動失敗時はキャンセル伝播 + shutdown_all が動作する
- [ ] レベル間バリアにより、`depends_on` の依存関係が保たれる
- [ ] spawn_one 中に shutdown_all が呼ばれても孤児プロセスが残留しない（early ChildGuard registration + cancel_token 監視）
- [ ] 従来の `start_all` が完全に維持され、既存テストがすべて通過する

### 品質要件
- [ ] 翻訳可能性の検証が通っている
- [ ] 全ユニットテストが通過（追加テスト含む）
- [ ] 統合テストが通過（追加テスト含む）
- [ ] zasso 側の変更が最小限（`lib.rs` のみ）であること
- [ ] `cargo clippy -- -D warnings` が通過すること
- [ ] `cargo fmt` が通過していること

### 互換性要件
- [ ] `start_all` のシグネチャ変更がない
- [ ] 既存の `RegistryError` バリアントに破壊的変更がない
- [ ] `ProcessState` に変更がない
- [ ] `ProcessDef` / `RestartPolicy` / `ReadyCondition` に変更がない

## Notes

### 設計上の決定事項

1. **StartupMonitor は ProcessRegistry と別オブジェクト**: 混在させると状態機械が爆発するため。monitor は「初回起動が完了したか」の1回限りの通知に特化し、以降の再起動監視は従来の watch_loop に委譲する。

2. **`start_all_async` は `CancellationToken` を共有する**: monitor のタイムアウトタスクが cancel を発行できるようにし、spawn_one 内の cancel_token 監視と連動させる。

3. **レベル間のバリア同期**: `futures::future::join_all`（同一レベル内の並列起動）と、`join_all` の完了を待ってから次のレベルへ進む、という構造。これにより `depends_on` の依存関係を保証する。

4. **zasso 側のタイムアウト値**: 現状の `wait_ready` タイムアウト（10秒）に SetupMonitor 全体のタイムアウトを別途設定する。例：`start_all_async(defs, Duration::from_secs(30))` — 全サイドカーの起動完了を最大30秒待つ。

### 成果物

- 計画: context/0034-procreg-startupmonitor/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0034-procreg-startupmonitor/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0034-procreg-startupmonitor/review.md（未作成、/review-ticket 全チェック通過後に作成）
