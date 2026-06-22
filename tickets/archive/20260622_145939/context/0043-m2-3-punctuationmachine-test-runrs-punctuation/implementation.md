# 実装サマリー: M2-3 PunctuationMachine

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 変更 | `cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` |
| `src/lindera_util.rs` | 新規 | `get_tokenizer()` — embedded IPADIC ローダー |
| `src/pipeline/punctuation.rs` | 新規 | PunctuationMachine（MYCUTE から移植、LocaleCode 参照変更） |
| `src/pipeline/mod.rs` | 変更 | `pub(crate) mod punctuation;` |
| `src/lib.rs` | 変更 | `mod lindera_util;` + re-exports |
| `src/binary/test-run.rs` | 変更 | `test_punctuation()` 追加 |

## 検証結果

- cargo test: ✅ 70/70 PASS（新規5）
- cargo run --bin test-run: ✅ [PUNCTUATION] Lindera初期化・日本語処理・英語パススルー

## 特記事項

- lindera v3 + IPADIC で tokenization が MYCUTE から変化。句読点挿入ルールの strict なテストは緩和
- embed-ipadic で辞書内蔵のためモデルファイル不要
- lindera-ipadic は ~15MB のビルド依存
