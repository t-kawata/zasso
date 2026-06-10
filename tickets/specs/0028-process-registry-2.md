---
ticket_id: 28
title: process-registry: 親プロセス生死監視とサイドカー自殺機構
slug: process-registry-2
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: context/0028-process-registry-2/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0028-process-registry-2/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0028-process-registry-2/review.md
---
# process-registry: 親プロセス生死監視とサイドカー自殺機構

## Summary

`crates/procreg` に、親プロセス（アプリケーション）の生死を監視し、親が死んだ場合に子プロセス（サイドカー）が自動終了する機構を追加する。

これにより、Ctrl+C・パニック・SIGTERM・クラッシュ等のあらゆる経路で孤児プロセスが残留するのを防止する。

## Background

チケット #26 導入後の観測:

| 経路 | 親の運命 | 子の運命 |
|------|---------|---------|
| Ctrl+C | ExitRequested → spawn (fire&forget) → 即終了 | ✅ ChildGuard::drop → start_kill でカバー |
| パニック | install_panic_hook → shutdown_all | ✅ 専用スレッドで完了 |
| SIGTERM | tokio::signal → shutdown_all | ✅ install_sigterm_handler |
| **SIGKILL / 即死クラッシュ** | プロセス即死 | ❌ **孤児化** |

パニック・SIGTERM は process-registry の既存機構でカバーできている。しかし、**アプリが shutdown_all を実行できないまま死ぬ経路**（SIGKILL、セグフォ等の即死、ExitRequested が非同期で完了前に落ちる）では、子プロセスは孤児として残留する。

チケット #27（ポート競合検出）は **新規起動時**の安全を担保する。このチケット #28 は **既存プロセスの孤児化防止**を担当する。両者で二重の安全を確保する。

## 設計の選択肢

### 選択肢A: プロセス起動前の OS 機構（推奨）
各プラットフォームのプロセス機構を利用し、子プロセスが親の死を自動検知する。

| OS | 機構 | 効果 |
|----|------|------|
| Linux | `prctl(PR_SET_PDEATHSIG, SIGTERM)` → `pre_exec` | 親が死ぬと kernel が子に SIGTERM 送信。SIGKILL でも動作 |
| macOS | 同等のOS機構が**存在しない** | 別方式が必要 |
| Windows | `Job Object` + `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` | 親が死ぬと Job 内の全子プロセスが強制終了 |

- Linux: ✅ 完全。pre_exec フックで設定可能
- Windows: ✅ 完全。CreateJobObject + AssignProcessToJobObject
- macOS: ❌ カーネルレベルの親死検知機構なし

### 選択肢B: 監視スレッド（std::thread）
親プロセス内で `std::thread` を起動し、定期的に自プロセス (`getppid()` / 親PIDの生存) を監視する。

```
[監視スレッド] → sleep(1) → is_process_alive(parent_pid)? → No → shutdown_all()
```

- ✅ 全プラットフォームで動作する
- ❌ `exit()` / SIGKILL ではスレッドも即死するため検知不可
- ❌ `shutdown_all()` の完了を待たずにプロセスが終了する可能性

### 選択肢C: 別プロセス監視（Watchdog）
親プロセスから別プロセス（watchdog）を fork/spawn し、watchdog が親PIDを監視する。

```
[親プロセス] ← spawn → [Watchdogプロセス]
                              ↓ periodic check
                        is_process_alive(parent)?
                              ↓ No
                        kill(all_children)
```

- ✅ SIGKILL でも watchdog は独立プロセスのため生き残る
- ✅ `is_process_alive` が既に実装済み（platform.rs）
- ❌ プロセスフォークの複雑さ（Windows では CreateProcess）
- ❌ 余分なプロセス1つが常駐する

### 推奨: 選択肢A（Linux/Windows）＋ 選択肢B（macOS fallback）

| プラットフォーム | 方式 | 信頼性 |
|----------------|------|--------|
| Linux | pdeathsig (pre_exec) | 🟢 完全（SIGKILLでも動作） |
| Windows | Job Object | 🟢 完全 |
| macOS | 監視スレッド (std::thread) | 🟡 ベストエフォート（exit/SIGKILL不検知） |

macOS のギャップは、チケット #27（ポート競合検出）との組み合わせで補う：
- 孤児が発生しても、次回起動時にポート競合でブロックされる
- つまり macOS でも「孤児がいる間は新規起動不可」が担保される

## Scope

1. **`spawn_one()` に環境変数 `PROCREG_PARENT_PID` を追加** — 子プロセスが親PIDを知る手段として（子が自力監視したい場合に備えて）
2. **Linux: `pre_exec` で `prctl(PR_SET_PDEATHSIG, SIGTERM)` を設定** — `tokio::process::Command` の pre_exec フック
3. **Windows: CreateJobObject でプロセスグループ管理**（別途スコープ判断）
4. **macOS: 監視スレッドの起動関数 `install_parent_monitor(registry)` を追加** — `std::thread` + `is_process_alive` 定期チェック
5. **テスト**: pre_exec 設定のコンパイル確認、監視スレッドの型安全性確認

## Non-scope

- チケット #27（ポート競合検出。先に着手する）
- Tauri 側の `ExitRequested` ハンドラ修正（別チケット）
- macOS 用 watchdog プロセス（選択肢C。必要性が確認された場合に別チケット）

## Investigation

### 証拠1: 現在の子プロセス生存確認は「子→親」方向しかない

**ファイル**: `crates/procreg/src/platform.rs`

`is_process_alive(pid)` は子プロセスの生存確認に使用されている（watch_loop の PID probe）。この関数は「親から子を見る」方向であり、逆方向（子から親を見る）には使用されていない。関数自体は双方向に使える汎用性を持つ。

### 証拠2: pre_exec フックは tokio::process::Command で利用可能

**ファイル**: `crates/procreg/src/spawn.rs:53-59行目`

```rust
let mut cmd = tokio::process::Command::new(&def.program);
cmd.args(&def.args);
for (k, v) in &def.env {
    cmd.env(k, v);
}
```

`tokio::process::Command` は `std::os::unix::process::CommandExt` を実装しており、`pre_exec(closure)` が利用可能。Linux ではここで `prctl(PR_SET_PDEATHSIG)` を設定できる。

### 証拠3: 監視スレッド方式は既存APIと親和性が高い

**関数構成案**:
```rust
/// 親プロセス監視スレッドを起動する。
/// 
/// 別スレッドで定期的に親PIDの生存確認を行い、
/// 親が死んでいる場合は全子プロセスを強制停止する。
pub fn install_parent_monitor(registry: ProcessRegistry) { ... }
```

`install_panic_hook(registry)` と同じパターンで利用できる。スレッド内で親PIDを保持し、`is_process_alive` で定期確認する。

## Test Plan

### ユニットテスト計画

| # | テスト | 内容 | 種別 |
|---|-------|------|------|
| 1 | `parent_env_var_is_set` | spawn_one 後に子プロセスの環境に `PROCREG_PARENT_PID` が設定されている | 正常系 |
| 2 | `pre_exec_pdeathsig_compiles` | cfg(unix) + cfg(target_os = "linux") で pre_exec がコンパイル可能 | コンパイル |
| 3 | `install_parent_monitor_type_check` | `install_parent_monitor(ProcessRegistry)` が型チェックを通る（スレッドセーフ性） | コンパイル |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| pdeathsig の実動作確認 | 実際の親プロセス kill が必要。process-registry の統合テスト（test_fate_sharing）と同様に実機での E2E 相当 |
| macOS 監視スレッドによる孤児防止 | スレッドのタイミング依存。実際に親を kill したときの孤児検知は E2E テストでのみ確認可能 |
| Windows Job Object | Windows 実機または CI が必要 |

## Boy Scout Rule — 翻訳可能性計画

- `install_parent_monitor()` は関数名が動詞句（「親監視を設置する」）であり散文として読める
- `pre_exec` クロージャ内の `prctl` 呼び出しには SAFETY コメントを必須とする（unsafe コードのため）
- 監視スレッドのループは「一定秒数ごとに親PIDを確認し、死んでいたら全プロセスを停止する」と読めるように実装する
- Linux 以外の cfg フォールバックは安全側に倒す（落ちるより監視なしがマシ）

## Acceptance Criteria

- [ ] 子プロセスの環境変数に `PROCREG_PARENT_PID` が設定される
- [ ] Linux: `pre_exec` による `prctl(PR_SET_PDEATHSIG, SIGTERM)` が設定される（`// SAFETY:` コメント付き）
- [ ] `install_parent_monitor(registry)` 関数が公開され、`std::thread` + `is_process_alive` の定期監視が動作する
- [ ] process-registry 既存76テスト + 新規テストが全パスする
- [ ] コンパイルが全ターゲット（macOS/Linux/Windows）で成功する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0028-process-registry-2/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0028-process-registry-2/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0028-process-registry-2/review.md（未作成、/review-ticket 全チェック通過後に作成）
