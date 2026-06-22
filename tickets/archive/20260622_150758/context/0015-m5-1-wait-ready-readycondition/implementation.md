# M5-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Cargo.toml` | 依存追加 | `tokio --features net`（TcpStream） |
| `src/ready.rs` | 新規作成 | `wait_ready()` + 6テスト |
| `src/lib.rs` | 修正 | `pub mod ready;` 1行追加 |

## 実装した関数

`pub(crate) async fn wait_ready(condition, name, output_tx) -> Result<(), RegistryError>`
- Immediate → 即座に Ok
- Delay → `tokio::time::sleep`
- LogContains → broadcast subscribe + pattern match + timeout（チャンネル切断→SpawnFailed）
- TcpPort → TcpStream connect polling + timeout

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 61/61 通過（既存55 + M5-1:6、0.02s）
- 品質チェック: issue 0
- `lib.rs` 変更: 1行追加のみ（surgical diff 遵守）
