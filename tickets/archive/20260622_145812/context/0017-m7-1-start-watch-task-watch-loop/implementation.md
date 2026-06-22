# M7-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/watch.rs` | 新規作成 | `start_watch_task()` + `watch_loop()` + 3テスト |
| `src/registry.rs` | 修正 | RegistryInner/fields を `pub(crate)` に（他モジュールからのアクセス用） |
| `src/lib.rs` | 修正 | `pub mod watch;` 1行追加 |

## 実装した関数

| 関数 | 説明 |
|------|------|
| `start_watch_task(inner, def, exit_rx, cancel_token)` | tokio::spawn で watch_loop 起動 |
| `watch_loop(inner, def, exit_rx, cancel_token)` | イベント駆動監視ループ（select!）|

## フロー

```
select! → exit_rx | cancel_token
  ├── cancel → 即時 return
  └── exit → 状態確認 → policy 判定
        ├── Never → Failed 状態に遷移 → return
        ├── Stopped → return（stop() 優先）
        ├── next_delay=None → Failed（リトライ上限）
        └── next_delay あり → Restarting → delay
              └── TODO: M8-1 で再起動パス実装
```

## 検証結果

- `cargo check`: 警告ゼロ
- `cargo test`: 70/70 通過（既存67 + M7-1:3）
- 品質チェック: issue 0
