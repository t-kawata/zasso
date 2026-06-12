# 実装成果: チケット #71 — M5-3 PairAligner

## 変更ファイル

| ファイル | 種別 | 変更内容 |
|----------|------|----------|
| crates/siprs/src/audio/bridge.rs | 追記 | TimedFrame<T> + PairAligner（6 メソッド）+ 10 tests |

## 実装内容

### TimedFrame<T>
- プライベート構造体: ts_mono: Instant, data: T
- PairAligner 内部でのみ使用

### PairAligner
- in_q / out_q: VecDeque<TimedFrame<Vec<i16>>>
- tolerance: Duration（new 時に ms 指定）
- try_pair(): RFC §25 アルゴリズム — tolerance 以内でペアリング、超過時は古い方をドロップ
- push_in / push_out: キュー末尾に追加
- flush_stale(now): threshold 未満のフレームを全削除
- pending_count(): (in_q.len(), out_q.len())

### unwrap/expect 排除
- 実装コード: pop_front()? で伝播
- テストコード: if let Some パターンで panic 回避

## テスト結果
- 203 tests PASS（既存 193 + 新規 10）
- 0 warnings
- Quality checks: 0 issues（unwrap/expect 排除後）
