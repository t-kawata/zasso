---
ticket_id: 14
title: M4-1: is_process_alive の実装（プロセス生存確認）
slug: m4-1-is-process-alive
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0014-m4-1-is-process-alive/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0014-m4-1-is-process-alive/review.md
---
# M4-1: is_process_alive の実装（プロセス生存確認）

## Summary

PID ベースのプロセス生存確認関数 `is_process_alive(pid: u32) -> bool` を実装する。Unix は `libc::kill(pid, 0)` + ESRCH チェック、Windows は `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`。PID 0 ガードにより、誤ったシグナル送信を防止する。

## Background

watch_loop はプロセス終了を PID probe（`is_process_alive` の定期ポーリング）で検出する。また、ChildGuard の graceful_shutdown 完了確認にも使用される。本実装により、プロセスの生死をクロスプラットフォームで判定できるようになる。

**参照設計書:** docs/RFC-001-process-registry.md (§10)

## Scope

- `cargo add windows --target 'cfg(windows)' --features Win32_System_Threading,Win32_Foundation`
- `crates/procreg/src/platform.rs` の新規作成:
  - `pub(crate) fn is_process_alive(pid: u32) -> bool`
  - PID 0 ガード（`pid == 0` → `true`）
  - Unix: `libc::kill(pid, 0)` + `std::io::Error::last_os_error()`
  - Windows: `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `CloseHandle`
  - その他: `true`（フォールバック）
- `crates/procreg/src/lib.rs` の修正:
  - `pub mod platform;` 宣言の追加
- ユニットテスト（`platform.rs` 内 `#[cfg(test)] mod tests`）

## Non-scope

- PID probe タスクの実装（M7-1 watch_loop のスコープ）
- `spawn_one` での PID=0 エラーチェック（M8-1 のスコープ）
- graceful_shutdown 完了確認への統合（M3-1 完了済み）

## Investigation

### コードベース調査結果

```
crates/procreg/
  ├── Cargo.toml             # libc(cfg(unix)) 済み。windows 未追加
  └── src/
      ├── child.rs           # M3-1 ChildGuard（libc::kill を graceful_shutdown で使用）
      └── ...
```

- **発見1**: `libc` は既に `[target."cfg(unix)".dependencies]` に追加済み（M3-1 で導入）。
- **発見2**: `windows` クレートは未追加。`cargo add windows --target 'cfg(windows)' --features Win32_System_Threading,Win32_Foundation` で追加する。
- **発見3**: `libc::kill(pid, 0)` はシグナルを送信せず、プロセスの存在確認のみを行う。戻り値 0 = 成功（プロセス存在）、ESRCH = プロセス不存在。
- **発見4**: `std::io::Error::last_os_error()` は最後の OS エラーを取得する。`raw_os_error()` で errno 値を比較可能。移植性安全な方法。
- **発見5**: `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)` はプロセスのハンドルを取得。成功 = プロセス存在、失敗 = 不存在。
- **発見6**: 自プロセスの PID は `std::process::id()` で取得可能。テストで使用する。
- **発見7**: 存在しない PID の例として、`u32::MAX` や `999999` 等を使用する（OS 依存だが、通常は存在しない PID として扱われる）。

### RFC §10 の実装

```rust
fn is_process_alive(pid: u32) -> bool {
    if pid == 0 { return true; }

    #[cfg(unix)]
    {
        unsafe {
            let result = libc::kill(pid as libc::pid_t, 0);
            result == 0
                || std::io::Error::last_os_error().raw_os_error()
                    != Some(libc::ESRCH)
        }
    }
    #[cfg(windows)]
    {
        use windows::Win32::System::Threading::{
            OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION
        };
        use windows::Win32::Foundation::CloseHandle;
        unsafe {
            let handle = OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION, false, pid
            );
            if let Ok(h) = handle {
                let _ = CloseHandle(h);
                true
            } else {
                false
            }
        }
    }
    #[cfg(not(any(unix, windows)))]
    { true }
}
```

### 設計上の制約

- PID 0 ガード: Unix の `kill(0, 0)` は常に成功する（プロセスグループ 0 のプロセスが存在すれば）ため、明示的に true を返す
- `unsafe` ブロックが必要（libc::kill、OpenProcess ともに unsafe）
- Windows の `OpenProcess` で取得したハンドルは `CloseHandle` で必ず解放する

## Test Plan

### ユニットテスト計画

| # | テストケース | 種別 | 検証内容 |
|---|-------------|------|---------|
| 1 | `pid_zero_returns_true` | 境界系 | PID=0 → true（安全弁） |
| 2 | `self_pid_returns_true` | 正常系 | `std::process::id()` → true（自プロセスは生存） |
| 3 | `dead_pid_returns_false` | 異常系 | 存在しない PID（例: 999999）→ false |
| 4 | `platform_builds` | 特性確認 | Unix / Windows / その他 の全プラットフォームでコンパイル可能であること |

**カバレッジ目標:** 全分岐網羅。PID=0、生存、非生存の3値網羅。

### ユニットテスト不可能な項目（例外）

- 実プロセスの生死を跨いだ検出（子プロセスを spawn して kill するテスト）→ M13-1 統合テストで実施
- cfg(windows) のテスト → Windows CI でのみ実行

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `is_process_alive` — 「プロセスが生存しているか」
2. **PID 0 ガードのコメント**: なぜ PID=0 で true を返すか（誤ったシグナル送信を防ぐ安全弁）を説明
3. **`// SAFETY:` コメント必須**: `libc::kill` の unsafe ブロックに pid の正当性を説明
4. **`lib.rs` の変更は最小差分**: `pub mod platform;` 1行追加のみ

## Acceptance Criteria

- [ ] `is_process_alive(0)` が true を返す
- [ ] `is_process_alive(self_pid)` が true を返す
- [ ] `is_process_alive(dead_pid)` が false を返す
- [ ] `lib.rs` に `pub mod platform;` が追加される
- [ ] `cargo check` が警告なく通過する（cfg(unix)/cfg(windows) 分岐を含む）
- [ ] 既存の 51 テストが引き続き通過する

## Notes

### 依存関係

```
M3-1 (ChildGuard: libc 追加済み) ── M4-1 (本チケット)
                                       └── M7-1 (watch_loop: PID probe で使用)
```

- `libc` は既に M3-1 で追加済み → 新規追加不要
- `windows` クレートは `cfg(windows)` 条件付きで新規追加
- `unsafe` ブロックは2箇所（Unix: libc::kill、Windows: OpenProcess）

### 成果物

- 計画: context/0014-m4-1-is-process-alive/plan.md（未作成）
- 実装サマリ: context/0014-m4-1-is-process-alive/implementation.md（未作成）
- レビュー報告書: context/0014-m4-1-is-process-alive/review.md（未作成）
