# 実装サマリー: M2-4 効果音再生

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | `cargo add rodio@0.21 && cargo add lazy_static` |
| `src/wav/piro.wav` | コピー | MYCUTE から |
| `src/wav/commit.wav` | コピー | MYCUTE から |
| `src/audio.rs` | 新規 | Actor パターン + rodio ラッパー（完全移植） |
| `src/lib.rs` | 変更 | `mod audio;` + pub re-exports |
| `src/binary/test-run.rs` | 変更 | `test_audio()` 追加（init + play） |

## 検証結果

- cargo test: ✅ 72/72 PASS（新規2）
- cargo run --bin test-run: ✅ [AUDIO] init + play 成功
- rodio: 0.21 に固定（MYCUTE 互換性のため）
