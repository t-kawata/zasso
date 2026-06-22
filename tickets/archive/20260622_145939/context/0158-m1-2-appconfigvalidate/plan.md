# 計画: M1-2 (ticket #158) — AppConfig::validate

## 要件
AppConfig::validate() を実装。5検証項目を集約的に実行。

## 変更ファイル
| ファイル | 種別 | 内容 |
|---------|------|------|
| src/config/mod.rs | 編集 | impl AppConfig { validate() } + 10テスト |

## 実装手順
1. validate() 実装（api_keys/重複/alias衝突/port/timeoutチェック）
2. 10テスト追加
3. cargo test + cargo clippy 確認

## レビュー方法
- cargo check 警告ゼロ
- cargo test 全76通過
- clippy -D warnings 通過
