# M4-2 実装計画

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/lib.rs` | 編集 | start_server(), new_with_auto_start(), impl Drop, shutdown_signal() + STUB削除 + #[allow(dead_code)]除去 |
| `crates/ggufrs/src/server/mod.rs` | 編集 | M4-2 STUB コメント削除 |

## 実装手順
1. impl Drop for GgufEngine (server_handle.abort())
2. shutdown_signal() (Ctrl+C + SIGTERM)
3. GgufEngine::start_server(self: Arc<Self>, config: ServerConfig)
4. GgufEngine::new_with_auto_start(config: GgufConfig)
5. テスト追加 (Drop, shutdown_signal, new_with_auto_start)
6. server/mod.rs STUB 削除 + lib.rs STUB 削除 + #[allow(dead_code)] 除去

## 物理的レビュー方法
cargo check --all-targets → cargo test --lib → cargo fmt --check → cargo clippy

## Boy Scout 改善
- RFC §3.4 の expect() を tracing::warn + 継続に変更
