# 実装計画: trate クレートのモックベース単体テスト (M1-3 / #100)

## 変更ファイル一覧
- `crates/trate/src/lib.rs`: EDIT — #[cfg(test)] mod tests 追加

## 実装手順
1. lib.rs 末尾にテストモジュール追加（MockBackend, MockLocalBackend, 7 tests）
2. cargo test で全テスト通過確認

## レビュー方法
- cargo test 全7件通過
- cargo check 成功
- run-quality-checks.js
- 翻訳可能性チェック
