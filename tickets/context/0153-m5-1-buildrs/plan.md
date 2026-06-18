# M5-1 実装計画

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| crates/ggufrs/build.rs | 新規 | モデル自動ダウンロード（~60行）|

## 実装手順
1. build.rs 作成（voiput/build.rs を参考）

## 検証方法
- cargo check: コンパイル確認
- cargo test: 既存テスト影響なし確認（159件通過）
- cargo fmt --check + cargo clippy
