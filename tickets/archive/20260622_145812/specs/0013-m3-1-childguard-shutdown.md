---
ticket_id: 13
title: M3-1: ChildGuard 構造体と shutdown メソッドの実装
slug: m3-1-childguard-shutdown
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0013-m3-1-childguard-shutdown/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0013-m3-1-childguard-shutdown/review.md
---
# M3-1: ChildGuard 構造体と shutdown メソッドの実装

## Summary

M0-3 でスタブ（空構造体）として定義した `ChildGuard` を本実装に置き換える。`tokio::process::Child` をラップし、GracefulShutdown（Unix: SIGTERM→待機→SIGKILL、Windows: TerminateProcess）を実行するガードとする。`shutdown().await` で完了待機、Drop ではベストエフォートの `start_kill()` のみ。

## Background

ProcessRegistry の「運命共同体」の核心として、子プロセスが残留しないことを保証する必要がある。`ChildGuard` は `tokio::process::Child` をラップし、明示的な `shutdown()` または Drop 時に確実に子プロセスを終了させる。これにより、パニックや予期しない終了でも孤児プロセスが発生しないことを保証する。

**参照設計書:** docs/RFC-001-process-registry.md (§5.8)

## Scope

- `cargo add tokio --features process`（既存の sync feature に process を追加）
- `cargo add libc --target 'cfg(unix)'`（Unix 用 SIGTERM/SIGKILL）
- `crates/procreg/src/child.rs` の新規作成:
  - `ChildGuard` 構造体（child: Option<tokio::process::Child>, config: ShutdownTimeoutConfig）— `pub(crate)`
  - `ChildGuard::new(child, config)` — コンストラクタ
  - `pub async fn shutdown(mut self)` — take → graceful_shutdown を await
  - `async fn graceful_shutdown(child, config)` — cfg(unix) / cfg(windows) / cfg(not(any(...))) の内部実装
  - `impl Drop for ChildGuard` — `child.start_kill()` のみ（ベストエフォート）
- `crates/procreg/src/registry.rs` の修正:
  - 既存の `ChildGuard` スタブ定義を削除
  - `pub(crate) use crate::child::ChildGuard;` に置き換え
- `crates/procreg/src/lib.rs` の修正:
  - `pub mod child;` 宣言の追加
- ユニットテスト（`child.rs` 内 `#[cfg(test)] mod tests`）— `#[tokio::test]` を使用

## Non-scope

- `ProcessRegistry` の `shutdown_all()` / `stop()` メソッド（M9-1 のスコープ）
- `spawn_one()` での `ChildGuard::new()` 呼び出し（M8-1 のスコープ）
- PID probe を用いたプロセス生存確認（M4-1 のスコープ）
- `libc` 以外の Unix 依存

## Investigation

### コードベース調査結果

```
crates/procreg/
  ├── Cargo.toml             # tokio(sync), tokio-util(rt) 済み。process feature 未追加
  └── src/
      ├── lib.rs             # ShutdownTimeoutConfig 定義済み、モジュール宣言なし
      ├── registry.rs        # ChildGuard スタブ（空構造体）が定義済み
      └── ...
```

- **発見1**: 現在の `tokio` feature は `sync` のみ。`process` feature を追加して `tokio::process::Child` を使用可能にする必要がある。
- **発見2**: `ChildGuard` スタブは `registry.rs` の94〜105行目に定義。`pub(crate) struct ChildGuard;`（空）。このスタブ定義を削除し、`child.rs` の実装を参照するよう変更する。
- **発見3**: `ShutdownTimeoutConfig` は `lib.rs` に定義済み。`use crate::ShutdownTimeoutConfig;` で参照可能。
- **発見4**: Unix の graceful_shutdown は `libc::kill(pid, SIGTERM)` → `try_wait` ループ → `start_kill()`（SIGKILL）の順。`unsafe` が必要。
- **発見5**: Windows の graceful_shutdown は `start_kill()` → `wait()` の簡易実装。
- **発見6**: `tokio::process::Child` の `id()` は `Option<u32>` を返す（既に終了している場合は `None`）。
- **発見7**: テストは実プロセス（`sleep` 等）を使用するため `#[tokio::test(flavor = "multi_thread")]` が必要。
- **発見8**: `libc` は条件付き依存のため `cargo add --target 'cfg(unix)' libc` で追加する。

### RFC §5.8 の実装

```rust
pub(crate) struct ChildGuard {
    child: Option<tokio::process::Child>,
    config: ShutdownTimeoutConfig,
}

impl ChildGuard {
    pub fn new(child: tokio::process::Child, config: ShutdownTimeoutConfig) -> Self {
        Self { child: Some(child), config }
    }

    pub async fn shutdown(mut self) {
        if let Some(mut child) = self.child.take() {
            Self::graceful_shutdown(&mut child, &self.config).await;
        }
    }

    async fn graceful_shutdown(child: &mut tokio::process::Child, config: &ShutdownTimeoutConfig) {
        #[cfg(unix)]
        {
            if let Some(pid) = child.id() {
                unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM); }
            }
            let deadline = tokio::time::Instant::now() + config.unix_sigterm_timeout;
            loop {
                match child.try_wait() {
                    Ok(Some(_)) => return,
                    _ => {}
                }
                if tokio::time::Instant::now() >= deadline { break; }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            let _ = child.start_kill();
            let _ = child.wait().await;
        }

        #[cfg(windows)]
        {
            let _ = child.start_kill();
            let _ = tokio::time::timeout(
                config.windows_ctrl_break_timeout,
                child.wait(),
            ).await;
        }

        #[cfg(not(any(unix, windows)))]
        { compile_error!("Unsupported platform"); }
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.start_kill();
        }
    }
}
```

### 設計上の制約

- `shutdown()` は `self` を consume する（`mut self`）。2回呼べない設計。
- Drop は async を待てないため、`start_kill()` のみのベストエフォート。
- `unsafe { libc::kill(...) }` は Unix のみ。`// SAFETY:` コメントで pid の正当性を説明。
- `tokio::process::Child` は `id()` が Option — 既に終了している子プロセスを検出可能。
- `try_wait()` はノンブロッキング。ループ内で 50ms スリープしてポーリング。

## Test Plan

### ユニットテスト計画

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `new_holds_child` | 正常系 | `ChildGuard::new()` で child が保持されていること |
| 2 | `shutdown_after_new` | 正常系 | `shutdown().await` 後は child が None（take 済み）になっていること |
| 3 | `drop_does_not_panic` | 特性確認 | Drop がパニックしないこと（子プロセスなしの空ガードでも） |
| 4 | `shutdown_twice_blocked` | 特性確認 | 所有権移動により 2 回目の shutdown がコンパイルエラーになること（型による保証） |

### ユニットテスト不可能な項目（例外）

- 実プロセス（sleep 等）を使用した graceful_shutdown の動作確認 → M13-1 統合テストで実施
- cfg(unix)/cfg(windows) の分岐テスト → CI のプラットフォーム別テストで実施

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `shutdown`（シャットダウンを実行する）、`graceful_shutdown`（グレースフルシャットダウンを実行する）
2. **変数名はドメイン概念**: `child`（子プロセスハンドル）、`config`（タイムアウト設定）、`deadline`（タイムアウト時刻）、`pid`（プロセスID）
3. **``// SAFETY:`` コメント必須**: `libc::kill` の unsafe ブロックには pid の正当性を説明
4. **`lib.rs` の変更は最小差分**: `pub mod child;` 1行追加のみ
5. **`registry.rs` の変更はスタブ削除 + use に留める**: 既存の RegistryEntry 構造体は変更しない

## Acceptance Criteria

- [ ] `ChildGuard` が RFC §5.8 通りのフィールド（child: Option<Child>, config: ShutdownTimeoutConfig）を持つ
- [ ] `ChildGuard::new()` がコンストラクタとして機能する
- [ ] `shutdown().await` が child を take し graceful_shutdown を実行する
- [ ] Drop がパニックしない
- [ ] 既存のスタブ削除後も `RegistryEntry` が `child: Option<ChildGuard>` を参照できる
- [ ] `cargo check` が警告なく通過する（cfg(unix)/cfg(windows) の分岐を含む）
- [ ] 既存の 47 テストが引き続き通過する

## Notes

### 依存関係

```
M0-3 (ChildGuard スタブ) ── M3-1 (本実装)
                                    ├── M9-1 (shutdown_all: 逆順 child.shutdown().await)
                                    ├── M8-1 (spawn_one: ChildGuard::new())
                                    └── M11-1 (panic_hook: graceful_shutdown 直接呼び出し)
```

- `libc` 依存は `cfg(unix)` 条件付き
- `tokio process` feature は `tokio::process::Child` のために追加
- `#[tokio::test(flavor = "multi_thread")]` は子プロセスの非同期待機に必要

### 成果物

- 計画: context/0013-m3-1-childguard-shutdown/plan.md（未作成）
- 実装サマリ: context/0013-m3-1-childguard-shutdown/implementation.md（未作成）
- レビュー報告書: context/0013-m3-1-childguard-shutdown/review.md（未作成）
