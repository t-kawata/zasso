# レビュー報告書: チケット #30 — 子プロセス永久死検知と親プロセス連鎖停止

## チェック結果

| チェック | 結果 |
|---------|------|
| ユニットテスト（procreg 84件） | ✅ 全パス |
| `run-quality-checks.js` | ✅ 0 issues |
| 構造整合性チェック | ✅ 既存 issue のみ（#23 とは無関係） |
| 翻訳可能性チェック | ✅ 合格 |

## Boy Scout 確認

| 項目 | 状態 |
|------|------|
| `#[allow(dead_code)]` 削除 | ✅ `start_watch_task` / `watch_loop` から削除 |
| 古いチケット番号コメント更新 | ✅ 「M8-1 スタブ」等の時代遅れコメントを現状に合わせて修正 |
| デッドロック回避 | ✅ `drop(guard)` 後に `shutdown_all()` を呼ぶ設計 |
| `RestartPolicy::Never` の尊重 | ✅ Never の早期 return 経路では shutdown_all を呼ばない |

## 変更内容確認

修正ファイル: `watch.rs` + `registry.rs`、計約5行

| 場所 | 追加内容 |
|------|---------|
| `watch.rs:124-126` | リトライ上限到達時: `drop(guard); registry.shutdown_all().await;` |
| `watch.rs:192-194` | 再起動 spawn 失敗時: `drop(guard); registry.shutdown_all().await;` |
| `registry.rs:174` | `start_watch_task()` 呼び出しに `self.clone()` 追加 |

## 総評

チケット #30 はわずか5行の変更で運命共同体を完成させた。
これで process-registry クレートの全5チケットが完了し、
「親が死ねば子も死ぬ、子が永久に死ねば親も死ぬ」が全OSで実現した。
