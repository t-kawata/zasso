# 計画: M2-3 (ticket #161) — ConfigLoader

## 要件
AppConfig::from_toml() + cli::parse_args() with clap

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 編集 | clap 追加 |
| src/config/mod.rs | 編集 | from_toml() 追加 |
| src/cli.rs | 新規 | clap Cli + parse_args + 2テスト |
| src/lib.rs | 編集 | pub mod cli; |

## 実装手順
1. Cargo.toml 編集
2. config/mod.rs: from_toml() 追加
3. cli.rs 作成
4. lib.rs 編集
5. cargo test + cargo clippy 確認
