# チケット #191 実装計画

## 要件
lib.rs の pub use mistralrs 削除 + pub use server::types 追加 + ドキュメント更新

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| crates/ggufrs/src/lib.rs | 修正 | mistralrs re-export 削除、server::types re-export 追加、doc 更新 |
| crates/ggufrs/tests/ggufrs_api_check.rs | 新規 | 公開API確認テスト |

## 実装手順
1. lib.rs: mistralrs re-export ブロック削除
2. lib.rs: server::types re-export 追加
3. lib.rs: ドキュメントコメント更新
4. tests/ggufrs_api_check.rs 作成
5. cargo check 確認
6. cargo test --lib 確認
7. mistralrs 非公開の手動確認

## 物理的レビュー方法
- run-quality-checks.js
- 翻訳可能性 grep
- cargo test --lib
- cargo clippy -p ggufrs -- -D warnings

## リスク
- server::types の利用側との競合は cargo check で検出可能
- このチケットで新たなスタブは発生しない
