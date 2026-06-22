# 実装サマリー: M1-3 信号品質フィルタ

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/signal_filter.rs` | 新規 | `is_worthy_to_run_asr()` 純粋関数 + 7テスト |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod signal_filter;` 追加 |
| `src/lib.rs` | 変更 | `is_worthy_to_run_asr` の pub re-export |
| `src/bin/test-run.rs` | 変更 | `test_signal_filter()` 追加（4ケース） |

## 検証結果

- cargo test: ✅ 55/55 PASS
- cargo run --bin test-run: ✅ [SIGNAL_FILTER] 4テスト全て PASS
- cargo fmt: ✅ 整形済み
