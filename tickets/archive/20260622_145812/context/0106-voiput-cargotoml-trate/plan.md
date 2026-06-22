# 実装計画: voiput Cargo.toml への trate 依存追加 (M3-1 / #106)

## 変更ファイル一覧
- `crates/voiput/Cargo.toml`: EDIT — 依存行追加

## 実装手順
1. Cargo.toml に `trate = { path = "../trate" }` を追加
2. cargo check 確認
3. cargo tree 確認

## レビュー方法
- cargo check 成功
- cargo tree に trate 表示
