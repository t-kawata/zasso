# 実装サマリー: M2-1 VadProcessor

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | `cargo add sherpa-rs && cargo add sherpa-rs-sys` |
| `src/pipeline/vad.rs` | 新規 | VadProcessor 完全移植（MYCUTE から、Windows resolve_ascii_path 含む） |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod vad;` 追加 |
| `src/lib.rs` | 変更 | VadProcessor + 定数の pub re-export |
| `src/bin/test-run.rs` | 変更 | `test_vad()` 追加、Stage 5/6 更新 |

## 検証結果

- cargo check: ✅ 通過（sherpa-rs リンク成功）
- cargo test: ✅ 64/64 PASS（既存61 + 新規3）
- cargo run --bin test-run: ✅ Stage 5/6、6セクション表示

## 特記事項

- sherpa-rs / sherpa-rs-sys の追加により初回ビルドが長くなる（onnxruntime のダウンロード含む）
- Windows の resolve_ascii_path テストは winapi 依存のため macOS ではスキップ（3/3 テスト PASS）
- test-run.rs の [VAD] は定数確認のみ。モデルファイルがあれば VadProcessor 初期化テスト可能
