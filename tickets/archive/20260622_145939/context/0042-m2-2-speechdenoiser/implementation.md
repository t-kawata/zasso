# 実装サマリー: M2-2 SpeechDenoiser

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/pipeline/denoiser.rs` | 新規 | SpeechDenoiser struct（MYCUTE pseudo_asr_streamer.rs から抽出） |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod denoiser;` |
| `src/lib.rs` | 変更 | `pub use pipeline::denoiser::SpeechDenoiser;` |

## 検証結果

- cargo check: ✅ 通過
- cargo test: ✅ 65/65 PASS
- cargo run --bin test-run: ✅ Stage 5/6、通常通り

## 特記事項

- 実モデルを使ったノイズ除去テストは M3-1 [STREAMER] で実施
- GTCRN モデル (gtcrn.onnx) は build.rs により既に `models/` に配置済み
- sherpa-rs-sys は M2-1 で追加済み
