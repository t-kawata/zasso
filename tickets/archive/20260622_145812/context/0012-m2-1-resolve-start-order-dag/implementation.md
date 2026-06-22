# M2-1 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/procreg/Cargo.toml` | 依存追加 | `petgraph = "0.8.3"` |
| `crates/procreg/src/graph.rs` | 新規作成 | `resolve_start_order()` + doc コメント + 6テスト |
| `crates/procreg/src/lib.rs` | 修正 | `pub mod graph;`（1行追加） |

## 実装した関数

`pub(crate) fn resolve_start_order(defs: &[ProcessDef]) -> Result<Vec<String>, RegistryError>`
- `petgraph::DiGraph` + `toposort` による DAG 解決
- 不明依存 → `UnknownDependency { src, dep }`
- 循環依存 → `CircularDependency`

## 検証結果

- `cargo check`: 警告ゼロで通過
- `cargo test`: 47/47 通過（既存41 + M2-1:6、0.00s）
- 品質チェック: issue 0
- 翻訳可能性 grep: 問題なし
- `lib.rs` 変更: 1行追加のみ（surgical diff 遵守）
