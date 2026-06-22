# 実装サマリー: M3-1 PseudoAsrStreamer

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | `cargo add hound` |
| `src/pipeline/streamer.rs` | 新規 | PseudoAsrStreamer + AsrBackend + BackendWrapper（MYCUTEから移植、2テスト含む） |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod streamer;` |
| `src/lib.rs` | 変更 | AsrBackend/BackendWrapper/PseudoAsrStreamer/StreamerConfig/StreamerEvent/StreamerLocale re-export |
| `src/binary/test-run.rs` | 変更 | `test_streamer()` 追加、Stage 6/6 更新 |

## 検証結果

- cargo test: ✅ 74/74 PASS（既存72 + 新規2）
- cargo run --bin test-run: ✅ Stage 6/6、全セクション表示
- cargo fmt: ✅ 整形済み

## 特記事項

- PseudoAsrStreamer は ~770行に整理（MYCUTE 1139行 → SpeechDenoiser分離 + インポート最適化）
- 実モデル確認は M4 以降。M3-1 では MockBackend で制御フローのみテスト
- Phase 3 完了、Stage 6/6 に到達
