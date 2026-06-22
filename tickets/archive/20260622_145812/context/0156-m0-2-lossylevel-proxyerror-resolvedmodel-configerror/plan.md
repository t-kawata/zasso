# 計画: M0-2 (ticket #156)

## 要件
LossyLevel / ProxyError / ConfigError / ResolvedModel を定義する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| Cargo.toml | 編集 | thiserror + http 依存追加 |
| src/config/mod.rs | 編集 | 型定義4件 + テスト25ケース追加 |

## 実装手順
1. Cargo.toml 依存追加
2. config/mod.rs に型定義追加（LossyLevel, ResolvedModel, ProxyError, ConfigError）
3. テスト25ケース追加
4. cargo check + cargo test + cargo clippy 確認

## レビュー方法
- cargo check -p anthropx 警告ゼロ
- cargo test -p anthropx 全44テスト通過
- cargo clippy -D warnings 通過
- 翻訳可能性 grep
