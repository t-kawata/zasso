---
ticket_id: 32
title: Windows: procreg 統合テストがフリーズする問題の調査と修正
slug: windows-procreg
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
plan_path: C:\Users\kawat\shyme\zasso\tickets\context\0032-windows-procreg\plan.md
implementation_path: C:\Users\kawat\shyme\zasso\tickets\context\0032-windows-procreg\implementation.md
review_report_path: C:\Users\kawat\shyme\zasso\tickets\context\0032-windows-procreg\review.md
---
# Windows: procreg 統合テストがフリーズする問題の調査と修正

## Summary

`crates/procreg/` の統合テストが Windows 上でフリーズする問題を調査・修正する。原因として watchdog 内の `tasklist` 呼び出しのハング、`extract_watchdog()` の排他ロック問題、`spawn_one` の Windows 引数解釈の3つが疑われる。調査と修正を経て統合テストがタイムアウトなく完走する状態を目指す。

## Background

チケット #28〜#30 で process-registry の運命共同体（Fate Sharing）機構を実装した。この機構の要である watchdog バイナリは、親プロセスの生存を定期的に確認し、親が死んだら子プロセスを道連れにする仕組みを持つ。Windows では `tasklist` コマンドで親プロセスの生存確認を行っている。

`cargo test`（procreg）の統合テスト実行時に、テストの一部（`test_depends_on_ordering` と思われる）がフリーズする現象が確認されている。3件中2件しか結果が出ず、残りがタイムアウトまで待機する。

## Scope

- watchdog 内 `process_is_alive` の Windows 実装（`tasklist`）へのタイムアウト追加
- `extract_watchdog()` の Windows での動作検証と問題特定
- `spawn_one` の Windows 引数解釈の検証
- 原因特定後の修正とテスト追加
- 統合テストがフリーズしないことの確認

## Non-scope

- Unix 実装への変更（`kill` / `ps` 系の修正は含まない）
- watchdog バイナリ以外のプロセス管理機構の再設計
- process-registry のアーキテクチャ自体の変更
- すでにパスしている統合テストに対する変更

## Investigation

### 証拠: 統合テストのフリーズ現象

- **現象**: `cargo test`（procreg）の出力で統合テストが3件中2件しか完了せず、残り1件がタイムアウトまで戻ってこない
- **該当テスト（推定）**: `test_depends_on_ordering` — 複数プロセスの依存関係解決と起動順序を検証するテスト
- **確認方法**: 各テストにタイムアウトを付けて単体実行し、どのテストがフリーズするか特定する

### 原因A: watchdog 内 `process_is_alive`（crates/procreg/watchdog/src/main.rs:97-109行目）

```rust
#[cfg(windows)]
fn process_is_alive(pid: u32) -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH"])
        .output()                                       // ← タイムアウトなし
        .map(|o| {
            let out = String::from_utf8_lossy(&o.stdout);
            out.contains(&pid.to_string())
        })
        .unwrap_or(false)
}
```

**問題点**:
1. **タイムアウトなし**: `tasklist` の `output()` が永久に戻らない可能性がある。`tasklist` は通常即座に応答するが、ウイルス対策ソフトのスキャンやシステム負荷によりハングしうる。
2. **PID 文字列の部分一致リスク**: `out.contains(&pid.to_string())` で、例えば PID `1234` が `12345` の一部として誤検知される可能性がある（false positive）。ただしフリーズの原因にはならない。
3. **監視ループ（52-78行目）**: 1秒スリープ + `process_is_alive` の同期的呼び出し。`tasklist` がハングすると監視ループ全体がブロックされる。

### 原因B: `extract_watchdog()` の Windows 動作（crates/procreg/src/watchdog.rs:26-71行目）

```rust
pub(crate) fn extract_watchdog() -> Result<std::path::PathBuf, String> {
    let dir = std::env::temp_dir();
    let pid = std::process::id();
    let mut attempt = 0u32;

    loop {
        let path = dir.join(format!("procreg-watchdog-{pid}-{attempt}"));

        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)       // ← 排他ロック
            .open(&path)
        {
            Ok(mut file) => {
                file.write_all(WATCHDOG_BINARY)...;
                drop(file);

                #[cfg(unix)]
                { /* 実行権限付与 — Windows ではスキップ */ }

                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                attempt += 1;
                if attempt > 100 { /* エラー */ }
                continue;
            }
            ...
        }
    }
}
```

**問題点**:
1. **拡張子なしの一時ファイル**: `procreg-watchdog-{pid}-{attempt}` という拡張子 `.exe` なしのファイルを作成する。`CreateProcess` は通常 PATHEXT を自動試行するが、セキュリティポリシーによってはブロックされる可能性がある。
2. **排他ロック**: `create_new(true)` はファイル作成時に OS レベルで排他するが、Windows では実行中のプロセスがファイルをロックしたままになる可能性がある。同一テスト内で複数回 `extract_watchdog()` が呼ばれた場合に競合するか。
3. **デバッグログ不足**: 問題発生時に実際のパスやエラーが出力されず、原因特定が困難。

### 原因C: `spawn_one` の Windows 引数解釈（crates/procreg/src/spawn.rs:85-99行目）

```rust
// コマンド構成: watchdog -- <program> [args...]
let mut cmd = tokio::process::Command::new(&watchdog_path);
cmd.arg("--");
cmd.arg(&def.program);
cmd.args(&def.args);
```

**問題点**:
1. **`tokio::process::Command` は `std::process::Command` 経由で `CreateProcessW` を呼ぶ**: Windows では引数が1つのコマンドライン文字列に結合されて渡される。`--` 区切りは正しく watchdog 側でパースされるか？
2. **テストコードの Windows 対応（spawn.rs:228-236行目）**:
```rust
#[cfg(windows)]
let def = ProcessDef {
    name: "echo_test".to_string(),
    program: "cmd.exe".to_string(),
    args: vec!["/c".to_string(), "echo".to_string()],
    ...
};
```
`/bin/echo` の代わりに `cmd.exe /c echo` を使っている。これが watchdog 経由で正しく動作するかは未検証。

### 推奨調査手順

1. 各統合テストにタイムアウト（例: 30秒）を設定して単体実行し、どのテストがフリーズするか特定する
2. watchdog バイナリの `process_is_alive` にタイムアウト付き実行を追加する（`wait_timeout` クレートまたは非同期ラッパー）
3. `extract_watchdog()` のデバッグログを追加して実際のパスと作成状況を確認する
4. 以下の Windows 専用テストを追加して watchdog 経由のプロセス起動を検証する：
```rust
#[cfg(windows)]
#[tokio::test(flavor = "multi_thread")]
async fn test_watchdog_spawns_cmd_on_windows() {
    let watchdog_path = crate::watchdog::extract_watchdog().unwrap();
    let output = tokio::process::Command::new(&watchdog_path)
        .arg("--")
        .arg("cmd.exe")
        .arg("/c")
        .arg("echo hello")
        .output()
        .await;
    assert!(output.is_ok());
    let out = output.unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8_lossy(&out.stdout);
    assert!(stdout.contains("hello"));
}
```

## Test Plan

### ユニットテスト計画

| # | テスト | 対象 | 正常系 | 異常系 | 備考 |
|---|--------|------|--------|--------|------|
| 1 | `test_watchdog_spawns_cmd_on_windows` | watchdog 経由 cmd.exe 起動 | cmd.exe /c echo hello が成功する | — | `#[cfg(windows)]` のみ |
| 2 | `test_process_is_alive_with_timeout` | タイムアウト付き生存確認 | 生存PIDに対してtrueを返す | タイムアウト時にfalseを返す | モックまたは実際のtasklist |
| 3 | `test_extract_watchdog_on_windows` | watchdog 展開と実行権限 | 展開後バイナリが実行可能 | ディスクフル等のエラー | Windows 固有の確認 |
| 4 | 既存テストのタイムアウト付き実行 | `test_depends_on_ordering` 等 | 各テスト30秒以内に完了する | タイムアウト時に明確なエラー | 調査段階で特定後修正 |
| 5 | `test_watchdog_kill_on_parent_death` | watchdog の親死検知 | 親プロセス終了後に子がkillされる | — | Windows のみ、手動検証要 |

カバレッジ目標: 該当関数（`process_is_alive`, `extract_watchdog` のWindowsパス）は90%以上

### ユニットテスト不可能な項目（例外）

1. **`tasklist` の実際のハング再現**: OS のプロセス管理コマンドがハングする状況を意図的に作り出すことは困難。代わりに、タイムアウト付きラッパー関数の単体テストで「指定時間内に応答がない場合は false を返す」ロジックを検証する。
2. **親プロセス終了時の watchdog 動作（E2E）**: 実際に親プロセスを終了させて子プロセスが道連れされるかの検証は、統合テストまたは手動テストが必要。ユニットテストでは watchdog の `process_is_alive` が正しく false を返すことを確認するにとどめる。
3. **Windows のファイルロック挙動**: `create_new(true)` で作成したファイルを実行中に他プロセスが開こうとしたときの挙動は Windows カーネルに依存するため、ユニットテストでは検証不可。

## Boy Scout Rule — 翻訳可能性計画

1. **`process_is_alive` の責務明確化**: 現在の Windows 実装は「tasklist を実行して結果をパースする」という処理が1関数に詰め込まれている。以下のように分割して翻訳可能性を高める：
   - `run_tasklist_with_timeout(pid, timeout)` — tasklist コマンドの実行とタイムアウト処理
   - `parse_tasklist_output(output, pid)` — 出力から生存判定
   - `process_is_alive(pid)` — 上記2つを呼び出す統合関数
2. **`extract_watchdog` の定数抽出**: リトライ上限 `100` がハードコードされている。`MAX_EXTRACT_ATTEMPTS` として名前付き定数に抽出する。
3. **エラー握りつぶしの排除**: `let _ = Command::new("taskkill")...` の結果が握りつぶされている。最低限 `warn!` レベルのログ出力に変更する。
4. **コメントの日本語化**: 既存の英語コメント（例: `// /F は強制終了フラグ`）は維持しつつ、不足する「なぜ」を日本語で補完する。

## Acceptance Criteria

- [ ] Windows で `cargo test --test integration -- --test-threads=1` がフリーズせず完走する
- [ ] watchdog の `process_is_alive` にタイムアウト機構が追加されている（`tasklist` ハング耐性）
- [ ] 原因A（tasklist タイムアウト）が特定・修正されている
- [ ] 原因B（extract_watchdog の Windows 動作）または原因C（spawn_one 引数解釈）が問題であれば、それも特定・修正されている
- [ ] Windows 専用の watchdog 起動テスト（`test_watchdog_spawns_cmd_on_windows`）が追加されている
- [ ] `make test` が全プラットフォームでパスする（リグレッションなし）
- [ ] ハードコード値（リトライ上限100）が名前付き定数に抽出されている
- [ ] `taskkill` のエラーがログ出力されるようになっている

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0032-windows-procreg/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0032-windows-procreg/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0032-windows-procreg/review.md（未作成、/review-ticket 全チェック通過後に作成）
