# 実装サマリー: 子プロセス永久死検知と親プロセス連鎖停止（チケット #30）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/src/watch.rs` | 修正 | start_watch_task/watch_loop に ProcessRegistry 引数追加。リトライ上限到達時と spawn 失敗時に shutdown_all() 呼び出し追加 |
| `crates/procreg/src/registry.rs` | 修正 | start_watch_task() 呼び出しに self.clone() 追加 |

## 変更内容

watch.rs の2箇所に shutdown_all() を追加：

1. リトライ上限到達時（next_delay が None → 再起動不能）:
   → `entry.state = Failed` → `registry.shutdown_all().await`

2. 再起動 spawn 失敗時（spawn_one がエラー）:
   → `entry.state = Failed` → `registry.shutdown_all().await`

両方とも Mutex 解放後に shutdown_all を呼ぶことでデッドロックを回避。

## Boy Scout 改善
- watch_loop の古いコメント（M8-1 スタブ参照等）を現状に合わせて更新
- `#[allow(dead_code)]` を削除（start_watch_task/watch_loop は常に使用中）

## テスト結果
- 全テスト: 84 passed
- run-quality-checks: 0 issues
