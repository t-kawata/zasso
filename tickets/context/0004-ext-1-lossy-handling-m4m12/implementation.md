# 実装サマリ: EXT-1 Lossy handling 完全対応（Phase 1）

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/anthropx/src/provider/translate.rs` | 改修 | 準備的リファクタリング |
| `crates/anthropx/tests/mock_server.rs` | 修正 | clippy len_zero 警告修正（Boy Scout） |

## 実装内容

### Phase 1: 準備的リファクタリング

1. **`HEADER_CONTENT_TYPE` 定数追加**: `"content-type"` リテラル文字列を名前付き定数に抽出（3箇所置き換え）
2. **`record_lossy_event()` 関数追加**: `record_lossy()` + `Span::current().record("lossy_applied", true)` + `tracing::warn!` の3操作を統合
3. **`handle_lossy_translation<T>()` 関数抽出**: non-stream / stream 両パスに重複していた lossy マッチングロジックをジェネリック関数に抽出
4. **non-stream path 置き換え**: インライン lossy マッチ → `handle_lossy_translation()` 1行呼び出し
5. **stream path 置き換え**: 同様
6. **5つのユニットテスト追加**: handle_lossy_translation の正常系・異常系・Phase 1 制約確認

### Boy Scout

- `tests/mock_server.rs:718`: `.len() > 0` → `.is_empty()`（clippy `len_zero` 警告修正）

## 検証結果

| 項目 | 結果 |
|------|------|
| cargo check | ✅ Pass |
| cargo test (191 unit + 17 integration) | ✅ 208 passed, 0 failed |
| cargo clippy --all-targets -- -D warnings | ✅ Pass |
| cargo build --no-default-features | ✅ Pass |
| 新規スタブ混入 | ✅ なし |
| 犯罪 | ✅ なし |
| 翻訳可能性 grep | ✅ 問題なし |
