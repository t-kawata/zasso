# M6-8: inference/raw.rs 削除 — 実装サマリー

## 変更ファイル

| ファイル | 変更 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/inference/mod.rs` | 1行削除 | 20行目の `// pub mod raw;  // [::STUB::] M6-8:` を削除 |

## 検証結果

- **スタブ解決**: ✅ `inference/mod.rs:20` の M6-8 スタブが検出されなくなった（8→7件）
- **ファイル記述**: ✅ `pub mod raw` の記述が完全に除去された
- **翻訳可能性**: ✅ コメント行削除のみで、コードの翻訳可能性に影響なし
- **品質チェック**: ✅ 新規 issue 0件（全29件は事前存在の問題）
- **コンパイル**: ⚠️ M6-9 の事前存在エラーにより `cargo check` は全面パスしない（server/openai.rs, server/router.rs の `send_raw` 参照）

## コンパイルエラーの内訳（本チケット非スコープ）

| エラー | ファイル | 原因 | 担当 |
|-------|---------|------|------|
| `send_raw` not found (2箇所) | `server/openai.rs:76,137` | M6-5でsend_raw削除済みだが、server側が追随していない | M6-9 |
| `expect_send_raw` not found (4箇所) | `server/router.rs:154,257,317,370` | MockEngineにsend_rawが存在しない | M6-9 |
| `gbnf` crate not found | `inference/generate.rs:243` | gbnf_integration feature未定義 | M6-11 |

上記エラーは全て本チケット以前から存在する問題であり、本チケットの変更では一切影響していない。
