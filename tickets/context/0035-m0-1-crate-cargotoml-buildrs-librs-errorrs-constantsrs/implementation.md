# 実装サマリー: M0-1 Crate 骨組み

## 変更したファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `Cargo.toml` | 新規 | `cargo add` で9依存追加 + [[bin]] + [lib] + コメントアウト6依存 |
| `build.rs` | 新規 | target_os 分岐スケルトン（プリビルド不在時は warning） |
| `src/lib.rs` | 新規 | 必要なモジュール宣言のみ（他はコメントアウトで後続チケット待ち） |
| `src/error.rs` | 新規 | VoiceKitError（6 variant, thiserror）+ インライン SttEngine（仮） |
| `src/constants.rs` | 新規 | MYCUTE から抽出した STT 関連10定数 |
| `src/bin/test-run.rs` | 新規 | Stage 1/6 表示＋後続チケット一覧 |

## 検証結果

- `cargo check`: ✅ 通過（dead_code 警告のみ。10個の定数は後続チケットで使用）
- `cargo test`: ✅ 13/13 PASS（error.rs: 7, constants.rs: 6）
- `cargo run --bin test-run`: ✅ Stage 1/6 表示＋後続チケット一覧を出力
- `cargo fmt`: ✅ 整形済み

## 特記事項

- error.rs の `SttEngine` は M0-1 時点ではインライン定義として仮置き。M0-2 で types.rs が作成されたら `crate::types::SttEngine` に差し替える
- lib.rs の使用例ドキュメントは `rust,ignore` にしている（M0-2 以降で有効化）
- dead_code 警告は全て後続チケットで使用される定数のため、現時点では許容
