# M4-3 実装計画

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| `tests/server_integration_test.rs` | 新規 | 結合テスト（5シナリオ） |
| `Cargo.toml` | 編集 | reqwest dev-dependency追加 + 古いSTUB行削除 |

## 実装手順
1. Cargo.toml: reqwest追加 + 古いコメント行削除
2. tests/server_integration_test.rs 作成（5テスト）

## 物理的レビュー方法
cargo check --all-targets → cargo test → cargo fmt --check → cargo clippy

## Boy Scout改善
- Cargo.toml の不要な #[::STUB::] コメント行を削除
