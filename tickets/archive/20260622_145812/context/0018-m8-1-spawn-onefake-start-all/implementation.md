# M8-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Cargo.toml` | 依存追加 | `tokio --features io-util` |
| `src/spawn.rs` | 新規作成 | `SpawnResult` + `spawn_one()` + 2テスト |
| `src/registry.rs` | 修正 | `start_all()` 追加 |
| `src/watch.rs` | 修正 | 再起動パス本実装 + `#[ignore]` 2件解除 |
| `src/lib.rs` | 修正 | `pub mod spawn;` 追加 |

## 実装した関数

| 関数 | 説明 |
|------|------|
| `spawn_one()` | Command→spawn→PID取得→stdout/stderr→wait_ready→ChildGuard→PID probe |
| `start_all()` | resolve_start_order→各プロセス: entry登録→spawn_one→watch_task |
| `watch_loop` 再起動パス | spawn_one 呼び出し + exit_rx 継続 + Failed エラーハンドリング |

## 検証結果

- `cargo check`: 警告ゼロ
- `cargo test`: 71/71 通過、1 ignored（stopped_state_exits）
- 品質チェック: issue 0
- dead_code 警告: `start_watch_task`, `watch_loop`, `spawn_one` すべて解消
