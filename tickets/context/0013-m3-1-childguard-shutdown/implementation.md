# M3-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/Cargo.toml` | 依存追加 | `tokio`(process, time, rt, rt-multi-thread, macros), `libc`(cfg(unix)) |
| `crates/procreg/src/child.rs` | 新規作成 | `ChildGuard` 本実装（struct + new + shutdown + graceful_shutdown + Drop）+ 4テスト |
| `crates/procreg/src/registry.rs` | 修正 | ChildGuard スタブ削除 → `use crate::child::ChildGuard;` に置き換え |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod child;` 追加 |

## 実装した型・メソッド

| 要素 | 内容 |
|------|------|
| `ChildGuard` 構造体 | child: Option<Child>, config: ShutdownTimeoutConfig |
| `new()` | コンストラクタ |
| `shutdown().await` | self を消費、graceful_shutdown を await |
| `graceful_shutdown()` | cfg(unix): SIGTERM→wait→SIGKILL, cfg(windows): TerminateProcess |
| `Drop` | start_kill() のみベストエフォート |

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 51/51 通過（既存47 + M3-1:4、0.00s）
- 品質チェック: issue 0
- `// SAFETY:` コメント: ✅ 1件（libc::kill に記載）
- `lib.rs` 変更: 1行追加、`registry.rs` 変更: スタブ→use に置き換え（surgical diff）
