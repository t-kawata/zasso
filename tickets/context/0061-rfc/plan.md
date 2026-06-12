# 計画: #61 RFC整合性修正 — ドキュメント更新＋軽微な実装修正

## 要件
`docs/rfc-stt-portable-crate.md` と実装の間にある13項目の乖離を解消する。

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| docs/rfc-stt-portable-crate.md | 更新 | 全§を実装に合わせて更新（§4.3,6.1,6.2,7.6,8,9 + 全体表記） |
| crates/voiput/README.md | 修正 | MIT License → MIT OR Apache-2.0 License |
| crates/voiput/Cargo.toml | 追加 | [package] に include = [...] 設定追加 |

## 実装手順
1. RFC §6.1 build.sh + §6.2 build.ps1 のコードブロック置換
2. RFC §7.6 denoiser.rs を sherpa_onnx safe API 版に置換
3. RFC §8 Cargo.toml 依存更新（sherpa-rs → sherpa-onnx）
4. RFC §9 build.rs を現行概要に置換
5. RFC §4.3 VoiputConfig に model_dir 追加
6. RFC 全体の表記修正（OpenAi→OpenAI, libspeech_helper→libSpeechHelper, channel(256)→channel(100), &mut self→&self）
7. README ライセンス修正 + Cargo.toml include 追加
8. テスト + grep レビュー

## 検証方法
- cargo test --package voiput 全通過
- sherpa_onnx 参照 > 0, sherpa-rs 参照 = 0
- OpenAi（誤）, libspeech_helper（誤）, channel(256) が残っていない
- MIT OR Apache が README にある
- include が Cargo.toml にある
