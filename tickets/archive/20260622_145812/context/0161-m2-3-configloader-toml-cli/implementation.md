# 実装サマリ: M2-3 (ticket #161) — ConfigLoader

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 編集 | clap (derive) 追加 |
| src/config/mod.rs | 編集 | AppConfig::from_toml() + 2テスト |
| src/cli.rs | 新規 | clap Cli + parse_args() + 2テスト |
| src/lib.rs | 編集 | pub mod cli; |

## 実装内容

- AppConfig::from_toml(path): read_to_string → from_str → validate()
- Cli struct: -t <config.toml> required argument
- parse_args(): Cli::parse()

## 検証結果

- cargo check: 通過（警告ゼロ）
- cargo clippy -D warnings: 通過
- cargo test: 92/92 通過 + 1 doctest 通過
- cargo fmt: 適用済み
