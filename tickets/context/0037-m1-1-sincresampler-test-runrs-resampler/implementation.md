# 実装サマリー: M1-1 SincResampler

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/mod.rs` | 新規 | `pub(crate) mod resampler;` + 後続チケットコメント |
| `src/pipeline/resampler.rs` | 新規 | MYCUTE から完全移植（5テスト含む） |
| `src/lib.rs` | 変更 | `pub(crate) mod pipeline;` + SincResampler/InternalResampler の pub re-export |
| `src/bin/test-run.rs` | 変更 | `test_resampler()` 追加、Stage 3/6 更新 |
| Cargo.toml | 変更 | rubato 3.0.0 → 0.16.2（MYCUTE 互換のため） |

## 検証結果

- cargo test: ✅ 39/39 PASS（既存34 + 新規5）
- cargo run --bin test-run: ✅ Stage 3/6 + [CONFIG] + [RESAMPLER] 表示
- cargo fmt: ✅ 整形済み

## 特記事項

- rubato は MYCUTE と同じ 0.16.x に固定した。3.0 から API が大きく変わっており、移植目的に合わないため
- `InternalResampler` と `SincResampler` を lib.rs から pub re-export している（test-run.rs が binary target のため pub(crate) ではアクセス不可のため）
- `src/pipeline/` ディレクトリを初めて作成。今後のパイプラインコンポーネント追加の基盤となる
