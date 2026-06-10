# M10-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Cargo.toml` | 依存追加 | `tokio --features signal` |
| `src/signal.rs` | 新規作成 | `install_sigterm_handler` (cfg(unix)) |
| `src/lib.rs` | 修正 | `pub mod signal;` 追加 |

## 実装した関数

| 関数 | 説明 |
|------|------|
| `install_sigterm_handler(registry)` | SIGTERM受信→shutdown_all→exit(0) |

## 検証結果

- `cargo check`: 警告ゼロ
- `cargo test`: 74/74 通過、1 ignored（0.02s）
- 品質チェック: issue 0
