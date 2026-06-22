# 計画: M0-1 (ticket #155)

## 要件
crates/anthropx/ の設定システム基盤となる6構造体 + 2enum を定義する。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/anthropx/Cargo.toml | 新規 | package定義 + serde/toml依存 |
| crates/anthropx/src/lib.rs | 新規 | pub mod config; |
| crates/anthropx/src/config/mod.rs | 新規 | 全6構造体 + 2enum + Default impl + テスト19ケース |

## 実装手順
1. Cargo.toml 作成
2. src/lib.rs 作成
3. src/config/mod.rs 作成（型定義 → Default impl → テスト）
4. cargo check + cargo test 確認

## レビュー方法
- cargo check -p anthropx エラーゼロ
- cargo test -p anthropx 全テスト通過
- 翻訳可能性 grep
